// File: src/components/BotList.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';
import { useFreqtradeWS } from '~/lib/hooks/useFreqtradeWS';
import { useStore } from '@nanostores/react';
import { authStore } from '~/lib/stores/auth';
import { AuthDialog } from '../auth/AuthDialog';
import { APA_DOMAIN } from '~/lib/api/routing';
import { sanitizeLogs, desanitizeLogsForAI } from '~/utils/content-sanitizer';
import { BotConfigForm } from './BotConfigForm';
import { useK8sStatusWS } from '~/lib/hooks/useK8sStatusWS';

export interface BotConfiguration {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  chat_id?: string;
}

// Fast row metrics type (replicated from BotDashboard pattern)
type RowMetrics = {
  phase?: 'Running' | 'Pending' | 'NotFound' | 'Deploying' | 'Failed' | string;
  ready: boolean;
  running: boolean;
  hasError: boolean;
  openTradesCount: number | null;
  isLoading?: boolean;
  // badge metadata
  updatedAtMs?: number;
  updatedFrom?: 'cache' | 'network' | 'socket' | 'rest';
};

export function BotList() {
  const [configurations, setConfigurations] = useState<BotConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useStore(authStore);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [strategyChatIds, setStrategyChatIds] = useState<Record<string, string>>({});
  const [showingLogs, setShowingLogs] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [loadingStatuses, setLoadingStatuses] = useState<Record<string, boolean>>({});
  const [rowMetrics, setRowMetrics] = useState<Record<string, RowMetrics>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  // Split TTL caches: status/health vs open trades
  const STATUS_TTL_MS = 60_000; // 60s
  const TRADES_TTL_MS = 15_000; // 15s
  type StatusCache = { phase: RowMetrics['phase']; ready: boolean; running: boolean; hasError: boolean };
  type TradesCache = { openTradesCount: number | null };
  const statusCacheRef = useRef<Record<string, { data: StatusCache; ts: number }>>({});
  const tradesCacheRef = useRef<Record<string, { data: TradesCache; ts: number }>>({});

  // 🚦 NEW: deployment holds to avoid flipping back to NotFound right after deploy
  const deployHoldRef = useRef<Record<string, number>>({}); // key: config.id -> holdUntil timestamp (ms)

  // PATCH: unified host resolver (backend rule: only binanceus => US, everything else => EU)
  const apiHostForExchange = (name?: string) => {
    const n = (name || '').trim().toLowerCase();
    return n === 'binanceus' ? 'https://10xtraders.ai' : 'https://eu.10xtraders.ai';
  };

  // Helper to make API calls
  const apiFetch = (path: string, options?: RequestInit, exchangeNameParam?: string) => {
    if (path.startsWith('/apa/')) return fetch(path, options);
    const base = apiHostForExchange(exchangeNameParam);
    const url = path.startsWith('http') ? path : `${base}${path}`;
    return fetch(url, options);
  };

  // Helper function to get exchange name from config (consolidated)
  const getExchangeNameFromConfig = (config: any): string => {
    const exchange = config?.exchange;
    if (typeof exchange === 'string') return exchange;
    if (typeof exchange === 'object' && exchange?.name) return exchange.name;
    return 'binance'; // default to EU (most exchanges)
  };

  // Check authentication on component mount
  useEffect(() => {
    if (!isAuthenticated) {
      setShowAuthDialog(true);
    }
  }, [isAuthenticated]);

  // pagination
  const [currentPage, setCurrentPage] = useState(1);
  const botsPerPage = 10;

  // --- Compute the current page slice BEFORE any effects that depend on it ---
  const indexOfLastBot = currentPage * botsPerPage;
  const indexOfFirstBot = indexOfLastBot - botsPerPage;
  const currentBots = configurations.slice(indexOfFirstBot, indexOfLastBot);
  const totalPages = Math.max(1, Math.ceil(configurations.length / botsPerPage));

  // fetch configs
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        
        // Double-check authentication
        if (!isAuthenticated) {
          setLoading(false);
          return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setShowAuthDialog(true);
          setLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from('bot_configurations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setConfigurations(data || []);

        // Fetch chat_ids for all strategies
        if (data && data.length > 0) {
          const strategyNames = data
            .map(config => config.config?.strategy)
            .filter(Boolean);

          if (strategyNames.length > 0) {
            console.log('[BotList] Fetching chat_ids for strategies:', strategyNames);
            
            // Set loading state for chat IDs
            const newLoadingState: Record<string, boolean> = {};
            data.forEach(config => {
              if (config.config?.strategy) {
                newLoadingState[config.id] = true;
              }
            });
            setLoadingStatuses(newLoadingState);

            const { data: scriptsData, error: scriptsError } = await supabase
              .from('trading_scripts')
              .select('name, chat_id')
              .eq('user_id', user.id)
              .in('name', strategyNames);

            if (scriptsError) {
              console.error('[BotList] Error fetching chat_ids:', scriptsError);
            } else if (scriptsData) {
              console.log('[BotList] Retrieved chat_ids:', scriptsData);

              const chatIdMap: Record<string, string> = {};
              scriptsData.forEach(script => {
                if (script.chat_id) {
                  chatIdMap[script.name] = script.chat_id;
                  console.log(`[BotList] Strategy "${script.name}" -> Chat ID: ${script.chat_id}`);
                }
              });

              setStrategyChatIds(chatIdMap);
              
              // Clear loading state for chat IDs
              setLoadingStatuses(prev => {
                const cleared = { ...prev };
                data.forEach(config => {
                  delete cleared[config.id];
                });
                return cleared;
              });
            }
          }
        }
      } catch {
        toast.error('Failed to load bot configurations');
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated]);

  // 🔄 Live K8s status stream (parent; subscribe to ALL known namespaces) + verbose logs
  useK8sStatusWS({
    namespaces: configurations
      .map(c => c.config?.strategy)
      .filter(Boolean) as string[],
    enabled: isAuthenticated && configurations.length > 0,
    onEvent: (msg) => {
      const d = msg?.data;
      if (!d?.namespace) {
        console.debug('[K8sWS]', new Date().toISOString(), 'Event dropped (no namespace):', msg);
        return;
      }

      console.groupCollapsed(
        `%c[K8sWS]%c ${d.namespace} %cstatus:event`,
        'color:#60a5fa;font-weight:bold',
        'color:inherit',
        'color:#a3a3a3'
      );
      console.debug('🕒 ts:', d.ts || Date.now(), new Date((d.ts || Date.now()) * 1000).toISOString());
      console.debug('↩︎ raw:', msg);

      setRowMetrics(prev => {
        // find config id for this namespace
        const cfg = configurations.find(c => c.config?.strategy === d.namespace);
        if (!cfg) {
          console.debug('⚠️ No matching config found for namespace:', d.namespace);
          console.groupEnd();
          return prev;
        }

        const cur = prev[cfg.id];

        // 🚦 honor deploy hold: ignore NotFound/DELETED while hold is active
        const holdUntil = deployHoldRef.current[cfg.id] || 0;
        const holdActive = Date.now() < holdUntil;

        const incomingDeleted = !!d.deleted;
        const incomingPhase = d.phase || (incomingDeleted ? 'NotFound' : cur?.phase);
        const incomingReady = incomingDeleted ? false : !!d.ready;
        const incomingRunning = incomingDeleted ? false : !!d.running;
        const incomingHasErr = incomingDeleted ? false : !!d.hasError;

        if (holdActive && (incomingDeleted || incomingPhase === 'NotFound')) {
          console.debug('⏸️ WS NotFound during deploy hold → suppressed');
          console.groupEnd();
          return prev;
        }

        const nextPhase   = incomingPhase || cur?.phase || 'NotFound';
        const nextReady   = incomingReady;
        const nextRunning = incomingRunning;
        const nextHasErr  = incomingHasErr;

        // diff logs
        console.table({
          current: {
            phase: cur?.phase, ready: cur?.ready, running: cur?.running, hasError: cur?.hasError
          },
          incoming: {
            phase: nextPhase, ready: nextReady, running: nextRunning, hasError: nextHasErr
          }
        });

        // clear hold when we see any concrete pod state (not NotFound)
        if (nextPhase !== 'NotFound') {
          delete deployHoldRef.current[cfg.id];
        }

        // skip if nothing changed
        if (cur &&
            cur.phase === nextPhase &&
            cur.ready === nextReady &&
            cur.running === nextRunning &&
            cur.hasError === nextHasErr) {
          console.debug('✓ No change → skipping state update');
          console.groupEnd();
          return prev;
        }

        console.debug('⬆︎ Applying update for row:', cfg.id);
        console.groupEnd();

        return {
          ...prev,
          [cfg.id]: {
            ...(cur || { openTradesCount: null }),
            phase: nextPhase,
            ready: nextReady,
            running: nextRunning,
            hasError: nextHasErr,
            isLoading: false,
            updatedAtMs: Date.now(),
            updatedFrom: 'socket',
          }
        };
      });
    }
  });

  // Single fast metrics fetch with split TTLs + AbortController
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    
    // Set initial loading state for all current bots
    if (initialLoading && currentBots.length > 0) {
      const loadingMetrics: Record<string, RowMetrics> = {};
      currentBots.forEach((cfg) => {
        loadingMetrics[cfg.id] = {
          phase: undefined,
          ready: false,
          running: false,
          hasError: false,
          openTradesCount: null,
          isLoading: true,
          updatedAtMs: Date.now(),
          updatedFrom: 'cache',
        };
      });
      setRowMetrics(prev => ({ ...prev, ...loadingMetrics }));
    }
    
    (async () => {
      if (!isAuthenticated || currentBots.length === 0) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const bearerAuth = `Bearer ${session.access_token}`;
        const heartbeatInterval = 60;
        const stalenessThreshold = heartbeatInterval * 2; // 120s

        // 1) Hydrate immediately from any fresh cache entries (split TTLs)
        const immediate: Record<string, RowMetrics> = {};
        currentBots.forEach((cfg) => {
          const id = cfg.id;
          const sC = statusCacheRef.current[id];
          const tC = tradesCacheRef.current[id];
          const statusFresh = !!sC && (Date.now() - sC.ts) < STATUS_TTL_MS;
          const tradesFresh = !!tC && (Date.now() - tC.ts) < TRADES_TTL_MS;
          if (statusFresh || tradesFresh) {
            const lastTs = Math.max(
              statusFresh ? sC!.ts : 0,
              tradesFresh ? tC!.ts : 0
            );
            immediate[id] = {
              phase: statusFresh ? sC!.data.phase : undefined,
              ready: statusFresh ? sC!.data.ready : false,
              running: statusFresh ? sC!.data.running : false,
              hasError: statusFresh ? sC!.data.hasError : false,
              openTradesCount: tradesFresh ? tC!.data.openTradesCount : null,
              isLoading: !(statusFresh || tradesFresh),
              updatedAtMs: lastTs,
              updatedFrom: 'cache',
            };
          }
        });
        if (Object.keys(immediate).length && !cancelled && !controller.signal.aborted) {
          setRowMetrics(prev => ({ ...prev, ...immediate }));
        }

        // 2) Fetch only stale/uncached parts per row (endpoints independent)
        const fetchedUpdates: Record<string, RowMetrics> = {};
        await Promise.all(
          currentBots.map(async (cfg) => {
            try {
              const strategy = cfg.config?.strategy;
              if (!strategy) return;
              const exchangeName = getExchangeNameFromConfig(cfg.config);

              const id = cfg.id;
              // Initialize with safe defaults - don't assume running
              let phase: RowMetrics['phase'] | undefined = statusCacheRef.current[id]?.data.phase;
              let ready: boolean = statusCacheRef.current[id]?.data.ready ?? false;
              let running: boolean = statusCacheRef.current[id]?.data.running ?? false;
              let hasError: boolean = statusCacheRef.current[id]?.data.hasError ?? false;
              let openTradesCount: number | null = tradesCacheRef.current[id]?.data.openTradesCount ?? null;

              const statusFresh = !!statusCacheRef.current[id] && (Date.now() - statusCacheRef.current[id]!.ts) < STATUS_TTL_MS;
              const tradesFresh = !!tradesCacheRef.current[id] && (Date.now() - tradesCacheRef.current[id]!.ts) < TRADES_TTL_MS;

              // Fetch only if stale
              if (!statusFresh) {
                console.log('[BotList] Fetching pod status for strategy:', strategy);
                const podStatusRes = await apiFetch(
                  `/apa/podstatus?botName=${strategy}&userId=${session.user.id}`,
                  { headers: { Authorization: bearerAuth }, signal: controller.signal }
                );
                console.log('[BotList] /apa/podstatus?botName:', podStatusRes);
                if (podStatusRes.ok) {
                  try {
                    const podStatus = await podStatusRes.json();

                    // 🚦 honor deploy hold: ignore NotFound while hold is active
                    const holdUntil = deployHoldRef.current[id] || 0;
                    const holdActive = Date.now() < holdUntil;
                    const incomingPhase = (podStatus.phase || 'NotFound') as RowMetrics['phase'];

                    if (holdActive && incomingPhase === 'NotFound') {
                      console.debug('⏸️ REST NotFound during deploy hold → suppressed');
                      // keep prior cached values, but mark not loading
                    } else {
                      ready = podStatus.ready === true;
                      phase = podStatus.phase || 'NotFound';
                      hasError = podStatus.hasError === true;
                      // Only set running if pod is actually ready AND phase is Running
                      running = ready && phase === 'Running';
                      statusCacheRef.current[id] = {
                        data: { phase, ready, running, hasError },
                        ts: Date.now(),
                      };
                      // clear hold if we have a concrete phase other than NotFound
                      if (phase !== 'NotFound') delete deployHoldRef.current[id];
                    }
                  } catch {
                    // On parse error, assume unknown (keep skeleton until WS)
                    hasError = true;
                    phase = undefined;
                    ready = false;
                    running = false;
                  }
                } else {
                  // If API call fails, don't force NotFound immediately; keep skeleton/previous
                  phase = phase ?? undefined;
                  ready = ready ?? false;
                  running = running ?? false;
                }
              }

              if (!tradesFresh) {
                console.log('[BotList] Fetching trades for strategy:', strategy, 'exchange:', exchangeName);
                const statusRes = await fetch(`${apiHostForExchange(exchangeName)}/user/${strategy}/api/v1/status`, {
                  headers: { Authorization: 'Basic ' + btoa(`meghan:${session.user.id}`) }, 
                  signal: controller.signal 
                });
                if (statusRes.ok) {
                  try {
                    const st = await statusRes.json();
                    if (Array.isArray(st)) {
                      openTradesCount = st.length;
                    } else if (st && Array.isArray(st.open_trades)) {
                      openTradesCount = st.open_trades.length;
                    } else {
                      openTradesCount = 0;
                    }
                  } catch {
                    openTradesCount = 0;
                  }
                } else {
                  openTradesCount = 0;
                }
                tradesCacheRef.current[id] = {
                  data: { openTradesCount },
                  ts: Date.now(),
                };
              }

              // STRICT: Only running if phase is explicitly 'Running' AND ready is true
              running = phase === 'Running' && ready === true;

              const data: RowMetrics = {
                phase: phase, // may be undefined while loading; badge handles skeleton
                ready,
                running,
                hasError,
                openTradesCount,
                isLoading: phase === undefined, // keep skeleton if we still don’t know
                updatedAtMs: Date.now(),
                updatedFrom: 'rest',
              };
              fetchedUpdates[id] = data;
            } catch (err: any) {
              if (controller.signal.aborted) return;
              console.error(`[BotList] Error fetching metrics for ${cfg.config?.strategy}:`, err);
              // Don’t force NotFound here; keep skeleton to wait for WS
              fetchedUpdates[cfg.id] = {
                phase: undefined,
                ready: false,
                running: false,
                hasError: true,
                openTradesCount: null,
                isLoading: true,
                updatedAtMs: Date.now(),
                updatedFrom: 'rest',
              };
            }
          })
        );
        if (!cancelled && !controller.signal.aborted) {
          setRowMetrics(prev => ({ ...prev, ...fetchedUpdates }));
        }
        
        // Clear initial loading state after first fetch
        if (initialLoading) {
          setInitialLoading(false);
        }
      } catch (e) {
        console.error('[BotList] Fast metrics fetch failed', e);
        // Clear initial loading state even on error
        if (initialLoading) {
          setInitialLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isAuthenticated, currentBots.length, currentBots.map(c => c.id).join(','), initialLoading]);

  // Optional: prune TTL cache entries that no longer exist in the current configs
  useEffect(() => {
    const ids = new Set(configurations.map(c => c.id));
    const s = statusCacheRef.current;
    const t = tradesCacheRef.current;
    Object.keys(s).forEach(k => { if (!ids.has(k)) delete s[k]; });
    Object.keys(t).forEach(k => { if (!ids.has(k)) delete t[k]; });
  }, [configurations.length]);

  // Track previous status values to detect actual changes
  const prevStatusRef = useRef<Record<string, string>>({});
  // Track previous open trades values to detect actual changes
  const prevOpenTradesRef = useRef<Record<string, number | null>>({});

  // Queue to prevent overwhelming Supabase with simultaneous updates
  const updateQueueRef = useRef<Array<{botId: string, status: string, openTrades: number | null, source: string}>>([]);
  const isProcessingQueueRef = useRef(false);

  // 🔄 Sync ALL status and open_trades changes to database in real-time (from ANY source: REST API, WebSocket, etc.)
  // This effect triggers whenever rowMetrics changes, regardless of source:
  // - REST API fetch on page load/refresh (line 477)
  // - K8s WebSocket updates (line 271)
  // - Freqtrade WebSocket updates (line 972)
  useEffect(() => {
    const updateBotStatusAndTrades = async (botId: string, status: string, openTrades: number | null, source: string) => {
      console.log(`[BotList] 🔵 ENTERED updateBotStatusAndTrades() | Bot: ${botId} | Status: "${status}" | Open Trades: ${openTrades} | Source: ${source}`);
      try {
        console.log(`[BotList] 🔷 About to call supabase.update() for bot ${botId}...`);

        const startTime = Date.now();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Supabase call timeout after 5s')), 5000)
        );

        const updatePromise = supabase
          .from('bot_configurations')
          .update({
            status: status,
            status_updated_at: new Date().toISOString(),
            open_trades: openTrades ?? 0,
            open_trades_updated_at: new Date().toISOString()
          })
          .eq('id', botId)
          .select()
          .single();

        const response = await Promise.race([updatePromise, timeoutPromise]);
        const elapsed = Date.now() - startTime;

        console.log(`[BotList] 🔶 Supabase call completed for bot ${botId} in ${elapsed}ms`);
        console.log(`[BotList] Database update response for bot ${botId}:`, response);

        if (response.error) {
          console.error('[BotList] ❌ Failed to update bot status/trades in database:', response.error);
        } else if (response.data) {
          console.log(`[BotList] ✅ Bot ${botId} synced to DB: Status="${status}", Open Trades=${openTrades} (source: ${source})`, {
            updated_status: response.data.status,
            updated_open_trades: response.data.open_trades,
            status_updated_at: response.data.status_updated_at,
            open_trades_updated_at: response.data.open_trades_updated_at,
            bot_name: response.data.config?.botName || 'N/A'
          });
        } else {
          console.warn('[BotList] ⚠️ No data returned from database update for bot:', botId);
        }
      } catch (err) {
        console.error('[BotList] ❌ Exception updating bot status/trades:', err);
      } finally {
        console.log(`[BotList] 🏁 EXITING updateBotStatusAndTrades() for bot ${botId}`);
      }
    };

    // Update database only when status or open_trades actually change (prevents redundant writes)
    Object.entries(rowMetrics).forEach(([botId, metrics]) => {
      // Skip if still loading OR if no phase info yet
      if (metrics.isLoading) {
        console.debug(`[BotList] Skipping DB update for ${botId}: still loading`);
        return;
      }

      if (!metrics?.phase) {
        console.debug(`[BotList] Skipping DB update for ${botId}: no phase info yet`);
        return;
      }

      // Map phase to status string (consistent with UI display)
      let statusText = 'Not Deployed';
      if (metrics.phase === 'Running' && metrics.ready && metrics.running) {
        statusText = '✅ Running';
      } else if (metrics.phase === 'Deploying') {
        statusText = '🟡 Deploying';
      } else if (metrics.hasError && metrics.phase !== 'Deploying') {
        statusText = '✅ Running';
      } else if (metrics.phase === 'Pending') {
        statusText = '🟡 Pending';
      } else if (metrics.phase === 'NotFound') {
        statusText = 'Not Deployed';
      }

      // Get current open trades count
      const currentOpenTrades = metrics.openTradesCount ?? null;

      // Debug: Log the computed status and trades before comparing
      const prevStatus = prevStatusRef.current[botId];
      const prevOpenTrades = prevOpenTradesRef.current[botId];
      console.debug(`[BotList] Bot ${botId} status/trades check:`, {
        phase: metrics.phase,
        ready: metrics.ready,
        running: metrics.running,
        hasError: metrics.hasError,
        computedStatus: statusText,
        prevStatus: prevStatus,
        currentOpenTrades: currentOpenTrades,
        prevOpenTrades: prevOpenTrades,
        willUpdateStatus: prevStatus !== statusText,
        willUpdateTrades: prevOpenTrades !== currentOpenTrades,
        source: metrics.updatedFrom
      });

      // Only update database if status OR open_trades actually changed
      const statusChanged = prevStatus !== statusText;
      const tradesChanged = prevOpenTrades !== currentOpenTrades;

      if (statusChanged || tradesChanged) {
        const source = metrics.updatedFrom || 'unknown';

        if (statusChanged) {
          console.log(`[BotList] 🔄 Status changed: Bot ${botId} | "${prevStatus || 'initial'}" → "${statusText}" | Source: ${source}`);
          prevStatusRef.current[botId] = statusText;
        }

        if (tradesChanged) {
          console.log(`[BotList] 📊 Open Trades changed: Bot ${botId} | ${prevOpenTrades ?? 'initial'} → ${currentOpenTrades} | Source: ${source}`);
          prevOpenTradesRef.current[botId] = currentOpenTrades;
        }

        // Add to queue instead of calling immediately
        updateQueueRef.current.push({ botId, status: statusText, openTrades: currentOpenTrades, source });
      }
    });

    // Process queue sequentially to avoid overwhelming Supabase
    const processQueue = async () => {
      if (isProcessingQueueRef.current || updateQueueRef.current.length === 0) {
        return;
      }

      isProcessingQueueRef.current = true;
      console.log(`[BotList] 🔄 Processing update queue (${updateQueueRef.current.length} items)...`);

      while (updateQueueRef.current.length > 0) {
        const item = updateQueueRef.current.shift();
        if (item) {
          console.log(`[BotList] 📤 Calling updateBotStatusAndTrades() for bot ${item.botId}...`);
          try {
            await updateBotStatusAndTrades(item.botId, item.status, item.openTrades, item.source);
          } catch (err) {
            console.error(`[BotList] ❌ updateBotStatusAndTrades() failed for bot ${item.botId}:`, err);
          }
          // Small delay between updates to prevent overwhelming Supabase
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      isProcessingQueueRef.current = false;
      console.log(`[BotList] ✅ Queue processing complete`);
    };

    // Start processing the queue
    processQueue();
  }, [rowMetrics]);

  // Function to change page
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  // Close logs modal
  const closeLogs = () => {
    setShowingLogs(false);
    setSelectedStrategy(null);
    setLogs([]);
  };

  const navigate = useNavigate();

  // Show auth dialog if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-bolt-elements-textSecondary mb-4">
            Please sign in to view your trading bots
          </div>
          <AuthDialog 
            isOpen={showAuthDialog} 
            onClose={() => {
              setShowAuthDialog(false);
              navigate('/');
            }}
            mode="signin"
            closeOnOverlayClick={false}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!configurations.length) {
    return (
      <div className="text-center p-8">
        <div className="text-bolt-elements-textSecondary mb-4">
          You don't have any bot configurations yet
        </div>
        <button
          onClick={() => setActiveTab('new')}
          className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
        >
          Create Your First Bot
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex bg-bolt-elements-background-depth-3 p-0.5 rounded-lg shadow-sm">
          <button
            onClick={() => setActiveTab('list')}
            className={classNames(
              "px-3 py-1.5 text-xs font-medium transition-all duration-300 rounded-md relative overflow-hidden",
              activeTab === 'list'
                ? "bg-accent-500 text-white shadow-sm"
                : "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2"
            )}
          >
            <div className="flex items-center gap-1.5 relative z-10">
              <div className="i-ph:list-bullets text-xs" />
              My Trading Bots
            </div>
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={classNames(
              "px-3 py-1.5 text-xs font-medium transition-all duration-300 rounded-md relative overflow-hidden",
              activeTab === 'new'
                ? "bg-accent-500 text-white shadow-sm"
                : "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2"
            )}
          >
            <div className="flex items-center gap-1.5 relative z-10">
              <div className="i-ph:plus-circle text-xs" />
              Create New Bot
            </div>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'list' ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-bolt-elements-background-depth-3">
                {[
                  '#',
                  'Exchange',
                  'Strategy Tuner',
                  'Status',
                  'Open Trades',
                  'Logs',
                  'Last Updated',
                  '',
                ].map(header => (
                  <th
                    key={header}
                    className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bolt-elements-borderColor">
              {currentBots.map((cfg, idx) => (
                <BotRow
                  key={cfg.id}
                  config={cfg}
                  index={indexOfFirstBot + idx + 1}
                  onRemove={(id) => setConfigurations(cs => cs.filter(c => c.id !== id))}
                  strategyChatIds={strategyChatIds}
                  setSelectedStrategy={setSelectedStrategy}
                  setShowingLogs={setShowingLogs}
                  setLogs={setLogs}
                  loadingStatuses={loadingStatuses}
                  metrics={rowMetrics[cfg.id]}
                  setRowMetrics={setRowMetrics}
                  initialLoading={initialLoading}   // <<< pass down so badge can skeletonize
                  deployHoldRef={deployHoldRef}     // <<< pass hold map for row-level logic
                />
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <nav className="flex items-center gap-1">
                <button
                  onClick={() => paginate(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className={classNames(
                    "p-2 rounded-md text-bolt-elements-textSecondary",
                    currentPage === 1
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
                  )}
                >
                  <div className="i-ph:caret-left" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => paginate(n)}
                    className={classNames(
                      "w-8 h-8 flex items-center justify-center rounded-md text-sm",
                      currentPage === n
                        ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                        : "text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
                    )}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className={classNames(
                    "p-2 rounded-md text-bolt-elements-textSecondary",
                    currentPage === totalPages
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
                  )}
                >
                  <div className="i-ph:caret-right" />
                </button>
              </nav>
            </div>
          )}

          {/* Debug: Show real-time metrics (remove this in production) */}
          {import.meta.env.DEV && Object.keys(rowMetrics).length > 0 && (
            <div className="mt-4 p-4 bg-bolt-elements-background-depth-3 rounded-lg">
              <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Debug: Real-time Metrics</h4>
              <pre className="text-xs text-green-500 bg-black p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(rowMetrics, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <BotConfigForm 
          onSave={() => {
            setActiveTab('list');
            // Refresh the configurations list
            window.location.reload();
          }}
          onCancel={() => setActiveTab('list')}
        />
      )}

      {showingLogs && selectedStrategy && configurations.find(c => c.config?.strategy === selectedStrategy) && (
        <LogsModal
          showingLogs={showingLogs}
          logs={logs}
          closeLogs={closeLogs}
          strategyChatIds={strategyChatIds}
          config={configurations.find(c => c.config?.strategy === selectedStrategy)!}
        />
      )}
      
      {/* Auth Dialog for re-authentication if needed */}
      <AuthDialog 
        isOpen={showAuthDialog && isAuthenticated === false} 
        onClose={() => {
          setShowAuthDialog(false);
          navigate('/');
        }}
        mode="signin"
        closeOnOverlayClick={false}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// BotRow: a single row where we can freely call hooks
// -----------------------------------------------------------------------------
function BotRow({
  config,
  index,
  onRemove,
  strategyChatIds,
  setSelectedStrategy,
  setShowingLogs,
  setLogs,
  loadingStatuses,
  metrics,
  setRowMetrics,
  initialLoading,
  deployHoldRef,
}: {
  config: BotConfiguration;
  index: number;
  onRemove: (id: string) => void;
  strategyChatIds: Record<string, string>;
  setSelectedStrategy: (strategy: string | null) => void;
  setShowingLogs: (showing: boolean) => void;
  setLogs: (logs: string[]) => void;
  loadingStatuses: Record<string, boolean>;
  metrics?: RowMetrics;
  setRowMetrics: React.Dispatch<React.SetStateAction<Record<string, RowMetrics>>>;
  initialLoading: boolean;
  deployHoldRef: React.MutableRefObject<Record<string, number>>;
}) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [fetchingLogs, setFetchingLogs] = useState(false);
  const DEPLOY_HOLD_MS = 90_000;
  // Debug log at mount
  const strategyName = config.config?.strategy;
  useEffect(() => {
    console.debug(`[BotRow-MOUNT] ${strategyName}`);
  }, [strategyName]);

  // ⛔️ Removed: broken visibleNamespaces/currentBots usage & per-row useK8sStatusWS.
  // Live status updates now come from the parent BotList's useK8sStatusWS subscription.

  // Helper to make API calls - ALL requests go through main domain
  // Nginx routes to correct upstreams based on path
  const apiFetch = async (path: string, options: RequestInit = {}, exchangeName?: string) => {
    const urlIsAbsolute = path.startsWith('http');
    if (path.startsWith('/apa/')) {
      const url = urlIsAbsolute ? path : `${APA_DOMAIN}${path}`;
      return fetch(url, options);
    }
    const domain = apiHostForExchange(exchangeName);
    const url = urlIsAbsolute ? path : `${domain}${path}`;
    return fetch(url, options);
  };

  // Compute safe variables to avoid TypeScript indexing errors
  const chatId = strategyName ? strategyChatIds[strategyName] : undefined;
  // Use pre-fetched metrics (no spinners)
  const phase = metrics?.phase;
  const ready = !!metrics?.ready;
  const running = !!metrics?.running;
  const openTradesCount = metrics?.openTradesCount ?? null;
  const hasError = !!metrics?.hasError;

  // Only count as "error" when hasError && not yet ready
  const isErrorState = hasError && !ready;

  // Helper to get exchange name from config
  const getExchangeName = (config: BotConfiguration): string => {
    const exchange = config.config?.exchange;
    if (typeof exchange === 'string') return exchange;
    if (typeof exchange === 'object' && exchange?.name) return exchange.name;
    return 'binanceus'; // default to US
  };

  // Fetch logs (used by both Logs and Fine Tune pills)
  const fetchBotLogs = async (strategyName: string) => {
    setFetchingLogs(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      console.log('[BotList] Fetching logs for strategy:', strategyName);

      // Get session for Bearer auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired. Please sign in again');
        return;
      }

      // Use backend's /apa/podlogs endpoint
      const res = await fetch(`/apa/podlogs?botName=${strategyName}&userId=${user.id}&lines=50`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorData = await res.json();
        toast.error(errorData.error || 'Failed to fetch logs');
        return;
      }

      // Backend returns JSON with logs field
      const { logs } = await res.json();
      const sanitized = sanitizeLogs((logs || '').split('\n').filter(l => l.trim()));

      if (!sanitized.length) {
        setLogs(['No logs available for this bot']);
        toast.warning('No logs found for this bot');
      } else {
        setLogs(sanitized);
      }
      setSelectedStrategy(strategyName);
      setShowingLogs(true);
    } catch (e) {
      console.error(e);
      toast.error('Failed to fetch logs');
    } finally {
      setFetchingLogs(false);
    }
  };

  // Start handler
  const handleStartBot = async () => {
    setStarting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error();
      
      const exchangeName = getExchangeName(config);
      const res = await fetch(
        `${apiHostForExchange(exchangeName)}/user/${config.config?.strategy}/api/v1/start`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`meghan:${user.id}`),
            'Content-Type': 'application/json'
          }
        }
      );
      if (!res.ok) throw new Error(await res.text());
      toast.success('Bot started successfully');
    } catch {
      toast.error('Failed to start bot');
    } finally {
      setStarting(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (ready || running) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error('Session expired. Please sign in again');
          return;
        }
        
        const deleteResponse = await fetch(`/apa/deletepod?botName=${strategyName}&userId=${user.id}`, {
          method: 'DELETE'
        });
      }
      await supabase
        .from('bot_configurations')
        .delete()
        .eq('id', config.id);
      toast.success('Bot configuration deleted');
      onRemove(config.id);
    } catch {
      toast.error('Failed to delete bot configuration');
    } finally {
      setDeleting(false);
    }
  };

  // 📡 Runtime Freqtrade WS (per-row) + verbose logs
  useFreqtradeWS({
    strategyName: config.config?.strategy,
    enabled: !!strategyName && metrics?.phase === 'Running' && metrics?.ready === true,
    eventTypes: ['status','startup','entry','entry_fill','exit','exit_fill','warning','strategy_msg'],
    exchangeName: config.config?.exchange?.name,
    onEvent: ev => {
      console.groupCollapsed(
        `%c[FT-WS]%c ${strategyName || config.id} %c${ev?.type || 'unknown'}`,
        'color:#22d3ee;font-weight:bold',
        'color:inherit',
        'color:#a3a3a3'
      );
      console.debug('↩︎ raw:', ev);

      if (ev.type === 'status') {
        const s = ev.data || {};
        const newPhase   = s.status === 'running' ? 'Running' : 'Pending';
        const newReady   = s.status === 'running';
        const newRunning = s.status === 'running';
        const newHasError = s.status === 'error';

        setRowMetrics(prev => {
          const current = prev[config.id];

          console.table({
            current: {
              phase: current?.phase, ready: current?.ready, running: current?.running, hasError: current?.hasError
            },
            incoming: {
              phase: newPhase, ready: newReady, running: newRunning, hasError: newHasError
            }
          });

          if (
            current?.phase === newPhase &&
            current?.ready === newReady &&
            current?.running === newRunning &&
            current?.hasError === newHasError
          ) {
            console.debug('✓ No change → skipping state update');
            console.groupEnd();
            return prev;
          }

          // clear deploy hold on concrete status
          delete deployHoldRef.current[config.id];

          console.debug('⬆︎ Applying status update');
          console.groupEnd();
          return {
            ...prev,
            [config.id]: {
              ...(current || {}),
              phase: newPhase,
              ready: newReady,
              running: newRunning,
              hasError: newHasError,
              isLoading: false,
              updatedAtMs: Date.now(),
              updatedFrom: 'socket'
            }
          };
        });
      } else if (['entry', 'entry_fill', 'exit', 'exit_fill', 'warning', 'strategy_msg', 'startup'].includes(ev.type)) {
        console.debug('⚡ Trade/Msg event → bump timestamp (and refresh open trades if applicable)');

        setRowMetrics(prev => ({
          ...prev,
          [config.id]: {
            ...(prev[config.id] || {}),
            updatedAtMs: Date.now(),
            updatedFrom: 'socket'
          }
        }));

        if (strategyName) {
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) {
              console.warn('[FT-WS] No user available to refresh open trades');
              return;
            }
            const exchangeName = getExchangeName(config);
            apiFetch(
              `/user/${strategyName}/api/v1/status`,
              { headers: { Authorization: 'Basic ' + btoa(`meghan:${user.id}`) } },
              exchangeName
            )
              .then(res => {
                console.debug('↻ Fetch open trades status → HTTP', res.status);
                return res.ok ? res.json() : [];
              })
              .then(data => {
                const count = Array.isArray(data) ? data.length :
                              Array.isArray(data?.open_trades) ? data.open_trades.length : 0;
                console.debug('🧮 Open trades count:', count);
                setRowMetrics(prev => ({
                  ...prev,
                  [config.id]: {
                    ...(prev[config.id] || {}),
                    openTradesCount: count,
                    updatedAtMs: Date.now(),
                    updatedFrom: 'socket'
                  }
                }));
              })
              .catch(err => {
                console.error('[FT-WS] Failed to refresh open trades:', err);
              });
          });
        }

        console.groupEnd();
      } else {
        console.debug('ℹ︎ Unhandled event type:', ev?.type);
        console.groupEnd();
      }
    }
  });

  const handleEdit = () => navigate(`/bots/edit/${config.id}`);
  const handleViewDetails = () => navigate(`/bots/view/${config.config?.strategy}`);

  // Deploy handler
  const handleDeploy = async () => {
    if (!strategyName) return;
    
    // Immediately set status to "Deploying" for instant UI feedback
    setRowMetrics((prev) => ({
      ...prev,
      [config.id]: {
        ...(prev[config.id] || { openTradesCount: null }),
        phase: 'Deploying',
        ready: false,
        running: false,
        hasError: false,
        isLoading: false,
        updatedAtMs: Date.now(),
        updatedFrom: 'rest',
      },
    }));
    // start a deploy hold window to ignore early NotFound
    deployHoldRef.current[config.id] = Date.now() + DEPLOY_HOLD_MS;
    
    try {
      setDeploying(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to deploy bot');
        return;
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired. Please sign in again');
        return;
      }
      
      toast.info('Initializing bot deployment...');
      
      const deploymentUrl = `https://10xtraders.ai/apa/user/kubecheck/${config.user_id}/${strategyName}`;

      console.log('[Deploy] Request URL:', deploymentUrl);
      console.log('[Deploy] Payload:', config.config);

      const response = await fetch(deploymentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && {
            'Authorization': `Bearer ${session.access_token}`,
          }),
        },
        body: JSON.stringify(config.config),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to deploy bot';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json();
            errorMessage = error.error || error.message || errorMessage;
          } else {
            errorMessage = `Server error (${response.status}): ${response.statusText}`;
          }
        } catch (parseError) {
          errorMessage = `Server error (${response.status}): ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      console.log('[BotRow] Deployment result:', result);
      toast.success('Bot deployment initiated');

      // Re-affirm "Deploying" from REST response and extend hold a bit
      if (result?.status === 'deploying') {
        deployHoldRef.current[config.id] = Date.now() + DEPLOY_HOLD_MS;
        setRowMetrics((prev) => ({
          ...prev,
          [config.id]: {
            ...(prev[config.id] || {}),
            phase: 'Deploying',
            ready: false,
            running: false,
            hasError: false,
            isLoading: false,
            updatedAtMs: Date.now(),
            updatedFrom: 'rest',
          },
        }));
      }
      
    } catch (error) {
      console.error('[BotRow] Error deploying bot:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to deploy bot');
      
      // Reset status on error
      delete deployHoldRef.current[config.id];
      setRowMetrics((prev) => ({
        ...prev,
        [config.id]: {
          ...(prev[config.id] || {}),
          phase: 'NotFound',
          ready: false,
          running: false,
          hasError: true,
          isLoading: false,
          updatedAtMs: Date.now(),
          updatedFrom: 'rest',
        },
      }));
    } finally {
      setDeploying(false);
    }
  };

  // ✅ Direct inline badge rendering from rowMetrics (replaces BotDeploymentStatus)
  const statusBadge = (() => {
    const m = metrics;

    // 🧊 Keep skeleton until we have any REST or WS state (initial load or per-row isLoading)
    if (initialLoading || m?.isLoading || !m || m.updatedFrom === 'cache') {
      return (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-bolt-elements-background-depth-3 rounded-full animate-pulse" />
          <div className="w-16 h-4 bg-bolt-elements-background-depth-3 rounded animate-pulse" />
        </div>
      );
    }

    // STRICT: Only show "Running" if phase is explicitly 'Running' AND ready AND running
    if (!m.phase) return 'Not Deployed';
    if (m.phase === 'Deploying') return '🟡 Deploying';
    if (m.hasError && m.phase !== 'Deploying') return '✅ Running';
    if (m.ready && m.running && m.phase === 'Running') return '✅ Running';
    if (m.phase === 'Pending') return '🟡 Pending';
    if (m.phase === 'NotFound') {
      // If a deploy hold is active, still show Deploying
      const holdUntil = deployHoldRef.current[config.id] || 0;
      if (Date.now() < holdUntil) return '🟡 Deploying';
      return 'Not Deployed';
    }
    return 'Not Deployed';
  })();

  return (
    <tr className="hover:bg-bolt-elements-background-depth-2">
      {/* Index */}
      <td className="px-3 py-2 text-xs text-bolt-elements-textPrimary">
        {index}
      </td>

      {/* Exchange */}
      <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
        {config.config?.exchange?.name || 'Not set'}
      </td>

      {/* Strategy (Tuner) */}
      <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
        {loadingStatuses?.[config.id] ? (
          <div className="flex items-center gap-1">
            <div className="i-svg-spinners:90-ring-with-bg animate-spin text-xs text-bolt-elements-textTertiary" />
            <div className="text-xs text-bolt-elements-textTertiary">Loading...</div>
          </div>
        ) : chatId ? (
          <a
            href={`/chat/${chatId}`}
            className="flex items-center gap-1 hover:text-accent-500 hover:underline"
          >
            <div className="i-ph:chat-circle-text-fill text-xs text-accent-500" />
            <div className="whitespace-pre-wrap text-xs">{strategyName}</div>
          </a>
        ) : (
          <div className="whitespace-pre-wrap text-xs">{strategyName ?? '—'}</div>
        )}
      </td>

      {/* ✅ Status Column - Direct inline badge rendering (WebSocket-driven + REST hydration) */}
      <td key={`status-${config.id}-${metrics?.updatedAtMs || 0}`} className="px-3 py-2 text-xs">
        {typeof statusBadge === 'string' ? (
          <span
            className={classNames(
              'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
              {
                'bg-red-500/20 text-red-500': statusBadge.includes('❌'),
                'bg-green-500/20 text-green-500': statusBadge.includes('✅'),
                'bg-yellow-500/20 text-yellow-500': statusBadge.includes('🟡'),
                'bg-amber-500/20 text-amber-500': statusBadge.includes('🛠️'),
                'bg-gray-500/20 text-gray-500': statusBadge === 'Not Deployed',
              }
            )}
          >
            {statusBadge}
          </span>
        ) : (
          statusBadge
        )}
      </td>

      {/* Open Trades */}
      <td className="px-3 py-2 text-xs text-bolt-elements-textPrimary">
        {openTradesCount != null ? (
          <span
            onClick={handleViewDetails}
            className={classNames(
              'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium cursor-pointer',
              openTradesCount > 0
                ? 'bg-blue-500/20 text-blue-500'
                : 'bg-gray-500/20 text-gray-500'
            )}
          >
            {openTradesCount}
          </span>
        ) : (
          <span className="text-bolt-elements-textTertiary">0</span>
        )}
      </td>

      {/* Logs (Tuner) */}
      <td className="px-3 py-2 text-xs">
        {strategyName && (
          <button
            onClick={() => fetchBotLogs(strategyName)}
            disabled={fetchingLogs}
            className={classNames(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              fetchingLogs
                ? "bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary cursor-wait opacity-60"
                : metrics?.hasError && metrics?.phase !== 'Deploying'
                  ? "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30"
                  : "bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-accent-500"
            )}
          >
            {fetchingLogs ? (
              <>
                <div className="i-svg-spinners:90-ring-with-bg animate-spin text-sm" />
                Loading...
              </>
            ) : metrics?.hasError && metrics?.phase !== 'Deploying' ? (
              <>
                🛠️ Check Logs
              </>
            ) : (
              <>
                <div className="i-ph:terminal text-sm relative">
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-[5px] bg-current animate-[blink_1s_infinite]" />
                </div>
                Logs
              </>
            )}
          </button>
        )}
      </td>

      {/* Last Updated */}
      <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
        {metrics?.updatedAtMs ? (
          <span
            className={classNames(
              'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium',
              metrics.updatedFrom === 'cache'
                ? 'bg-gray-500/10 text-gray-400'
                : 'bg-green-500/10 text-green-500'
            )}
            title={new Date(metrics.updatedAtMs).toLocaleString()}
          >
            {new Date(metrics.updatedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : (
          new Date(config.updated_at).toLocaleString()
        )}
      </td>

      {/* Commands */}
      <td className="px-3 py-2 text-xs text-right">
        <div className="flex items-center justify-end space-x-1">
          <button
            onClick={handleViewDetails}
            className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 rounded-md transition-colors"
            title="View details"
          >
            <div className="i-ph:eye-fill text-xl" />
          </button>
          <button
            onClick={handleEdit}
            className="p-1.5 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 rounded-md transition-colors"
            title="Edit configuration"
          >
            <div className="i-ph:pencil-fill text-xl" />
          </button>

          {/* Deploy Button */}
          <button
            onClick={handleDeploy}
            disabled={deploying || running || !config.config?.strategy}
            className={classNames(
              'p-1.5 text-green-500 hover:text-green-600 hover:bg-green-500/10 rounded-md transition-colors',
              (deploying || running || !config.config?.strategy) && 'opacity-50 cursor-not-allowed'
            )}
            title="Deploy bot"
          >
            <div className={classNames(
              deploying ? "i-svg-spinners:90-ring-with-bg" : "i-ph:rocket-launch-fill",
              "text-xl"
            )} />
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className={classNames(
              'p-1.5 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md transition-colors',
              deleting && 'opacity-50 cursor-not-allowed'
            )}
            title="Delete configuration"
          >
            <div
              className={classNames(
                'text-xl',
                deleting ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:trash-fill'
              )}
            />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Logs Modal Component
function LogsModal({ 
  showingLogs, 
  logs, 
  closeLogs, 
  strategyChatIds, 
  config 
}: {
  showingLogs: boolean;
  logs: string[];
  closeLogs: () => void;
  strategyChatIds: Record<string, string>;
  config: BotConfiguration;
}) {
  const navigate = useNavigate();

  const handleFineTune = useCallback(async () => {
    const strategyName = config.config?.strategy;
    const chatId = strategyName ? strategyChatIds[strategyName] : undefined;

    console.group('[Fine Tune] Starting fine-tune process');
    console.log('Strategy Name:', strategyName);
    console.log('All Strategy Chat IDs:', strategyChatIds);
    console.log('Matched Chat ID:', chatId);
    console.groupEnd();

    if (chatId) {
      try {
        // Ensure we have logs data
        if (!logs || logs.length === 0) {
          toast.error('No logs available for analysis');
          return;
        }

        // Filter and prepare logs for analysis - be more permissive
        const filtered = logs
          .filter(log => log && typeof log === 'string' && log.trim().length > 0)
          .slice(-50); // Get last 50 logs to avoid overwhelming

        if (filtered.length === 0) {
          toast.error('No valid log entries found for analysis');
          return;
        }

        // Convert logs back to freqtrade format for AI processing
        const desanitizedLogs = desanitizeLogsForAI(filtered);
        const logsText = desanitizedLogs.join('\n');

        const strategyNameSafe = strategyName || 'Unknown Strategy';

        // Create a simple message that just contains the logs
        const fineTuneMessage = `Please analyze these execution logs from my ${strategyNameSafe} trading strategy and rewrite the code noting the logs below:

        Execution Logs (${filtered.length} entries):

        ${logsText}

        Analyze the logs and improve the trading strategy based on the logs.`;

        // Store the message in localStorage with a simple key
        const storageKey = `pendingFineTuneMessage_${chatId}`;
        localStorage.setItem(storageKey, fineTuneMessage);

        // Set a simple flag
        localStorage.setItem('hasPendingFineTune', 'true');

        console.log('[Fine Tune] Stored fine-tune data:', {
          storageKey,
          chatId,
          messageLength: fineTuneMessage.length,
          navigateTo: `/chat/${chatId}`
        });

        // Close the logs modal
        closeLogs();

        // Navigate to the chat using window.location for consistent behavior
        // This matches the Strategy Tuner link navigation method
        window.location.href = `/chat/${chatId}`;

        toast.success(`Logs (${filtered.length} entries) prepared for AI analysis`);
      } catch (error) {
        console.error('[Fine Tune] Error in fine-tune process:', error);
        toast.error('Failed to initiate fine-tuning');
      }
    } else {
      console.error('[Fine Tune] No chat ID found for strategy:', strategyName);
      console.log('[Fine Tune] Available mappings:', strategyChatIds);
      toast.error('No chat associated with this strategy');
    }
  }, [strategyChatIds, config, logs, navigate, closeLogs]);

  if (!showingLogs) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bolt-elements-background-depth-2 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 gap-4">
          <h3 className="text-xl font-semibold text-bolt-elements-textPrimary flex-shrink-0">Bot Logs</h3>

          <button
            onClick={handleFineTune}
            className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover transition-colors flex items-center gap-2"
            disabled={!logs || logs.length === 0}
          >
            <div className="i-ph:robot text-lg" />
            Fine Tune with AI
          </button>

          <button
            onClick={closeLogs}
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          >
            <div className="i-ph:x-circle text-xl" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-bolt-elements-background-depth-3 p-4 rounded font-mono text-xs text-bolt-elements-textSecondary relative">
          {(!logs || logs.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="i-ph:file-text text-4xl text-bolt-elements-textTertiary mb-2" />
                <p className="text-bolt-elements-textTertiary">No logs available</p>
              </div>
            </div>
          )}
          {logs.length > 0 ? (
            logs.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap mb-1 hover:bg-bolt-elements-background-depth-4 px-1 rounded">
                {line}
              </div>
            ))
          ) : null}
        </div>
        <div className="mt-4 text-xs text-bolt-elements-textTertiary text-center">
          {logs.length > 0 && (
            <p>
              Showing {logs.length} log entries • 
              <span className="text-accent-500 ml-1">
                Click "Fine Tune with AI" to analyze these logs and improve your strategy
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}