import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from '@remix-run/react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import { useFreqtradeWS, type FreqtradeEvent } from '~/lib/hooks/useFreqtradeWS';
import { useStore } from '@nanostores/react';
import { themeStore } from '~/lib/stores/theme';
import TradingChart from './TradingChart';
// === Domain helpers (aligned with BotList.tsx) ===
// const getApiDomain = (exchangeName?: string) => {
//   return exchangeName === 'binance' ? 'https://eu.10xtraders.ai' : 'https://10xtraders.ai';
// };

// === Domain helper (match BotList rule: only binanceus => US, else EU) ===
const apiHostForExchange = (name?: string) => {
   const n = (name || '').trim().toLowerCase();
   return n === 'binanceus' ? 'https://10xtraders.ai' : 'https://eu.10xtraders.ai';
 };

// Wrapper for fetch to route /api/v1 calls via the right domain
const apiFetch = (path: string, options?: RequestInit, exchangeNameParam?: string) => {
  // Keep /apa/ endpoints on the main domain (no redirect)
  if (path.startsWith('/apa/')) {
    return fetch(path, options);
  }
  // const base = getApiDomain(exchangeNameParam);
  const base = apiHostForExchange(exchangeNameParam);
  const url = path.startsWith('http') ? path : `${base}${path}`;
  return fetch(url, options);
};


// Function to sanitize logs - replace 'freqtrade' with '10xtraders'
const sanitizeLogs = (logs: string[]): string[] => {
  return logs.map(log => log.replace(/freqtrade/gi, '10xtraders'));
};

// Error tracking to prevent excessive notifications
const errorTracker = {
  trades: 0,
  closedTrades: 0,
  balance: 0,
  profit: 0,
  performance: 0,
  whitelist: 0,
  blacklist: 0,
  locks: 0,
  config: 0,
  stats: 0,
  daily: 0,
  chart: 0,
  resetErrors: () => {
    errorTracker.trades = 0;
    errorTracker.closedTrades = 0;
    errorTracker.balance = 0;
    errorTracker.profit = 0;
    errorTracker.performance = 0;
    errorTracker.whitelist = 0;
    errorTracker.blacklist = 0;
    errorTracker.locks = 0;
    errorTracker.config = 0;
    errorTracker.stats = 0;
    errorTracker.daily = 0;
    errorTracker.chart = 0;
  }
};

// Only show error after multiple consecutive failures
const showErrorToast = (key: keyof typeof errorTracker, message: string) => {
  errorTracker[key]++;
  if (errorTracker[key] === 3) { // Show error after 3 consecutive failures
    toast.error(message);
  }
};

// Reset error count when successful
const resetErrorCount = (key: keyof typeof errorTracker) => {
  (errorTracker as any)[key] = 0;
};

interface BotDashboardProps {}

interface Trade {
  trade_id: number;
  pair: string;
  is_open: boolean;
  open_date: string;
  open_rate: number;
  close_date?: string;
  close_rate?: number;
  stake_amount: number;
  amount: number;
  profit_abs?: number;
  profit_pct?: number;
  profit_ratio?: number;
  exit_reason?: string;
  enter_tag?: string;
  strategy?: string;
  timeframe?: number;
  current_rate?: number;
  [key: string]: any; // For additional properties
}

interface PerformanceItem {
  pair: string;
  profit_pct: number;
  profit_abs: number;
  trade_count: number;
}

interface BotConfig {
  max_open_trades: number;
  stake_currency: string;
  stake_amount: number | string;
  timeframe: string;
  dry_run: boolean;
  exchange: string;
  // exchange: {
  //   name: string;
  //   key?: string;
  //   secret?: string;
  //   [key: string]: any;
  // };
  strategy?: string;
  [key: string]: any;
}

interface BotStats {
  total_closed_trades: number;
  win_rate_pct: number;
  avg_profit_pct: number;
  avg_duration_min: number;
  sell_reason_counts: {
    [key: string]: number;
  };
  [key: string]: any;
}

interface BotProfit {
  total_closed_trades: number;
  overall_profit_abs: number;
  overall_profit_pct: number;
  winning_trades: number;
  losing_trades: number;
  win_rate_pct: number;
  [key: string]: any;
}

interface BotPerformance {
  pair: string;
  trade_count: number;
  profit_pct: number;
  profit_abs: number;
  [key: string]: any;
}

interface BotBalance {
  [currency: string]: {
    free: number;
    used: number;
    total: number;
  };
}

interface DailyProfit {
  date: string;
  profit_abs: number;
  profit_pct: number;
  trades: number;
  [key: string]: any;
}

interface Lock {
  id: number;
  pair: string;
  lock_until: string;
  side: string;
  reason: string;
  [key: string]: any;
}

interface CandleData {
  columns: string[];
  data: any[][];
  pair: string;
  timeframe: string;
  [key: string]: any;
}

const BotDashboard: React.FC<BotDashboardProps> = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useStore(themeStore);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trades' | 'chart' | 'logs'>('dashboard');
  const [strategyName, setStrategyName] = useState<string>('');
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null);
  const [exchangeName, setExchangeName] = useState<string | undefined>(undefined);
  const exchangeNameRef = useRef<string | undefined>(undefined);


  const [botStatus, setBotStatus] = useState<'running' | 'stopped' | 'error'>('stopped');
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [botStats, setBotStats] = useState<BotStats | null>(null);
  const [botProfit, setBotProfit] = useState<BotProfit | null>(null);
  const [botPerformance, setBotPerformance] = useState<BotPerformance[]>([]);
  const [botBalance, setBotBalance] = useState<BotBalance | null>(null);
  const [dailyProfit, setDailyProfit] = useState<DailyProfit[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);

  // Individual loading states for each data section
  const [loadingStates, setLoadingStates] = useState({
    config: true,
    status: true,
    trades: true,
    stats: true,
    performance: true,
    balance: true,
    daily: true,
    whitelist: true,
    blacklist: true,
    locks: true,
    logs: true,
  });
  const [selectedPair, setSelectedPair] = useState<string>('');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('5m');
  const [candleData, setCandleData] = useState<CandleData | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<{[key: string]: boolean}>({});
  const [newBlacklistPair, setNewBlacklistPair] = useState<string>('');
  const [newLockPair, setNewLockPair] = useState<string>('');
  const [newLockDuration, setNewLockDuration] = useState<string>('1h');
  const [newLockReason, setNewLockReason] = useState<string>('manual');
  const [forceBuyPair, setForceBuyPair] = useState<string>('');
  const [forceSellTradeId, setForceSellTradeId] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const logsEndRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactECharts>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Constants for health check
  const heartbeatInterval = 60; // seconds (matches Freqtrade internals.heartbeat_interval)
  const stalenessThreshold = heartbeatInterval * 2; // 2x interval = 120s

  // Pagination states
  const [performancePage, setPerformancePage] = useState(1);
  const [closedTradesPage, setClosedTradesPage] = useState(1);
  const [openTradesPage, setOpenTradesPage] = useState(1);
  const rowsPerPage = 5;

  // Calculate paginated data
  const paginatedPerformance = useMemo(() => {
    const startIndex = (performancePage - 1) * rowsPerPage;
    return botPerformance.slice(startIndex, startIndex + rowsPerPage);
  }, [botPerformance, performancePage]);

  const paginatedClosedTrades = useMemo(() => {
    const startIndex = (closedTradesPage - 1) * rowsPerPage;
    return closedTrades.slice(startIndex, startIndex + rowsPerPage);
  }, [closedTrades, closedTradesPage]);

  const paginatedOpenTrades = useMemo(() => {
    const startIndex = (openTradesPage - 1) * rowsPerPage;
    return openTrades.slice(startIndex, startIndex + rowsPerPage);
  }, [openTrades, openTradesPage]);

  // Calculate total pages
  const totalPerformancePages = Math.ceil(botPerformance.length / rowsPerPage);
  const totalClosedTradesPages = Math.ceil(closedTrades.length / rowsPerPage);
  const totalOpenTradesPages = Math.ceil(openTrades.length / rowsPerPage);

  // Pagination component
  const Pagination = ({ 
    currentPage, 
    totalPages, 
    onPageChange 
  }: { 
    currentPage: number; 
    totalPages: number; 
    onPageChange: (page: number) => void 
  }) => {
    if (totalPages <= 1) return null;
    
    return (
      <div className="flex justify-center mt-4">
        <nav className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
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
          
          <span className="text-sm text-bolt-elements-textSecondary px-2">
            {currentPage} / {totalPages}
          </span>
          
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
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
    );
  };

  // Initialize data
  useEffect(() => {
    if (!id) return;
    
    console.log(`[BotDashboard] Initializing with ID: ${id}`);
    
    const loadBotData = async () => {
      setIsLoading(true);
      try {
        // First try to get the bot configuration from Supabase
        const { data: botConfigRow, error } = await supabase
          .from('bot_configurations')
          .select('*')
          .eq('strategy_slug' as any, id as any)
          .single();

        const configRow = botConfigRow as any;
        if (error) {
          console.error('Error fetching bot config:', error);
          throw error;
        }

        if (!configRow?.config?.strategy) {
          console.error('No strategy found in bot config');
          throw new Error('Invalid bot configuration: No strategy found');
        }

        const strategy = configRow.config.strategy;
        console.log(`[BotDashboard] Found strategy: ${strategy}`);
        setStrategyName(strategy);
        // Derive exchange name early from Supabase config to route API calls correctly
        try {
          const exObj = configRow?.config?.exchange;
          const exName = typeof exObj === 'string' ? exObj : (exObj?.name || exObj?.exchange?.name);
          if (exName && typeof exName === 'string') {
            setExchangeName(exName.toLowerCase());
          }
          // also update the ref immediately so subsequent fetches use the correct domain
          exchangeNameRef.current = exName.toLowerCase();

        } catch {}

        // Show UI immediately after getting strategy - don't wait for all data
        setIsLoading(false);

        // Now fetch all the data in parallel (non-blocking)
        await fetchAllData(strategy);
      } catch (error) {
        console.error('Error initializing bot dashboard:', error);
        toast.error('Failed to load bot data');
        setIsLoading(false);
      }
    };

    loadBotData();

    // Set up periodic refresh
    refreshTimerRef.current = setInterval(() => {
      if (strategyName) {
        console.log(`[BotDashboard] Performing periodic refresh for ${strategyName}`);
        refreshData();
      }
    }, 30000); // Refresh every 30 seconds

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [id]);

  // Scroll to bottom of logs when new logs are added
  useEffect(() => {
    if (logsEndRef.current && activeTab === 'logs') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  // Fetch all data for the bot - using parallel requests for faster loading
  const fetchAllData = async (strategy: string) => {
    setIsRefreshing(true);
    try {
      console.log(`[BotDashboard] Fetching all data for strategy: ${strategy}`);

      // Fetch all data in parallel for much faster loading
      // Using Promise.allSettled ensures one failed request doesn't block others
      await Promise.allSettled([
        fetchBotConfig(strategy),
        fetchBotStatus(strategy),
        fetchOpenTrades(strategy),
        fetchClosedTrades(strategy),
        fetchStats(strategy),
        fetchProfit(strategy),
        fetchPerformance(strategy),
        fetchBalance(strategy),
        fetchDailyProfit(strategy),
        fetchWhitelist(strategy),
        fetchBlacklist(strategy),
        fetchLocks(strategy),
        fetchLogs(strategy),
      ]);

      // If we have open trades and no selected pair yet, select the first one
      if (openTrades.length > 0 && !selectedPair) {
        setSelectedPair(openTrades[0].pair);
      }

      // If we have a selected pair, fetch candle data
      if (selectedPair) {
        fetchCandleData(selectedPair, selectedTimeframe);
      }

      // Set last refresh time
      setLastRefreshTime(new Date());

      // Reset error tracker after successful refresh
      errorTracker.resetErrors();
    } catch (error) {
      console.error('Error fetching all data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Refresh all data
  const refreshData = async () => {
    if (!strategyName) return;
    
    setIsRefreshing(true);
    try {
      await fetchAllData(strategyName);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch bot configuration
  const fetchBotConfig = async (strategy = strategyName) => {
    if (!strategy) return;

    setLoadingStates(prev => ({ ...prev, config: true }));
    try {
      console.log(`[BotDashboard] Fetching bot config for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      const response = await apiFetch(`/user/${strategy}/api/v1/show_config`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);

      if (!response.ok) {
        throw new Error(`Failed to fetch bot config: ${response.status} ${response.statusText}`);
      }

      const config = await response.json() as any;
      console.log('[BotDashboard] Bot raw config keys:', Object.keys(config));
      console.log('– raw.exchange →', config.exchange, typeof config.exchange);

      setBotConfig(config as any);
      resetErrorCount('config');
    } catch (error) {
      console.error('Error fetching bot config:', error);
      showErrorToast('config', 'Failed to load bot configuration');
    } finally {
      setLoadingStates(prev => ({ ...prev, config: false }));
    }
  };

  // Fetch bot status
  const fetchBotStatus = async (strategy = strategyName) => {
    if (!strategy) return;

    setLoadingStates(prev => ({ ...prev, status: true }));
    try {
      console.log(`[BotDashboard] Fetching bot status for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      // Use health endpoint to check if bot is running
      const healthResponse = await apiFetch(`/user/${strategy}/api/v1/health`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      console.log(`[BotDashboard] healthResponse - --- --- ${healthResponse}`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json() as { last_process_ts: number };
        console.log(`[BotDashboard] Health DATA - --- --- ${healthData}`);
        const nowTs = Math.floor(Date.now() / 1000);
        const age = nowTs - healthData.last_process_ts;
        console.log(`[BotDashboard] nowTs- --- --- ${nowTs}`);
        console.log(`[BotDashboard] AGE - --- --- ${age}`);
        
        // If heartbeat is fresh, bot is running
        if (age < stalenessThreshold) {
          setBotStatus('running');
        } else {
          // Heartbeat is stale, bot is stopped or hung
          setBotStatus('stopped');
        }
      } else {
        // Health check failed, assume bot is not running
        setBotStatus('stopped');
      }
      
      // Fetch open trades
      const openTradesResponse = await apiFetch(`/user/${strategy}/api/v1/status`, 
        {
          headers: {
            'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
          }
        },
        exchangeNameRef.current
      );
      
      if (openTradesResponse.ok) {
        const data = await openTradesResponse.json() as any;
        if (Array.isArray(data)) {
          setOpenTrades(data);
        } else if (data?.open_trades && Array.isArray(data.open_trades)) {
          setOpenTrades(data.open_trades);
        } else {
          setOpenTrades([]);
        }
      }
      
      resetErrorCount('trades');
    } catch (error) {
      console.error('Error fetching bot status:', error);
      setBotStatus('error');
    } finally {
      setLoadingStates(prev => ({ ...prev, status: false }));
    }
  };

  // Fetch open trades
  const fetchOpenTrades = async (strategy = strategyName) => {
    if (!strategy) return;

    setLoadingStates(prev => ({ ...prev, trades: true }));
    try {
      console.log(`[BotDashboard] Fetching open trades for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategy}/api/v1/status`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch open trades: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Raw open trades data:', data);
      
      const dataAny = data as any;
      if (Array.isArray(dataAny)) {
        console.log(`[BotDashboard] Setting openTrades from array, length = ${dataAny.length}`);
        setOpenTrades(dataAny);
      } else if (dataAny && typeof dataAny === 'object' && Array.isArray(dataAny.open_trades)) {
        console.log(`[BotDashboard] Setting openTrades from object.open_trades, length = ${dataAny.open_trades.length}`);
        setOpenTrades(dataAny.open_trades);
      } else {
        console.warn('[BotDashboard] Unexpected openTrades format:', dataAny);
        setOpenTrades([]);
      }      
      
      resetErrorCount('trades');
      
      // If no pair is selected yet and we have trades, select the first one for the chart
      if (!selectedPair && Array.isArray(dataAny) && dataAny.length > 0) {
        setSelectedPair(dataAny[0].pair);
        fetchCandleData(dataAny[0].pair, selectedTimeframe);
      }
    } catch (error) {
      console.error('Error fetching open trades:', error);
      // Only show error toast if we've had multiple consecutive failures
      showErrorToast('trades', 'Failed to load open trades');
    } finally {
      setLoadingStates(prev => ({ ...prev, trades: false }));
    }
  };

  // Fetch closed trades
  const fetchClosedTrades = async (strategy = strategyName) => {
    if (!strategy) return;

    setLoadingStates(prev => ({ ...prev, trades: true }));
    try {
      console.log(`[BotDashboard] Fetching closed trades for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategy}/api/v1/trades`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch closed trades: ${response.status} ${response.statusText}`);
      }
      
      const json = await response.json() as any;
      console.log('[BotDashboard] Raw payload:', json);
      
      // Grab the trades array (or default to empty)
      const allTrades = Array.isArray(json?.trades) ? json.trades : [];
      
      // Filter closed trades
      const closedTradesData = allTrades.filter((trade: any) => trade.is_open === false);
      
      console.log('[BotDashboard] closedTradesData:', closedTradesData);

      setClosedTrades(closedTradesData);
      resetErrorCount('closedTrades');
    } catch (error) {
      console.error('Error fetching closed trades:', error);
      showErrorToast('closedTrades', 'Failed to load trade history');
    } finally {
      setLoadingStates(prev => ({ ...prev, trades: false }));
    }
  };

  // Fetch bot statistics
  const fetchStats = async (strategy = strategyName) => {
    if (!strategy) return;

    setLoadingStates(prev => ({ ...prev, stats: true }));
    try {
      console.log(`[BotDashboard] Fetching stats for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategy}/api/v1/stats`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json() as any;
      console.log('[BotDashboard] Bot stats:', data);
      setBotStats(data as any);
      resetErrorCount('stats');
    } catch (error) {
      console.error('Error fetching bot stats:', error);
      showErrorToast('stats', 'Failed to load bot statistics');
    } finally {
      setLoadingStates(prev => ({ ...prev, stats: false }));
    }
  };

  // Fetch profit summary
  // Fetch profit summary
  const fetchProfit = async (strategy = strategyName) => {
    if (!strategy) return;

    setLoadingStates(prev => ({ ...prev, stats: true }));
    try {
      console.log(`[BotDashboard] Fetching profit for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      const resp = await apiFetch(`/user/${strategy}/api/v1/profit`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      if (!resp.ok) throw new Error(`Failed to fetch profit: HTTP ${resp.status}`);

      const payload = await resp.json() as any;
      console.log('[BotDashboard] Profit payload:', payload);

      const prof: BotProfit = {
        total_closed_trades: (payload?.winning_trades ?? 0) + (payload?.losing_trades ?? 0),
        overall_profit_abs: payload?.profit_all_fiat ?? payload?.profit_all_coin ?? 0,
        overall_profit_pct: payload?.profit_all_percent ?? 0,
        winning_trades: payload?.winning_trades ?? 0,
        losing_trades: payload?.losing_trades ?? 0,
        // convert 0.4545 → 45.45%
        win_rate_pct: (payload?.winrate != null ? payload.winrate * 100 : 0),
        ...(payload || {})  // preserve any extra fields you might need
      };

      setBotProfit(prof);
      resetErrorCount('profit');
    } catch (err) {
      console.error('Error fetching profit:', err);
      showErrorToast('profit', 'Failed to load profit data');
    } finally {
      setLoadingStates(prev => ({ ...prev, stats: false }));
    }
  };

  // Fetch performance by pair
  // Fetch performance by pair
  const fetchPerformance = async (strategy = strategyName) => {
    if (!strategy) return;

    setLoadingStates(prev => ({ ...prev, performance: true }));
    try {
      console.log(`[BotDashboard] Fetching performance for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategy}/api/v1/performance`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch performance: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Performance data:', data);
      setBotPerformance(Array.isArray(data) ? data : []);
      resetErrorCount('performance');
    } catch (error) {
      console.error('Error fetching performance:', error);
      showErrorToast('performance', 'Failed to load performance data');
    } finally {
      setLoadingStates(prev => ({ ...prev, performance: false }));
    }
  };

  // Fetch account balance
  const fetchBalance = async (strategy = strategyName) => {
    if (!strategy) return;

    setLoadingStates(prev => ({ ...prev, balance: true }));
    try {
      console.log(`[BotDashboard] Fetching balance for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      const resp = await apiFetch(`/user/${strategy}/api/v1/balance`, {
        headers: { 
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`) 
        }
      }, exchangeNameRef.current);
      if (!resp.ok) throw new Error(`Failed to fetch balance: HTTP ${resp.status}`);

      const payload = await resp.json() as any;
      console.log('[BotDashboard] Balance payload:', payload);

      // Turn currencies[] into { [CUR]: { free, used, total } }
      const byCurrency: { [cur: string]: { free: number; used: number; total: number } } = {};
      if (Array.isArray(payload?.currencies)) {
        payload.currencies.forEach((c: any) => {
          byCurrency[c.currency] = {
            free: c.free,
            used: c.used,
            total: c.total
          };
        });
      }

      setBotBalance(byCurrency);
      resetErrorCount('balance');
    } catch (err) {
      console.error('Error fetching balance:', err);
      showErrorToast('balance', 'Failed to load balance data');
    } finally {
      setLoadingStates(prev => ({ ...prev, balance: false }));
    }
  };

  // Fetch daily profit
  // Fetch daily profit
  const fetchDailyProfit = async (strategy = strategyName) => {
    if (!strategy) return;

    setLoadingStates(prev => ({ ...prev, daily: true }));
    try {
      console.log(`[BotDashboard] Fetching daily profit for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');
  
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
  
      const resp = await apiFetch(`/user/${strategy}/api/v1/daily`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      if (!resp.ok) throw new Error(`Failed to fetch daily profit: HTTP ${resp.status}`);
  
      const raw = await resp.json() as any;
      console.log('[BotDashboard] Daily Profit:', raw);
  
      // Pull the array from raw.data (or fallback to raw or raw.daily)
      const rows: Array<{
        date: string;
        abs_profit: number;
        rel_profit: number;
        trade_count: number;
      }> = Array.isArray(raw.data)
        ? raw.data
        : Array.isArray(raw)
          ? raw
          : Array.isArray(raw.daily)
            ? raw.daily
            : [];
  
      const normalized: DailyProfit[] = rows.map(d => ({
        date: d.date,
        profit_abs: d.abs_profit,
        profit_pct: d.rel_profit * 100,
        trades: d.trade_count,
      }));

      console.log('[PROFIT PROFIT BotDashboard] Normalized Daily Profit:', normalized);
      setDailyProfit(normalized);
      resetErrorCount('daily');
    } catch (err) {
      console.error('Error fetching daily profit:', err);
      showErrorToast('daily', 'Failed to load daily profit data');
    } finally {
      setLoadingStates(prev => ({ ...prev, daily: false }));
    }
  };


  // Fetch whitelist
  const fetchWhitelist = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching whitelist for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategy}/api/v1/whitelist`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch whitelist: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Whitelist:', data);
      setWhitelist(Array.isArray(data) ? data : []);
      resetErrorCount('whitelist');
    } catch (error) {
      console.error('Error fetching whitelist:', error);
      showErrorToast('whitelist', 'Failed to load whitelist');
    }
  };

  // Fetch blacklist
  const fetchBlacklist = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching blacklist for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategy}/api/v1/blacklist`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch blacklist: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Blacklist:', data);
      setBlacklist(Array.isArray(data) ? data : []);
      resetErrorCount('blacklist');
    } catch (error) {
      console.error('Error fetching blacklist:', error);
      showErrorToast('blacklist', 'Failed to load blacklist');
    }
  };

  // Fetch locks
  const fetchLocks = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching locks for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategy}/api/v1/locks`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch locks: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Locks:', data);
      setLocks(Array.isArray(data) ? data : []);
      resetErrorCount('locks');
    } catch (error) {
      console.error('Error fetching locks:', error);
      showErrorToast('locks', 'Failed to load locks');
    }
  };

  // Fetch logs (BotList-style: JSON { logs }, then sanitize + split lines)
  const fetchLogs = async (strategy = strategyName) => {
    if (!strategy) return;

    try {
      console.log(`[BotDashboard] Fetching logs for ${strategy}`);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      const res = await fetch(`/apa/podlogs?botName=${strategy}&userId=${user.id}&lines=100`, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status} ${res.statusText}`);

      // The /apa/podlogs endpoint returns JSON: { logs: "...\n...\n" }
      // Fallback to raw text if server still returns text.
      let raw: string;
      try {
        const json = await res.json() as { logs?: string };
        raw = typeof json?.logs === 'string' ? json.logs : '';
      } catch {
        // older behavior returning plain text
        raw = await res.text();
      }

      const lines = (raw || '')
        .split('\n')
        .filter(l => l.trim());

      // Keep your local sanitize helper to match 10xtraders naming
      const sanitized = sanitizeLogs(lines);

      setLogs(sanitized.length ? sanitized : []);
    } catch (err) {
      console.error('Error fetching logs:', err);
      // Non-blocking: don't toast spam for logs
      setLogs([]);
    }
  };


  // Fetch candle data for chart
  const fetchCandleData = async (pair: string, timeframe: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
  
      const candlesUrl = `/user/${strategyName}/api/v1/pair_candles?pair=${pair}&timeframe=${timeframe.toLowerCase()}&limit=100`;
      
      const response = await apiFetch(candlesUrl, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      }, exchangeNameRef.current);
      
      if (response.ok) {
        const data = await response.json() as any;
        setCandleData(data as any);
      }
    } catch (error) {
      console.error('Error fetching candle data:', error);
    }
  };
  
  // Use Freqtrade WebSocket for real-time candle updates
  useFreqtradeWS({ 
    strategyName, 
    exchangeName,
    enabled: activeTab === 'chart',
    eventTypes: ['candle'] as any,
    onEvent: (ev: any) => {
      console.log('[Freqtrade WS] event', ev);
      if (ev?.type === 'candle') {
        console.log('[WS Candle]', ev);
        // Dispatch a custom event that our TradingViewChart component can listen for
        window.dispatchEvent(new CustomEvent('freqtrade:new_candle', { 
          detail: {
            pair: ev.pair,
            timeframe: ev.timeframe,
            candle: {
              timestamp: ev.ts,
              open: ev.o,
              high: ev.h,
              low: ev.l,
              close: ev.c,
              volume: ev.v
            }
          }
        }));
      }
    },
  });

  // Update chart when selected pair or timeframe changes
  useEffect(() => {
    if (selectedPair && selectedTimeframe) {
      fetchCandleData(selectedPair, selectedTimeframe);
    }
  }, [selectedPair, selectedTimeframe]);

  // Bot control actions
  const startBot = async () => {
    if (!strategyName) return;
    
    setIsActionLoading({...isActionLoading, start: true});
    try {
      console.log(`[BotDashboard] Starting bot ${strategyName}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/start`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to start bot: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Start response:', data);
      
      toast.success('Bot started successfully');
      setBotStatus('running');
      
      // Refresh data after starting
      setTimeout(() => fetchAllData(strategyName), 2000);
    } catch (error) {
      console.error('Error starting bot:', error);
      toast.error('Failed to start bot');
    } finally {
      setIsActionLoading({...isActionLoading, start: false});
    }
  };

  const stopBot = async () => {
    if (!strategyName) return;
    
    setIsActionLoading({...isActionLoading, stop: true});
    try {
      console.log(`[BotDashboard] Stopping bot ${strategyName}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/stop`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to stop bot: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Stop response:', data);
      
      toast.success('Bot stopped successfully');
      setBotStatus('stopped');
      
      // Refresh data after stopping
      setTimeout(() => fetchAllData(strategyName), 2000);
    } catch (error) {
      console.error('Error stopping bot:', error);
      toast.error('Failed to stop bot');
    } finally {
      setIsActionLoading({...isActionLoading, stop: false});
    }
  };

  const reloadConfig = async () => {
    if (!strategyName) return;
    
    setIsActionLoading({...isActionLoading, reload: true});
    try {
      console.log(`[BotDashboard] Reloading config for ${strategyName}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/reload_config`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to reload config: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Reload config response:', data);
      
      toast.success('Configuration reloaded successfully');
      
      // Refresh data after reloading
      setTimeout(() => fetchAllData(strategyName), 2000);
    } catch (error) {
      console.error('Error reloading config:', error);
      toast.error('Failed to reload configuration');
    } finally {
      setIsActionLoading({...isActionLoading, reload: false});
    }
  };

  const stopBuy = async () => {
    if (!strategyName) return;
    
    setIsActionLoading({...isActionLoading, stopbuy: true});
    try {
      console.log(`[BotDashboard] Stopping buys for ${strategyName}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/stopbuy`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to stop buys: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Stop buy response:', data);
      
      toast.success('New trades paused successfully');
    } catch (error) {
      console.error('Error stopping buys:', error);
      toast.error('Failed to pause new trades');
    } finally {
      setIsActionLoading({...isActionLoading, stopbuy: false});
    }
  };

  // Trade management actions
  // const forceBuy = async () => {
  const forceBuy = async (pair: string) => {
    try {
    setIsActionLoading({...isActionLoading, forcebuy: true});
    console.log(`[BotDashboard] Force buying ${pair}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      const response = await apiFetch(`/user/${strategyName}/api/v1/forceenter`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pair, side: 'long' }) // ✅ no replacer
        },
        exchangeNameRef.current                           // ✅ exchange goes here
      );

      
      if (!response.ok) {
        throw new Error(`Failed to force buy: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Force buy response:', data);
      
      toast.success(`Successfully opened position on ${pair}`);
      setForceBuyPair('');
      
      // Refresh open trades
      setTimeout(() => fetchOpenTrades(), 2000);
    } catch (error) {
      console.error('Error force buying:', error);
      toast.error('Failed to open position');
    } finally {
      setIsActionLoading({...isActionLoading, forcebuy: false});
    }
  };

  // Force sell action
  const forceSell = async (tradeId: number) => {
    try {
      console.log(`[BotDashboard] Force selling trade ${tradeId}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/forceexit`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tradeid: tradeId,
          ordertype: 'market'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to force sell: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Force sell response:', data);
      
      toast.success(`Successfully closed trade #${tradeId}`);
      setForceSellTradeId('');
      
      // Refresh trades
      setTimeout(() => {
        fetchOpenTrades();
        fetchClosedTrades();
      }, 2000);
    } catch (error) {
      console.error('Error force selling:', error);
      toast.error('Failed to close position');
    } finally {
      setIsActionLoading({...isActionLoading, forcesell: false});
    }
  };

  const cancelOrder = async (tradeId: number) => {
    if (!strategyName) return;
    
    setIsActionLoading({...isActionLoading, [`cancel_${tradeId}`]: true});
    try {
      console.log(`[BotDashboard] Canceling order for trade ${tradeId}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/trades/${tradeId}/open-order`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to cancel order: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Cancel order response:', data);
      
      toast.success(`Order for trade #${tradeId} canceled`);
      
      // Refresh open trades
      setTimeout(() => fetchOpenTrades(), 2000);
    } catch (error) {
      console.error('Error canceling order:', error);
      toast.error('Failed to cancel order');
    } finally {
      setIsActionLoading({...isActionLoading, [`cancel_${tradeId}`]: false});
    }
  };

  const reloadTrade = async (tradeId: number) => {
    if (!strategyName) return;
    
    setIsActionLoading({...isActionLoading, [`reload_${tradeId}`]: true});
    try {
      console.log(`[BotDashboard] Reloading trade ${tradeId}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/trades/${tradeId}/reload`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to reload trade: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Reload trade response:', data);
      
      toast.success(`Trade #${tradeId} reloaded`);
      
      // Refresh trades
      setTimeout(() => {
        fetchOpenTrades();
        fetchClosedTrades();
      }, 2000);
    } catch (error) {
      console.error('Error reloading trade:', error);
      toast.error('Failed to reload trade');
    } finally {
      setIsActionLoading({...isActionLoading, [`reload_${tradeId}`]: false});
    }
  };

  const deleteTrade = async (tradeId: number) => {
    if (!strategyName) return;
    
    setIsActionLoading({...isActionLoading, [`delete_${tradeId}`]: true});
    try {
      console.log(`[BotDashboard] Deleting trade ${tradeId}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/trades/${tradeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to delete trade: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Delete trade response:', data);
      
      toast.success(`Trade #${tradeId} deleted`);
      
      // Refresh trades
      setTimeout(() => {
        fetchOpenTrades();
        fetchClosedTrades();
      }, 2000);
    } catch (error) {
      console.error('Error deleting trade:', error);
      toast.error('Failed to delete trade');
    } finally {
      setIsActionLoading({...isActionLoading, [`delete_${tradeId}`]: false});
    }
  };

  // Pair management actions
  const addToBlacklist = async () => {
    if (!strategyName || !newBlacklistPair) return;
    
    setIsActionLoading({...isActionLoading, addBlacklist: true});
    try {
      console.log(`[BotDashboard] Adding ${newBlacklistPair} to blacklist`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      const response = await apiFetch(
        `/user/${strategyName}/api/v1/blacklist`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pair: newBlacklistPair }) // ✅ no replacer
        },
        exchangeNameRef.current                              // ✅ exchange goes here
      );
      
      if (!response.ok) {
        throw new Error(`Failed to add to blacklist: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Add to blacklist response:', data);
      
      toast.success(`${newBlacklistPair} added to blacklist`);
      setNewBlacklistPair('');
      
      // Update blacklist
      setBlacklist(Array.isArray(data) ? data : [...blacklist, newBlacklistPair]);
    } catch (error) {
      console.error('Error adding to blacklist:', error);
      toast.error('Failed to add pair to blacklist');
    } finally {
      setIsActionLoading({...isActionLoading, addBlacklist: false});
    }
  };

  const removeFromBlacklist = async (pair: string) => {
    if (!strategyName) return;
    
    setIsActionLoading({...isActionLoading, [`removeBlacklist_${pair}`]: true});
    try {
      console.log(`[BotDashboard] Removing ${pair} from blacklist`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/blacklist`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([pair])
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to remove from blacklist: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Remove from blacklist response:', data);
      
      toast.success(`${pair} removed from blacklist`);
      
      // Update blacklist
      setBlacklist(Array.isArray(data) ? data : blacklist.filter(p => p !== pair));
    } catch (error) {
      console.error('Error removing from blacklist:', error);
      toast.error('Failed to remove pair from blacklist');
    } finally {
      setIsActionLoading({...isActionLoading, [`removeBlacklist_${pair}`]: false});
    }
  };

  const createLock = async () => {
    if (!strategyName || !newLockPair) return;
    
    setIsActionLoading({...isActionLoading, createLock: true});
    try {
      console.log(`[BotDashboard] Creating lock for ${newLockPair}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      // Calculate lock until time based on duration
      const now = new Date();
      let until = new Date(now);
      
      if (newLockDuration.endsWith('m')) {
        until.setMinutes(now.getMinutes() + parseInt(newLockDuration));
      } else if (newLockDuration.endsWith('h')) {
        until.setHours(now.getHours() + parseInt(newLockDuration));
      } else if (newLockDuration.endsWith('d')) {
        until.setDate(now.getDate() + parseInt(newLockDuration));
      }
      
      const untilStr = until.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/locks`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pair: newLockPair,
          until: untilStr,
          side: 'long',
          reason: newLockReason || 'manual'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create lock: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Create lock response:', data);
      
      toast.success(`Lock created for ${newLockPair}`);
      setNewLockPair('');
      setNewLockReason('manual');
      
      // Refresh locks
      fetchLocks();
    } catch (error) {
      console.error('Error creating lock:', error);
      toast.error('Failed to create lock');
    } finally {
      setIsActionLoading({...isActionLoading, createLock: false});
    }
  };

  const deleteLock = async (lockId: number) => {
    if (!strategyName) return;
    
    setIsActionLoading({...isActionLoading, [`deleteLock_${lockId}`]: true});
    try {
      console.log(`[BotDashboard] Deleting lock ${lockId}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await apiFetch(`/user/${strategyName}/api/v1/locks/${lockId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);
      
      if (!response.ok) {
        throw new Error(`Failed to delete lock: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Delete lock response:', data);
      
      toast.success(`Lock #${lockId} deleted`);
      
      // Refresh locks
      fetchLocks();
    } catch (error) {
      console.error('Error deleting lock:', error);
      toast.error('Failed to delete lock');
    } finally {
      setIsActionLoading({...isActionLoading, [`deleteLock_${lockId}`]: false});
    }
  };


  // Format date for display
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch (e) {
      return dateStr;
    }
  };

  // Format number with 2 decimal places
  const formatNumber = (num: number | null | undefined, decimals = 2) => {
    if (num === null || num === undefined) return 'N/A';
    return num.toFixed(decimals);
  };

  // Format percentage
  const formatPercent = (num: number | null | undefined) => {
    if (num === null || num === undefined) return 'N/A';
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  };

  // Get CSS class for profit/loss
  const getProfitClass = (profit: number | null | undefined) => {
    if (profit === null || profit === undefined) return '';
    return profit > 0 ? 'text-green-500' : profit < 0 ? 'text-red-500' : '';
  };

  // Loading skeleton component
  const LoadingSkeleton = ({ className = "" }: { className?: string }) => (
    <div className={classNames("animate-pulse bg-bolt-elements-background-depth-4 rounded", className)}></div>
  );

  // Render dashboard tab
  const renderDashboard = () => {
    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status Card */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Status</h3>
            <div className="flex items-center">
              <div className={classNames(
                "w-3 h-3 rounded-full mr-2",
                botStatus === 'running' ? "bg-green-500" : 
                botStatus === 'stopped' ? "bg-red-500" : "bg-yellow-500"
              )}></div>
              <span className="text-bolt-elements-textSecondary">
                {botStatus === 'running' ? 'Running' : 
                 botStatus === 'stopped' ? 'Stopped' : 'Error'}
              </span>
            </div>
            <div className="mt-2 text-sm text-bolt-elements-textTertiary">
              {botConfig?.dry_run ? 'Dry Run Mode' : 'Live Trading Mode'}
            </div>
          </div>
          
          {/* Profit Card */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Profit</h3>
            {loadingStates.stats ? (
              <div className="space-y-2">
                <LoadingSkeleton className="h-7 w-24" />
                <LoadingSkeleton className="h-4 w-32" />
              </div>
            ) : botProfit ? (
              <div>
                <div className={classNames(
                  "text-xl font-bold",
                  getProfitClass(botProfit.overall_profit_pct)
                )}>
                  {formatPercent(botProfit.overall_profit_pct)}
                </div>
                <div className="text-sm text-bolt-elements-textTertiary">
                  {botProfit.winning_trades || 0} wins / {botProfit.losing_trades || 0} losses
                </div>
              </div>
            ) : (
              <div className="text-bolt-elements-textSecondary">No profit data</div>
            )}
          </div>
          
          {/* Balance Card */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Balance</h3>
            {loadingStates.balance ? (
              <div className="space-y-2">
                <LoadingSkeleton className="h-7 w-32" />
                <LoadingSkeleton className="h-4 w-28" />
              </div>
            ) : botBalance && botConfig?.stake_currency ? (
              <div>
                <div className="text-xl font-bold text-bolt-elements-textPrimary">
                  {formatNumber(botBalance[botConfig.stake_currency]?.total || 0)} {botConfig.stake_currency}
                </div>
                <div className="text-sm text-bolt-elements-textTertiary">
                  Free: {formatNumber(botBalance[botConfig.stake_currency]?.free || 0)} {botConfig.stake_currency}
                </div>
              </div>
            ) : (
              <div className="text-bolt-elements-textSecondary">No balance data</div>
            )}
          </div>
          
          {/* Trades Card */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Trades</h3>
            {loadingStates.trades ? (
              <div className="space-y-2">
                <LoadingSkeleton className="h-7 w-20" />
                <LoadingSkeleton className="h-4 w-24" />
              </div>
            ) : (
              <>
                <div className="text-xl font-bold text-bolt-elements-textPrimary">
                  {openTrades.length} open
                </div>
                <div className="text-sm text-bolt-elements-textTertiary">
                  {closedTrades.length} closed
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Performance by pair */}
        <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Performance by pair</h3>
          {loadingStates.performance ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex justify-between items-center">
                  <LoadingSkeleton className="h-5 w-24" />
                  <LoadingSkeleton className="h-5 w-16" />
                  <LoadingSkeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : botPerformance && botPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bolt-elements-background-depth-4">
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Pair</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Trades</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Profit %</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Profit Abs</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPerformance.map((item, index) => (
                    <tr key={index} className="border-t border-bolt-elements-borderColor">
                      <td className="px-4 py-2 text-bolt-elements-textPrimary">{item.pair}</td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">{item.trade_count}</td>
                      <td className={classNames(
                        "px-4 py-2",
                        item.profit_pct >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {item.profit_pct >= 0 ? '+' : ''}{item.profit_pct.toFixed(2)}%
                      </td>
                      <td className={classNames(
                        "px-4 py-2",
                        item.profit_abs >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {item.profit_abs >= 0 ? '+' : ''}{item.profit_abs.toFixed(6)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination 
                currentPage={performancePage} 
                totalPages={totalPerformancePages} 
                onPageChange={setPerformancePage} 
              />
            </div>
          ) : (
            <div className="text-bolt-elements-textSecondary">No performance data available</div>
          )}
        </div>
        
        {/* Daily Profit Chart */}
        <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">
            Daily Profit
          </h3>

          {dailyProfit?.length > 0 ? (
            <div className="h-64">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                  },
                  grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    containLabel: true,
                  },
                  xAxis: {
                    type: 'category',
                    data: dailyProfit.map(d => d.date),
                    axisLabel: { color: '#ccc' },
                  },
                  yAxis: {
                    type: 'value',
                    axisLabel: {
                      color: '#ccc',
                      formatter: '{value}%',          // now actual percent values
                    },
                  },
                  series: [
                    {
                      name: 'Profit %',
                      type: 'bar',
                      data: dailyProfit.map(d => d.profit_pct), 
                      itemStyle: {
                        color: (params: any) =>
                          params.value >= 0 ? '#00b07c' : '#f23645',
                      },
                    },
                  ],
                }}
                style={{ height: '100%' }}
              />
            </div>
          ) : (
            <div className="text-bolt-elements-textSecondary text-center py-4">
              No daily profit data available
            </div>
          )}
        </div>

        
        {/* Pair Management */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Blacklist */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Blacklist</h3>
            <div className="flex mb-4">
              <input
                type="text"
                value={newBlacklistPair}
                onChange={(e) => setNewBlacklistPair(e.target.value)}
                placeholder="Enter pair (e.g. BTC/USDT)"
                className="flex-1 p-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-l-md text-bolt-elements-textPrimary"
              />
              <button
                onClick={addToBlacklist}
                disabled={isActionLoading.addBlacklist || !newBlacklistPair}
                className={classNames(
                  "px-4 py-2 rounded-r-md",
                  "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text",
                  "hover:bg-bolt-elements-button-primary-backgroundHover",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isActionLoading.addBlacklist ? (
                  <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
                ) : (
                  'Add'
                )}
              </button>
            </div>
            {blacklist.length > 0 ? (
              <div className="max-h-40 overflow-y-auto">
                <ul className="divide-y divide-bolt-elements-borderColor">
                  {blacklist.map((pair, index) => (
                    <li key={index} className="py-2 flex justify-between items-center">
                      <span className="text-bolt-elements-textPrimary">{pair}</span>
                      <button
                        onClick={() => removeFromBlacklist(pair)}
                        disabled={isActionLoading[`removeBlacklist_${pair}`]}
                        className="text-red-500 hover:text-red-700"
                      >
                        {isActionLoading[`removeBlacklist_${pair}`] ? (
                          <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
                        ) : (
                          <div className="i-ph:trash" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-bolt-elements-textSecondary text-center py-2">
                No blacklisted pairs
              </div>
            )}
          </div>
          
          {/* Locks */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Locks</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <input
                type="text"
                value={newLockPair}
                onChange={(e) => setNewLockPair(e.target.value)}
                placeholder="Enter pair (e.g. BTC/USDT)"
                className="p-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
              />
              <select
                value={newLockDuration}
                onChange={(e) => setNewLockDuration(e.target.value)}
                className="p-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
              >
                <option value="1h">1 hour</option>
                <option value="6h">6 hours</option>
                <option value="12h">12 hours</option>
                <option value="1d">1 day</option>
                <option value="3d">3 days</option>
                <option value="7d">7 days</option>
              </select>
              <input
                type="text"
                value={newLockReason}
                onChange={(e) => setNewLockReason(e.target.value)}
                placeholder="Reason (optional)"
                className="p-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
              />
              <button
                onClick={createLock}
                disabled={isActionLoading.createLock || !newLockPair}
                className={classNames(
                  "px-4 py-2 rounded-md",
                  "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text",
                  "hover:bg-bolt-elements-button-primary-backgroundHover",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isActionLoading.createLock ? (
                  <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
                ) : (
                  'Create Lock'
                )}
              </button>
            </div>
            {locks.length > 0 ? (
              <div className="max-h-40 overflow-y-auto">
                <ul className="divide-y divide-bolt-elements-borderColor">
                  {locks.map((lock) => (
                    <li key={lock.id} className="py-2 flex justify-between items-center">
                      <div>
                        <span className="text-bolt-elements-textPrimary">{lock.pair}</span>
                        <span className="text-bolt-elements-textTertiary ml-2">
                          until {formatDate(lock.lock_until)}
                        </span>
                        {lock.reason && (
                          <span className="text-bolt-elements-textTertiary ml-2">
                            ({lock.reason})
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteLock(lock.id)}
                        disabled={isActionLoading[`deleteLock_${lock.id}`]}
                        className="text-red-500 hover:text-red-700"
                      >
                        {isActionLoading[`deleteLock_${lock.id}`] ? (
                          <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
                        ) : (
                          <div className="i-ph:trash" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-bolt-elements-textSecondary text-center py-2">
                No active locks
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render trades tab
  const renderTrades = () => {
    return (
      <div className="space-y-6">
        {/* Open Trades */}
        <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Open Trades</h3>
          {paginatedOpenTrades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bolt-elements-background-depth-4">
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">ID</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Pair</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Open Date</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Open Rate</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Current Rate</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Profit</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOpenTrades.map((trade) => (
                    <tr key={trade.trade_id} className="border-t border-bolt-elements-borderColor">
                      <td className="px-4 py-2 text-bolt-elements-textPrimary">{trade.trade_id}</td>
                      <td className="px-4 py-2 text-bolt-elements-textPrimary">{trade.pair}</td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">
                        {new Date(trade.open_date).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">{trade.open_rate.toFixed(8)}</td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">
                        {trade.current_rate ? trade.current_rate.toFixed(8) : 'N/A'}
                      </td>
                      <td className={classNames(
                        "px-4 py-2",
                        (trade.profit_pct || 0) >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {(trade.profit_pct || 0) >= 0 ? '+' : ''}{(trade.profit_pct || 0).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => forceSell(trade.trade_id)}
                            className="px-2 py-1 bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text rounded-md hover:bg-bolt-elements-button-danger-backgroundHover text-xs"
                          >
                            Force Sell
                          </button>
                          {trade.order_type === 'limit' && (
                            <button
                              onClick={() => cancelOrder(trade.trade_id)}
                              className="px-2 py-1 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded-md hover:bg-bolt-elements-button-secondary-backgroundHover text-xs"
                            >
                              Cancel Order
                            </button>
                          )}
                          <button
                            onClick={() => reloadTrade(trade.trade_id)}
                            className="px-2 py-1 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded-md hover:bg-bolt-elements-button-secondary-backgroundHover text-xs"
                          >
                            Reload
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination 
                currentPage={openTradesPage} 
                totalPages={totalOpenTradesPages} 
                onPageChange={setOpenTradesPage} 
              />
            </div>
          ) : (
            <div className="text-bolt-elements-textSecondary">No open trades</div>
          )}
        </div>
        
        {/* Closed Trades */}
        <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Closed Trades</h3>
          {paginatedClosedTrades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bolt-elements-background-depth-4">
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">ID</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Pair</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Open Date</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Close Date</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Profit</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Exit Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedClosedTrades.map((trade) => (
                    <tr key={trade.trade_id} className="border-t border-bolt-elements-borderColor">
                      <td className="px-4 py-2 text-bolt-elements-textPrimary">{trade.trade_id}</td>
                      <td className="px-4 py-2 text-bolt-elements-textPrimary">{trade.pair}</td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">
                        {new Date(trade.open_date).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">
                        {trade.close_date ? new Date(trade.close_date).toLocaleString() : 'N/A'}
                      </td>
                      <td className={classNames(
                        "px-4 py-2",
                        (trade.profit_pct || 0) >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {(trade.profit_pct || 0) >= 0 ? '+' : ''}{(trade.profit_pct || 0).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">
                        {trade.sell_reason || trade.exit_reason || 'Unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination 
                currentPage={closedTradesPage} 
                totalPages={totalClosedTradesPages} 
                onPageChange={setClosedTradesPage} 
              />
            </div>
          ) : (
            <div className="text-bolt-elements-textSecondary">No closed trades</div>
          )}
        </div>
      </div>
    );
  };

  // Render chart tab
  const renderChart = () => {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Pair Selection */}
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">Pair</label>
            
            <select
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
              className="px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
            >
              <option value="">Select Pair</option>
              {/* whitelist first */}
              {whitelist.map((pair, i) => (
                <option key={`wl-${i}`} value={pair}>
                  {pair}
                </option>
              ))}

              {/* open trades */}
              {openTrades.length > 0 && (
                <optgroup label="Open Trades">
                  {openTrades.map((trade) => (
                    <option
                      key={`open-${trade.trade_id}`}
                      value={trade.pair}
                    >
                      {trade.pair} (Trade #{trade.trade_id})
                    </option>
                  ))}
                </optgroup>
              )}

              {/* closed trades */}
              {closedTrades.length > 0 && (
                <optgroup label="Closed Trades">
                  {closedTrades.map((trade) => (
                    <option
                      key={`closed-${trade.trade_id}`}
                      value={trade.pair}
                    >
                      {trade.pair} (Trade #{trade.trade_id})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            
          </div>
          
          {/* Timeframe Selection */}
          {/* Timeframe Display (not editable) */}
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">Timeframe</label>
            <div
              className="px-3 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary min-w-[100px] flex items-center"
              style={{ minHeight: '40px' }}
            >
              {botConfig?.timeframe || '—'}
            </div>
          </div>
          
          {/* Force Buy Button */}
          {selectedPair && (
            <button
              onClick={() => forceBuy(selectedPair)}
              disabled={Object.values(isActionLoading).some(Boolean) || botStatus !== 'running'}
              className={classNames(
                "px-4 py-2 rounded-md text-white",
                Object.values(isActionLoading).some(Boolean) || botStatus !== 'running'
                  ? "bg-gray-500 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600"
              )}
            >
              Force Buy {selectedPair}
            </button>
          )}
        </div>
        {/* TradingChart - Free Lightweight Charts */}
        {activeTab === 'chart' && selectedPair && (
          <TradingChart
            strategyName={strategyName}
            selectedPair={selectedPair}
            timeframe={botConfig?.timeframe || selectedTimeframe}
            theme={theme}
            exchangeName={exchangeName}
          />
        )}
      </div>
    );
  };

  // Render logs tab (BotList-style formatting)
  const renderLogs = () => {
    return (
      <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Bot Logs</h3>

        <div className="h-[500px] overflow-y-auto bg-bolt-elements-background-depth-3 p-4 rounded font-mono text-xs text-bolt-elements-textSecondary relative">
          {(!logs || logs.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="i-ph:file-text text-4xl text-bolt-elements-textTertiary mb-2" />
                <p className="text-bolt-elements-textTertiary">No logs available</p>
              </div>
            </div>
          )}

          {logs && logs.length > 0 && logs.map((line, index) => (
            <div
              key={index}
              className="whitespace-pre-wrap mb-1 hover:bg-bolt-elements-background-depth-4 px-1 rounded"
            >
              {line}
            </div>
          ))}

          <div ref={logsEndRef} />
        </div>

        {logs.length > 0 && (
          <div className="mt-4 text-xs text-bolt-elements-textTertiary text-center">
            Showing {logs.length} log entries
          </div>
        )}
      </div>
    );
  };


  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'trades':
        return renderTrades();
      case 'chart':
        return renderChart();
      case 'logs':
        return renderLogs();
      default:
        return renderDashboard();
    }
  };

    // Render functions
    const renderStatusBadge = (status: string) => {
      let color = '';
      let icon = '';
      
      switch (status) {
        case 'running':
          color = 'bg-green-500/20 text-green-500';
          icon = 'i-ph:play-circle';
          break;
        case 'stopped':
          color = 'bg-gray-500/20 text-gray-500';
          icon = 'i-ph:stop-circle';
          break;
        case 'error':
          color = 'bg-red-500/20 text-red-500';
          icon = 'i-ph:x-circle';
          break;
        default:
          color = 'bg-yellow-500/20 text-yellow-500';
          icon = 'i-ph:question-circle';
      }
      
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color}`}>
          <div className={`${icon} text-base`} />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    };

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-bolt-elements-borderColor">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-bolt-elements-textPrimary">
              {strategyName || 'Bot Dashboard'}
            </h2>
            <div className="text-bolt-elements-textSecondary">
              {botConfig ? (
                <span>
                  {botConfig.exchange || 'Unknown Exchange'} • 
                  {botConfig.stake_currency || 'Unknown'} • 
                  {botConfig.timeframe || 'Unknown'} timeframe
                </span>
              ) : (
                'Loading configuration...'
              )}
              <span className="hidden sm:inline-block ml-2">{renderStatusBadge(botStatus)}</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Mobile status badge on the right */}
            <span className="sm:hidden">{renderStatusBadge(botStatus)}</span>
            <button
              onClick={() => navigate('/bots')}
              className="p-2 min-h-[44px] min-w-[44px] rounded-full text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
              title="Back to Bots"
            >
              <div className="i-ph:arrow-left text-xl" />
            </button>
            
            <button
              onClick={refreshData}
              disabled={isRefreshing}
              className="p-2 min-h-[44px] min-w-[44px] rounded-full text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
              title="Refresh Data"
            >
              <div className={classNames(
                "i-ph:arrows-clockwise text-xl",
                isRefreshing ? "animate-spin" : ""
              )} />
            </button>
            
            <div className="text-xs text-bolt-elements-textTertiary">
              Last updated: {lastRefreshTime.toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Control Bar */}
      <div className="flex flex-wrap items-center gap-2 p-4 bg-bolt-elements-background-depth-3 border-b border-bolt-elements-borderColor">
        {/* Mobile actions toggle */}
        <div className="sm:hidden w-full flex items-center justify-between">
          <button
            onClick={() => setShowMobileActions((v) => !v)}
            className="px-3 py-2 rounded-md text-sm font-medium border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
          >
            {showMobileActions ? 'Hide Actions' : 'Show Actions'}
          </button>
        </div>
        {/* Bot Controls */}
        <div className={classNames("items-center gap-2 mr-6", showMobileActions ? "flex" : "hidden", "sm:flex")}>
          <span className="sm:hidden">{renderStatusBadge(botStatus)}</span>
          
          <button
            onClick={startBot}
            disabled={isActionLoading.start || botStatus === 'running'}
            className={classNames(
              "px-3 py-2 min-h-[44px] rounded-md text-sm font-medium",
              "bg-green-600 text-white hover:bg-green-700",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isActionLoading.start ? (
              <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
            ) : (
              'Start'
            )}
          </button>
          
          <button
            onClick={stopBot}
            disabled={isActionLoading.stop || botStatus !== 'running'}
            className={classNames(
              "px-3 py-2 min-h-[44px] rounded-md text-sm font-medium",
              "bg-red-600 text-white hover:bg-red-700",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isActionLoading.stop ? (
              <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
            ) : (
              'Stop'
            )}
          </button>
          
          <button
            onClick={reloadConfig}
            disabled={isActionLoading.reload || botStatus !== 'running'}
            className={classNames(
              "px-3 py-2 min-h-[44px] rounded-md text-sm font-medium",
              "bg-blue-600 text-white hover:bg-blue-700",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isActionLoading.reload ? (
              <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
            ) : (
              'Reload'
            )}
          </button>
          
          <button
            onClick={stopBuy}
            disabled={isActionLoading.stopbuy || botStatus !== 'running'}
            className={classNames(
              "px-3 py-2 min-h-[44px] rounded-md text-sm font-medium",
              "bg-yellow-600 text-white hover:bg-yellow-700",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isActionLoading.stopbuy ? (
              <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
            ) : (
              'Stop Buy'
            )}
          </button>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={classNames(
              "px-3 py-1 rounded-md text-sm font-medium",
              activeTab === 'dashboard'
                ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                : "text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary"
            )}
          >
            Dashboard
          </button>
          
          <button
            onClick={() => setActiveTab('trades')}
            className={classNames(
              "px-3 py-1 rounded-md text-sm font-medium",
              activeTab === 'trades'
                ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                : "text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary"
            )}
          >
            Trades
          </button>
          
          <button
            onClick={() => setActiveTab('chart')}
            className={classNames(
              "px-3 py-1 rounded-md text-sm font-medium",
              activeTab === 'chart'
                ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                : "text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary"
            )}
          >
            Chart
          </button>
          
          <button
            onClick={() => setActiveTab('logs')}
            className={classNames(
              "px-3 py-1 rounded-md text-sm font-medium",
              activeTab === 'logs'
                ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                : "text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary"
            )}
          >
            Logs
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="p-3 sm:p-4 overflow-x-auto sm:overflow-visible">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="i-svg-spinners:90-ring-with-bg animate-spin text-4xl" />
          </div>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  );
};

export default BotDashboard;