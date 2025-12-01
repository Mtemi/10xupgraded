import { useStore } from '@nanostores/react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { renderLogger } from '~/utils/logger';
import { Terminal, type TerminalRef } from './terminal/Terminal';
import { BacktestChart } from './BacktestChart';
import { BacktestMetrics } from './BacktestMetrics';
// Removed CollapsibleMenu - using Menu.client.tsx sidebar instead
import { chatStore } from '~/lib/stores/chat';
import { cubicEasingFn } from '~/utils/easings';
import type { BacktestResult } from '~/lib/backtest';
import { useNavigate } from '@remix-run/react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { chatId } from '~/lib/persistence/useChatHistory';
import TradingChart from '~/components/bots/TradingChart';
import { useK8sStatusWS } from '~/lib/hooks/useK8sStatusWS';
import { useFreqtradeWS } from '~/lib/hooks/useFreqtradeWS';

const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 640;
};

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
}

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

const editorSettings: EditorSettings = { tabSize: 2 };

export const Workbench = memo(({ chatStarted, isStreaming }: WorkspaceProps) => {
  renderLogger.trace('Workbench');

  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const theme = useStore(themeStore);
  const showTerminal = useStore(workbenchStore.showTerminal);
  const { showChat } = useStore(chatStore);

  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [showChart, setShowChart] = useState(true);
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [botStatus, setBotStatus] = useState<string>('Not Deployed');
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [botId, setBotId] = useState<string | null>(null);
  const [hasDeployedBot, setHasDeployedBot] = useState(false);
  const [terminalTab, setTerminalTab] = useState<'logs' | 'open-trades' | 'closed-trades'>('logs');
  const terminalRef = useRef<TerminalRef>(null);
  const navigate = useNavigate();
  const currentChatId = useStore(chatId);

  // Live bot data states (BotDashboard approach)
  const [strategyName, setStrategyName] = useState<string>('');
  const [exchangeName, setExchangeName] = useState<string>('');
  const [openTrades, setOpenTrades] = useState<any[]>([]);
  const [closedTrades, setClosedTrades] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [botBalance, setBotBalance] = useState<any>(null);
  const [botProfit, setBotProfit] = useState<any>(null);
  const exchangeNameRef = useRef<string>('');

  // Constants for health check (matching BotDashboard exactly)
  const heartbeatInterval = 60; // seconds (matches Freqtrade internals.heartbeat_interval)
  const stalenessThreshold = heartbeatInterval * 2; // 2x interval = 120s

  // Domain helper (match BotDashboard rule: only binanceus => US, else EU)
  const apiHostForExchange = (name?: string) => {
    const n = (name || '').trim().toLowerCase();
    return n === 'binanceus' ? 'https://10xtraders.ai' : 'https://eu.10xtraders.ai';
  };

  // Wrapper for fetch to route /api/v1 calls via the right domain
  const apiFetch = (path: string, options?: RequestInit, exchangeNameParam?: string) => {
    if (path.startsWith('/apa/')) {
      return fetch(path, options);
    }
    const base = apiHostForExchange(exchangeNameParam);
    const url = path.startsWith('http') ? path : `${base}${path}`;
    return fetch(url, options);
  };

  // Function to sanitize logs - replace 'freqtrade' with '10xtraders'
  const sanitizeLogs = (logs: string[]): string[] => {
    return logs.map(log => log.replace(/freqtrade/gi, '10xtraders'));
  };

  // Fetch bot status using health endpoint (BotDashboard verbatim approach)
  const fetchBotStatus = async (strategy: string, exchange: string): Promise<string> => {
    console.log(`[Workbench-fetchBotStatus] 🚀 CALLED with strategy="${strategy}", exchange="${exchange}"`);

    if (!strategy) {
      console.log(`[Workbench-fetchBotStatus] ❌ No strategy provided, returning "Not Deployed"`);
      return 'Not Deployed';
    }

    if (!exchange) {
      console.log(`[Workbench-fetchBotStatus] ⚠️  No exchange provided, returning "Not Deployed"`);
      return 'Not Deployed';
    }

    try {
      console.log(`[Workbench-fetchBotStatus] 🔐 Getting session...`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log(`[Workbench-fetchBotStatus] ❌ No session, throwing error`);
        throw new Error('No active session');
      }
      console.log(`[Workbench-fetchBotStatus] ✅ Session found, user: ${session.user.id}`);

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      // Use health endpoint to check if bot is running (exact BotDashboard approach)
      console.log(`[Workbench-fetchBotStatus] 🌐 Calling health endpoint: /user/${strategy}/api/v1/health`);
      console.log(`[Workbench-fetchBotStatus] 🌐 Exchange: ${exchange}`);
      console.log(`[Workbench-fetchBotStatus] 🌐 Base URL: ${apiHostForExchange(exchange)}`);

      const healthResponse = await apiFetch(`/user/${strategy}/api/v1/health`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchange);

      console.log(`[Workbench-fetchBotStatus] 📥 Health response status: ${healthResponse.status}`);
      console.log(`[Workbench-fetchBotStatus] 📥 Health response ok: ${healthResponse.ok}`);

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log(`[Workbench-fetchBotStatus] 📊 Health data:`, JSON.stringify(healthData));

        const nowTs = Math.floor(Date.now() / 1000);
        const age = nowTs - healthData.last_process_ts;

        console.log(`[Workbench-fetchBotStatus] ⏰ nowTs: ${nowTs}`);
        console.log(`[Workbench-fetchBotStatus] ⏰ last_process_ts: ${healthData.last_process_ts}`);
        console.log(`[Workbench-fetchBotStatus] ⏰ Heartbeat age: ${age}s (threshold: ${stalenessThreshold}s)`);

        // If heartbeat is fresh, bot is running
        if (age < stalenessThreshold) {
          console.log(`[Workbench-fetchBotStatus] ✅ RESULT: Bot is RUNNING (heartbeat fresh)`);
          return 'Running';
        } else {
          // Heartbeat is stale, bot is stopped or hung
          console.log(`[Workbench-fetchBotStatus] ⚠️  RESULT: Bot is STOPPED (heartbeat stale)`);
          return 'stopped';
        }
      } else {
        // Health check failed, assume bot is not running
        console.log(`[Workbench-fetchBotStatus] ❌ RESULT: Health check failed, bot is stopped`);
        return 'stopped';
      }
    } catch (error) {
      console.error('[Workbench-fetchBotStatus] ❌ ERROR:', error);
      console.error('[Workbench-fetchBotStatus] ❌ ERROR stack:', error instanceof Error ? error.stack : 'No stack');
      return 'error';
    }
  };

  // Fetch live data from API (BotDashboard verbatim approach)
  const fetchLiveData = async (strategy: string, exchange: string) => {
    try {
      console.log(`[Workbench] fetchLiveData called for strategy: ${strategy}, exchange: ${exchange}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('[Workbench] No session, cannot fetch live data');
        return;
      }

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      const authHeader = 'Basic ' + btoa(`${apiUsername}:${apiPassword}`);

      console.log('[Workbench] Fetching live data: open trades, closed trades, logs, balance, profit...');

      // Fetch open trades (from /api/v1/status endpoint - BotDashboard approach)
      const statusRes = await apiFetch(`/user/${strategy}/api/v1/status`, {
        headers: { 'Authorization': authHeader }
      }, exchange);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        console.log('[Workbench] Open trades (status):', statusData);
        const trades = Array.isArray(statusData) ? statusData : [];
        setOpenTrades(trades);
      } else {
        console.error('[Workbench] Failed to fetch open trades:', statusRes.status);
        setOpenTrades([]);
      }

      // Fetch closed trades (from /api/v1/trades endpoint - BotDashboard approach)
      const tradesRes = await apiFetch(`/user/${strategy}/api/v1/trades`, {
        headers: { 'Authorization': authHeader }
      }, exchange);

      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        console.log('[Workbench] All trades:', tradesData);
        const allTrades = Array.isArray(tradesData) ? tradesData : [];
        const closed = allTrades.filter((t: any) => !t.is_open);
        console.log('[Workbench] Closed trades count:', closed.length);
        setClosedTrades(closed);
      } else {
        console.error('[Workbench] Failed to fetch trades:', tradesRes.status);
        setClosedTrades([]);
      }

      // Fetch logs
      const logsRes = await fetch(`/apa/podlogs?botName=${strategy}&userId=${session.user.id}&lines=100`, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        const rawLogs = logsData.logs || '';
        const logLines = rawLogs.split('\n').filter((line: string) => line.trim());
        setLogs(sanitizeLogs(logLines));
        console.log('[Workbench] Logs fetched:', logLines.length, 'lines');
      } else {
        console.error('[Workbench] Failed to fetch logs:', logsRes.status);
      }

      // Fetch balance (BotDashboard verbatim approach)
      const balanceRes = await apiFetch(`/user/${strategy}/api/v1/balance`, {
        headers: { 'Authorization': authHeader }
      }, exchange);

      if (balanceRes.ok) {
        const balanceData = await balanceRes.json();
        console.log('[Workbench] Balance data:', balanceData);

        // Convert to same format as BotDashboard
        const currencies = balanceData.currencies || [];
        const byCurrency: any = {};
        for (const cur of currencies) {
          byCurrency[cur.currency] = {
            free: cur.free,
            used: cur.used,
            total: cur.total
          };
        }
        setBotBalance(byCurrency);
      } else {
        console.error('[Workbench] Failed to fetch balance:', balanceRes.status);
      }

      // Fetch profit (BotDashboard verbatim approach)
      const profitRes = await apiFetch(`/user/${strategy}/api/v1/profit`, {
        headers: { 'Authorization': authHeader }
      }, exchange);

      if (profitRes.ok) {
        const profitData = await profitRes.json();
        console.log('[Workbench] Profit data:', profitData);

        // Normalize format (BotDashboard style)
        const normalized = {
          total_closed_trades: (profitData.winning_trades || 0) + (profitData.losing_trades || 0),
          overall_profit_abs: profitData.profit_all_fiat || profitData.profit_all_coin || 0,
          overall_profit_pct: profitData.profit_all_percent || 0,
          winning_trades: profitData.winning_trades || 0,
          losing_trades: profitData.losing_trades || 0,
          win_rate_pct: profitData.winrate ? profitData.winrate * 100 : 0
        };
        setBotProfit(normalized);
      } else {
        console.error('[Workbench] Failed to fetch profit:', profitRes.status);
      }

      console.log('[Workbench] ✅ Live data fetch completed');
    } catch (error) {
      console.error('[Workbench] Error fetching live data:', error);
    }
  };

  // Start bot function (BotDashboard approach)
  const startBot = async () => {
    if (!strategyName) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      const response = await apiFetch(`/user/${strategyName}/api/v1/start`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);

      if (!response.ok) {
        throw new Error(`Failed to start bot: ${response.status}`);
      }

      toast.success('Bot started successfully');
      setBotStatus('Running');

      // Start fetching live data
      if (strategyName && exchangeName) {
        fetchLiveData(strategyName, exchangeName);
      }
    } catch (error) {
      console.error('[Workbench] Error starting bot:', error);
      toast.error('Failed to start bot');
    }
  };

  // Stop bot function (BotDashboard approach)
  const stopBot = async () => {
    if (!strategyName) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      const response = await apiFetch(`/user/${strategyName}/api/v1/stop`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);

      if (!response.ok) {
        throw new Error(`Failed to stop bot: ${response.status}`);
      }

      toast.success('Bot stopped successfully');
      setBotStatus('stopped');

      // Clear live data
      setOpenTrades([]);
      setClosedTrades([]);
      setLogs([]);
    } catch (error) {
      console.error('[Workbench] Error stopping bot:', error);
      toast.error('Failed to stop bot');
    }
  };

  // ✅ INSTANT: Extract strategy name synchronously when file changes
  useEffect(() => {
    if (selectedFile && selectedFile.endsWith('.py')) {
      const strategy = selectedFile.split('/').pop()?.replace('.py', '') || '';
      console.log('[Workbench] 📝 INSTANT Strategy:', strategy);
      setStrategyName(strategy);
      setIsLoadingStatus(true); // Start loading
    } else {
        setStrategyName('');
      setBotStatus('Not Deployed');
      setIsLoadingStatus(false);
    }
  }, [selectedFile]);

  // ✅ Check status immediately when strategy name is available
  useEffect(() => {
    if (!strategyName) return;

    console.log('[Workbench-StatusCheck] 🏥 Strategy ready, checking status for:', strategyName);

    const checkStatus = async () => {
      try {
        console.log('[Workbench-StatusCheck] 🔐 Getting session...');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('[Workbench-StatusCheck] ❌ No session');
          setBotStatus('Not Deployed');
          setIsLoadingStatus(false);
          return;
        }
        console.log('[Workbench-StatusCheck] ✅ Session OK');

        // STRATEGY: Check health endpoint FIRST (faster), then query DB for exchange config
        console.log('[Workbench-StatusCheck] 🏥 Checking health endpoint FIRST...');

        // Try both exchanges in parallel (we don't know which one yet)
        const exchanges = ['binance', 'binanceus'];
        const healthChecks = exchanges.map(async (exchange) => {
          try {
            const apiUsername = 'meghan';
            const apiPassword = session.user.id;
            const url = `/user/${strategyName}/api/v1/health`;
            const fullUrl = `${apiHostForExchange(exchange)}${url}`;

            console.log(`[Workbench-StatusCheck] 🔍 Checking ${exchange} at ${fullUrl}`);

            // Add 3-second timeout to prevent hanging
            const healthPromise = apiFetch(url, {
              headers: { 'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`) }
            }, exchange);

            const timeoutPromise = new Promise<Response>((_, reject) =>
              setTimeout(() => reject(new Error('Health check timeout')), 3000)
            );

            const healthResponse = await Promise.race([healthPromise, timeoutPromise]);

            console.log(`[Workbench-StatusCheck] 📡 ${exchange} response: ${healthResponse.status}`);

            if (healthResponse.ok) {
              const healthData = await healthResponse.json();
              const age = Math.floor(Date.now() / 1000) - healthData.last_process_ts;
              console.log(`[Workbench-StatusCheck] ✅ ${exchange} health: age=${age}s, threshold=${stalenessThreshold}s`);
              return { exchange, isRunning: age < stalenessThreshold, age };
            }
            return { exchange, isRunning: false, age: null };
      } catch (error) {
            console.log(`[Workbench-StatusCheck] ❌ ${exchange} error:`, error);
            return { exchange, isRunning: false, age: null };
          }
        });

        const healthResults = await Promise.all(healthChecks);
        const runningBot = healthResults.find(r => r.isRunning);

        console.log('[Workbench-StatusCheck] 🏥 Health results:', healthResults);

        if (runningBot) {
          // BOT IS RUNNING! Show immediately
          console.log('[Workbench-StatusCheck] ✅ FOUND RUNNING BOT on', runningBot.exchange);
          setBotStatus('✅ Running');
          setExchangeName(runningBot.exchange);
          exchangeNameRef.current = runningBot.exchange;
          setHasDeployedBot(true);
          setIsLoadingStatus(false);
          setTerminalTab('logs');
          fetchLiveData(strategyName, runningBot.exchange);

          // Now query DB in background to get bot ID
          supabase
            .from('bot_configurations')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('name', strategyName)
            .maybeSingle()
            .then(({ data }) => {
              if (data) setBotId(data.id);
            });

          return;
        }

        // No running bot, check DB for configuration
        console.log('[Workbench-StatusCheck] 📊 No running bot, checking DB for config...');

        const { data: botData, error: dbError } = await supabase
          .from('bot_configurations')
          .select('id, config, status')
          .eq('user_id', session.user.id)
          .eq('name', strategyName)
          .maybeSingle();

        if (dbError) {
          console.error('[Workbench-StatusCheck] ❌ DB error:', dbError);
        }

        console.log('[Workbench-StatusCheck] 📊 DB result:', botData);

        if (botData) {
          // Bot config exists but not running
          const config = typeof botData.config === 'string' ? JSON.parse(botData.config) : botData.config;
          const exchange = config?.exchange?.name || config?.exchange || 'binance';
          setBotId(botData.id);
          setHasDeployedBot(true);
          setExchangeName(exchange);
          exchangeNameRef.current = exchange;
          setBotStatus(botData.status || 'Stopped');
          console.log('[Workbench-StatusCheck] ✅ Bot configured but not running:', botData.status);
      } else {
          // No bot config at all
          console.log('[Workbench-StatusCheck] ⚠️ No bot config in DB');
          setHasDeployedBot(false);
          setBotStatus('Not Deployed');
        }

        setIsLoadingStatus(false);
      } catch (error) {
        console.error('[Workbench-StatusCheck] ❌ ERROR:', error);
        setBotStatus('Error');
        setIsLoadingStatus(false);
      }
    };

    checkStatus();
  }, [strategyName]);

  // ✅ PERIODIC HEALTH CHECK (only runs AFTER initial check completes)
  useEffect(() => {
    if (!strategyName || !exchangeName || !hasDeployedBot) {
      return; // Wait for initial check to complete
    }

    console.log('[Workbench-Periodic] ⏰ Starting 30s health checks for:', strategyName);

    const checkHealth = async () => {
      console.log('[Workbench-Periodic] 🔍 Periodic check...');
      const liveStatus = await fetchBotStatus(strategyName, exchangeName);
      const uiStatus = liveStatus === 'Running' ? '✅ Running' :
                      liveStatus === 'stopped' ? 'Stopped' :
                      liveStatus === 'error' ? 'Error' : 'Not Deployed';

      console.log('[Workbench-Periodic] 📊 Status:', uiStatus);
      setBotStatus(uiStatus);

      if (uiStatus === '✅ Running') {
        fetchLiveData(strategyName, exchangeName);
      }
    };

    // Run every 30 seconds (NOT immediately - initial check already done)
    const interval = setInterval(checkHealth, 30000);

    return () => clearInterval(interval);
  }, [strategyName, exchangeName, hasDeployedBot]);

  // Get status badge styling
  console.log('[Workbench] 🎨 Rendering status badge for:', botStatus);
  const getStatusBadge = (status: string) => {
    console.log('[Workbench-StatusBadge] Input status:', status);
    if (status === 'Not Deployed') {
      console.log('[Workbench-StatusBadge] → Returning "Not Deployed" badge');
      return {
        text: 'Not Deployed',
        className: 'bg-gray-500/20 text-gray-400 border-gray-700',
        dotColor: 'bg-gray-500'
      };
    }
    if (status === '✅ Running' || status === 'Running') {
      console.log('[Workbench-StatusBadge] → Returning "✅ Running" badge');
      return {
        text: '✅ Running',
        className: 'bg-green-500/20 text-green-400 border-green-700',
        dotColor: 'bg-green-400 animate-pulse'
      };
    }
    if (status === 'Pending' || status === 'Deploying') {
      return {
        text: '🟡 Deploying',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-700',
        dotColor: 'bg-yellow-400 animate-pulse'
      };
    }
    if (status === 'Failed') {
      return {
        text: '❌ Failed',
        className: 'bg-red-500/20 text-red-400 border-red-700',
        dotColor: 'bg-red-400'
      };
    }
    console.log('[Workbench-StatusBadge] → Returning default badge for:', status);
    return {
      text: status,
      className: 'bg-gray-500/20 text-gray-400 border-gray-700',
      dotColor: 'bg-gray-500'
    };
  };

  const statusBadge = getStatusBadge(botStatus);
  console.log('[Workbench] 🎨 Final status badge:', statusBadge);

  // Track menu state
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const enterThreshold = 40;
      const exitThreshold = 265; // Reduced from 340 (225px + 40px threshold)

      if (event.pageX < enterThreshold) {
        setIsMenuOpen(true);
      } else if (event.pageX > exitThreshold) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const canHideChat = showWorkbench || !showChat;

  const handleLaunchBot = useCallback(() => {
    const fileName = selectedFile?.split('/').pop()?.replace('.py', '');
    if (fileName) {
      navigate(`/bots/new?strategy=${fileName}`);
    } else {
      toast.error('No strategy file selected');
    }
  }, [selectedFile, navigate]);

  const handleBacktestLogs = useCallback((logs: string[]) => {
    if (!showTerminal) {
      workbenchStore.toggleTerminal(true);
    }

    setTimeout(() => {
      if (terminalRef.current) {
        terminalRef.current.clear();
        logs.forEach((log) => {
          terminalRef.current?.write(log + '\r\n');
        });
      }
    }, 100);
  }, [showTerminal]);

  useEffect(() => {
    workbenchStore.setDocuments(files);
  }, [files]);

  // Don't show loading overlay on initial load, only when actually streaming
  useEffect(() => {
    if (isStreaming && currentDocument?.value && currentDocument.value.length > 0) {
      setIsLoadingCode(true);
    } else {
      setIsLoadingCode(false);
    }
  }, [isStreaming, currentDocument]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      console.error('Failed to update file content');
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  const activeFileUnsaved = currentDocument !== undefined && unsavedFiles?.has(currentDocument.filePath);

  return (
    chatStarted && (
      <>
        {/* CollapsibleMenu removed - using Menu.client.tsx sidebar instead */}
        <div className="w-full h-full relative workbench-container">
          <button
            disabled={!canHideChat}
            onClick={() => {
              if (canHideChat) {
                chatStore.setKey('showChat', !showChat);
              }
            }}
            className={`${showChat ? 'size-5 sm:size-6 i-ph:caret-left' : 'size-5 sm:size-6 i-ph:caret-right'} text-gray-400 font-bold hover:text-gray-200 duration-300 z-[100] absolute left-1 sm:left-2 top-[50%]`}
          ></button>

          <div className="w-full h-full p-2 sm:p-4">
            <div className="h-full flex flex-col bg-[#0a0a0a] border border-[#2a2e39] shadow-sm rounded-lg overflow-hidden workbench-inner">
              {/* Main horizontal layout */}
              <PanelGroup direction="horizontal" className="flex-1">
                {/* Left Panel - Code Editor + Chart + Logs */}
                <Panel defaultSize={75} minSize={60}>
                  <PanelGroup direction="vertical">
                    {/* Code Editor */}
                    <Panel defaultSize={25} minSize={15} maxSize={40}>
                      <div className="h-full flex flex-col">
                        <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f0f] border-b border-[#2a2e39]">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-400" />
                              <span className="text-xs text-gray-400">Python</span>
                            </div>
                            <span className="text-xs text-gray-600">•</span>
                            {/* Display strategy name - TRUNCATED to 4 chars for UI space (optics only, full name used in background) */}
                            {strategyName ? (
                              <span
                                className="text-xs font-medium text-bolt-elements-textPrimary cursor-help"
                                title={`Full name: ${strategyName}`}
                              >
                                {strategyName.substring(0, 4)}...
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">{selectedFile?.split('/').pop() || 'No file selected'}</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Launch/re-Launch Bot - COMPACT SIZE */}
                            <button
                              onClick={handleLaunchBot}
                              disabled={!selectedFile}
                              className="px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center gap-0.5 font-medium transition-colors"
                              title={hasDeployedBot ? "Re-launch bot" : "Launch and configure bot"}
                            >
                              <div className="i-ph:rocket-launch text-xs" />
                              <span className="hidden sm:inline">{hasDeployedBot ? 're-Launch' : 'Launch'}</span>
                            </button>

                            {/* Start/Stop buttons - COMPACT SIZE */}
                        {botStatus === '✅ Running' && (
                              <button
                                onClick={stopBot}
                                className="px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-0.5 font-medium transition-colors"
                                title="Stop bot"
                              >
                                <div className="i-ph:stop-circle text-xs" />
                                <span className="hidden sm:inline">Stop</span>
                              </button>
                            )}

                            {(botStatus === 'stopped' || botStatus === 'Not Deployed') && hasDeployedBot && (
                              <button
                                onClick={startBot}
                                className="px-1.5 py-0.5 text-[10px] bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-0.5 font-medium transition-colors"
                                title="Start bot"
                              >
                                <div className="i-ph:play-circle text-xs" />
                                <span className="hidden sm:inline">Start</span>
                              </button>
                            )}

                            {/* Bots Button - COMPACT SIZE */}
                            <button
                              onClick={() => navigate('/bots')}
                              className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-white rounded hover:bg-gray-600 flex items-center gap-0.5 font-medium transition-colors"
                              title="View all bots"
                            >
                              <div className="i-ph:robot text-xs" />
                              <span className="hidden sm:inline">Bots</span>
                            </button>

                            {/* Bot Status Badge - Shows real bot deployment status */}
                            {selectedFile && (
                          isLoadingStatus ? (
                            <div className="px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1.5 border border-gray-700 bg-gray-800/20 animate-pulse">
                              <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                              <span className="hidden sm:inline text-gray-500">Loading...</span>
                            </div>
                          ) : (
                              <div className={classNames(
                                "px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1.5 border",
                                statusBadge.className
                              )}>
                                <div className={classNames("w-2 h-2 rounded-full", statusBadge.dotColor)}></div>
                                <span className="hidden sm:inline">{statusBadge.text}</span>
                              </div>
                          )
                            )}

                            {/* Save/Reset buttons with separator */}
                            {activeFileUnsaved && (
                              <div className="flex gap-1.5 ml-2 pl-2 border-l border-gray-700">
                                <button
                                  onClick={onFileSave}
                                  className="px-2 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                                  title="Save changes"
                                >
                                  <div className="i-ph:floppy-disk text-base" />
                                  <span className="hidden sm:inline text-xs">Save</span>
                                </button>
                                <button
                                  onClick={onFileReset}
                                  className="px-2 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-1"
                                  title="Reset changes"
                                >
                                  <div className="i-ph:arrow-counter-clockwise text-base" />
                                  <span className="hidden sm:inline text-xs">Reset</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 overflow-hidden">
                          <CodeMirrorEditor
                            theme={theme}
                            editable={!isStreaming && currentDocument !== undefined}
                            settings={editorSettings}
                            doc={currentDocument}
                            autoFocusOnDocumentChange={!isMobile()}
                            onScroll={onEditorScroll}
                            onChange={onEditorChange}
                            onSave={onFileSave}
                          />
                        </div>
                      </div>
                    </Panel>

                    <PanelResizeHandle className="h-1 bg-[#2a2e39] hover:bg-blue-500 transition-colors cursor-row-resize" />

                    {/* Chart View */}
                    <Panel defaultSize={40} minSize={25} maxSize={55}>
                      <div className="h-full flex flex-col">
                        <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f0f] border-b border-[#2a2e39]">
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <div className="i-ph:chart-line text-lg text-blue-400" />
                            <span className="font-medium">Live Chart</span>
                          </div>
                        </div>
                        <div className="flex-1 overflow-hidden bg-[#0a0a0a] relative">
                          <BacktestChart
                            pythonCode={currentDocument?.value || ''}
                            symbol="BTC/USDT"
                            onBacktestComplete={setBacktestResult}
                            onLogs={handleBacktestLogs}
                          />
                          {isLoadingCode && (
                            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/90 backdrop-blur-sm z-20">
                              <div className="flex flex-col items-center gap-3">
                                <div className="relative">
                                  <div className="w-16 h-16 rounded-full border-4 border-gray-800 border-t-blue-500 animate-spin" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="i-ph:chart-line text-2xl text-gray-600" />
                                  </div>
                                </div>
                                <div className="text-center">
                                  <p className="text-base font-semibold text-blue-400">Analyzing strategy...</p>
                                  <p className="text-xs text-gray-500 mt-1">Processing market data and indicators</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Panel>

                    <PanelResizeHandle className="h-1 bg-[#2a2e39] hover:bg-blue-500 transition-colors cursor-row-resize" />

                    {/* Logs Panel */}
                    <Panel defaultSize={35} minSize={25} maxSize={50}>
                      <div className="h-full flex flex-col bg-[#0a0a0a] overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f0f] border-b border-[#2a2e39]">
                          <div className="flex items-center gap-3">
                            <div className="i-ph:terminal-window text-lg text-gray-400" />
                            {/* Tabs for terminal views */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setTerminalTab('logs')}
                                className={classNames(
                                  "px-2 py-1 text-xs font-medium rounded transition-colors",
                                  terminalTab === 'logs'
                                    ? "bg-blue-600 text-white"
                                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                                )}
                              >
                                Logs
                              </button>
                              {botStatus === '✅ Running' && (
                                <>
                                  <button
                                    onClick={() => setTerminalTab('open-trades')}
                                    className={classNames(
                                      "px-2 py-1 text-xs font-medium rounded transition-colors",
                                      terminalTab === 'open-trades'
                                        ? "bg-blue-600 text-white"
                                        : "text-gray-400 hover:text-white hover:bg-[#1a1a1a] dark:hover:bg-[#2a2a2a]"
                                    )}
                                  >
                                    Open Trades
                                  </button>
                                  <button
                                    onClick={() => setTerminalTab('closed-trades')}
                                    className={classNames(
                                      "px-2 py-1 text-xs font-medium rounded transition-colors",
                                      terminalTab === 'closed-trades'
                                        ? "bg-blue-600 text-white"
                                        : "text-gray-400 hover:text-white hover:bg-[#1a1a1a] dark:hover:bg-[#2a2a2a]"
                                    )}
                                  >
                                    Closed Trades
                                  </button>
                                </>
                              )}
                            </div>
                            {!isLoadingCode && terminalTab === 'logs' && (
                              <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full border border-green-500/20">Ready</span>
                            )}
                            {isLoadingCode && terminalTab === 'logs' && (
                              <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">Analyzing</span>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          {terminalTab === 'logs' && (
                            <>
                              {botStatus === '✅ Running' && logs.length > 0 ? (
                                <div className="h-full overflow-auto p-4 font-mono text-xs text-gray-300 bg-[#0a0a0a]">
                                  {logs.map((log, idx) => (
                                    <div key={idx} className="mb-1">{log}</div>
                                  ))}
                                </div>
                              ) : (
                                <Terminal
                                  className="h-full"
                                  ref={terminalRef}
                                  onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
                                  onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                                  theme={theme}
                                />
                              )}
                            </>
                          )}

                          {terminalTab === 'open-trades' && botStatus === '✅ Running' && (
                            <div className="h-full overflow-auto p-4 bg-[#0a0a0a]">
                              {openTrades.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead className="text-gray-400 border-b border-gray-700">
                                    <tr>
                                      <th className="text-left py-2">Pair</th>
                                      <th className="text-left py-2">Entry</th>
                                      <th className="text-left py-2">Current</th>
                                      <th className="text-right py-2">Profit %</th>
                                      <th className="text-right py-2">Profit</th>
                                    </tr>
                                  </thead>
                                  <tbody className="text-gray-300">
                                    {openTrades.map((trade) => (
                                      <tr key={trade.trade_id} className="border-b border-gray-800 hover:bg-gray-900">
                                        <td className="py-2">{trade.pair}</td>
                                        <td className="py-2">{trade.open_rate.toFixed(6)}</td>
                                        <td className="py-2">{trade.current_rate?.toFixed(6) || '-'}</td>
                                        <td className={classNames(
                                          "text-right py-2",
                                          (trade.profit_pct || 0) >= 0 ? "text-green-400" : "text-red-400"
                                        )}>
                                          {trade.profit_pct ? `${trade.profit_pct.toFixed(2)}%` : '-'}
                                        </td>
                                        <td className={classNames(
                                          "text-right py-2",
                                          (trade.profit_abs || 0) >= 0 ? "text-green-400" : "text-red-400"
                                        )}>
                                          {trade.profit_abs ? trade.profit_abs.toFixed(2) : '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="text-center text-gray-500 py-8">No open trades</div>
                              )}
                            </div>
                          )}

                          {terminalTab === 'closed-trades' && botStatus === '✅ Running' && (
                            <div className="h-full overflow-auto p-4 bg-[#0a0a0a]">
                              {closedTrades.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead className="text-gray-400 border-b border-gray-700">
                                    <tr>
                                      <th className="text-left py-2">Pair</th>
                                      <th className="text-left py-2">Entry</th>
                                      <th className="text-left py-2">Exit</th>
                                      <th className="text-right py-2">Profit %</th>
                                      <th className="text-right py-2">Profit</th>
                                      <th className="text-left py-2">Reason</th>
                                    </tr>
                                  </thead>
                                  <tbody className="text-gray-300">
                                    {closedTrades.slice(0, 50).map((trade) => (
                                      <tr key={trade.trade_id} className="border-b border-gray-800 hover:bg-gray-900">
                                        <td className="py-2">{trade.pair}</td>
                                        <td className="py-2">{trade.open_rate.toFixed(6)}</td>
                                        <td className="py-2">{trade.close_rate?.toFixed(6) || '-'}</td>
                                        <td className={classNames(
                                          "text-right py-2",
                                          (trade.profit_pct || 0) >= 0 ? "text-green-400" : "text-red-400"
                                        )}>
                                          {trade.profit_pct ? `${trade.profit_pct.toFixed(2)}%` : '-'}
                                        </td>
                                        <td className={classNames(
                                          "text-right py-2",
                                          (trade.profit_abs || 0) >= 0 ? "text-green-400" : "text-red-400"
                                        )}>
                                          {trade.profit_abs ? trade.profit_abs.toFixed(2) : '-'}
                                        </td>
                                        <td className="py-2 text-gray-500">{trade.exit_reason || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="text-center text-gray-500 py-8">No closed trades</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Panel>
                  </PanelGroup>
                </Panel>

                <PanelResizeHandle className="w-1 bg-[#2a2e39] hover:bg-blue-500 transition-colors cursor-col-resize" />

                {/* Right Panel - Backtests */}
                <Panel defaultSize={25} minSize={20} maxSize={40}>
                  <div className="h-full flex flex-col bg-[#0a0a0a]">
                    <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f0f] border-b border-[#2a2e39]">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <div className="i-ph:chart-bar text-lg text-blue-400" />
                        <span className="font-medium">Backtests</span>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                      <BacktestMetrics result={backtestResult} />
                      {isLoadingCode && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/90 backdrop-blur-sm z-10">
                          <div className="flex flex-col items-center gap-3">
                            <div className="relative">
                              <div className="w-12 h-12 rounded-full border-4 border-gray-800 border-t-blue-500 animate-spin" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="i-ph:chart-bar text-xl text-gray-600" />
                              </div>
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-semibold text-blue-400">Analyzing...</p>
                              <p className="text-xs text-gray-500 mt-1">Calculating metrics</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            </div>
          </div>
        </div>
      </>
    )
  );
});

interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" {...props}>
      {children}
    </motion.div>
  );
});
