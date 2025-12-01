import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from '@remix-run/react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import ReactECharts from 'echarts-for-react';
import { useFreqtradeWS } from '~/lib/hooks/useFreqtradeWS';
import { useCallback, useMemo } from 'react';


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
  errorTracker[key] = 0;
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
  exchange: {
    name: string;
    key?: string;
    secret?: string;
    [key: string]: any;
  };
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trades' | 'chart' | 'logs'>('dashboard');
  const [strategyName, setStrategyName] = useState<string>('');
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null);
  const [botStatus, setBotStatus] = useState<'running' | 'stopped' | 'error'>('stopped');
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [botStats, setBotStats] = useState<BotStats | null>(null);
  const [botProfit, setBotProfit] = useState<BotProfit | null>(null);
  // const [botPerformance, setBotPerformance] = useState<BotPerformance[]>([]);
  const [performance, setPerformance] = useState<PerformanceItem[]>([]);
  const [botBalance, setBotBalance] = useState<BotBalance | null>(null);
  const [dailyProfit, setDailyProfit] = useState<DailyProfit[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
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
    return performance.slice(startIndex, startIndex + rowsPerPage);
  }, [performance, performancePage]);

  const paginatedClosedTrades = useMemo(() => {
    const startIndex = (closedTradesPage - 1) * rowsPerPage;
    return closedTrades.slice(startIndex, startIndex + rowsPerPage);
  }, [closedTrades, closedTradesPage]);

  const paginatedOpenTrades = useMemo(() => {
    const startIndex = (openTradesPage - 1) * rowsPerPage;
    return openTrades.slice(startIndex, startIndex + rowsPerPage);
  }, [openTrades, openTradesPage]);

  // Calculate total pages
  const totalPerformancePages = Math.ceil(performance.length / rowsPerPage);
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

  // WebSocket connection for real-time updates
  const { isConnected, lastEvent } = useFreqtradeWS({
    strategyName,
    enabled: !!strategyName,
    onEvent: (event) => {
      console.log(`[BotDashboard] Received event: ${event.type}`, event.data);
      
      // Handle different event types
      switch (event.type) {
        case 'status':
          setBotStatus(event.data.status === 'running' ? 'running' : 'stopped');
          break;
        case 'entry':
        case 'entry_fill':
        case 'exit':
        case 'exit_fill':
          // Refresh trades data when trade events occur
          fetchOpenTrades();
          break;
        case 'whitelist':
          setWhitelist(event.data);
          break;
        case 'analyzed_df':
          // Update chart data if it matches the selected pair/timeframe
          if (selectedPair && selectedTimeframe && 
              event.data.key && 
              event.data.key[0] === selectedPair && 
              event.data.key[1] === selectedTimeframe) {
            updateChartWithAnalyzedData(event.data.df);
          }
          break;
        case 'new_candle':
          // Update chart with new candle if it matches the selected pair/timeframe
          if (selectedPair === event.data.pair && selectedTimeframe === event.data.timeframe) {
            updateChartWithNewCandle(event.data.candle);
          }
          break;
      }
    },
    eventTypes: [
      'status', 'startup', 'entry', 'entry_fill', 'exit', 'exit_fill', 
      'warning', 'strategy_msg', 'whitelist', 'analyzed_df', 'new_candle'
    ]
  });

  // Handle WebSocket events
  const handleWebSocketEvent = (event: any) => {
    console.log('[BotDashboard] WebSocket event received:', event.type, event.data);
    switch (event.type) {
      case 'status':
        console.log('[BotDashboard] Status event:', event.data);
        console.log('[BotDashboard] Current status:', botStatus, '→', event.data.status === 'running' ? 'running' : 'stopped');
        setBotStatus(event.data.status === 'running' ? 'running' : 'stopped');
        break;
        
      case 'entry':
        console.log('[BotDashboard] Entry signal detected:', event.data);
        console.log('[BotDashboard] New trade being opened for:', event.data.pair, 'at rate:', event.data.open_rate);
        fetchOpenTrades();
        fetchBalance();
        break;
        
      case 'entry_fill':
        console.log('[BotDashboard] Entry order filled:', event.data);
        console.log('[BotDashboard] Trade confirmed for:', event.data.pair, 'amount:', event.data.amount);
        fetchOpenTrades();
        fetchBalance();
        fetchProfit();
        break;
        
      case 'exit':
        console.log('[BotDashboard] Exit signal detected:', event.data);
        console.log('[BotDashboard] Trade closing for:', event.data.pair, 'reason:', event.data.exit_reason);
        fetchOpenTrades();
        break;
        
      case 'exit_fill':
        console.log('[BotDashboard] Exit order filled:', event.data);
        console.log(
          '[BotDashboard] Trade closed:',
          event.data.pair,
          'profit:',
          (event.data.profit_ratio * 100).toFixed(2) + '%',
          event.data.profit_amount
        );
        fetchOpenTrades();
        fetchClosedTrades();
        fetchBalance();
        fetchProfit();
        break;
        
      case 'warning':
        console.log('[BotDashboard] Warning received:', event.data);
        toast.warning(event.data.message || 'Bot warning');
        break;
        
      case 'strategy_msg':
        console.log('[BotDashboard] Strategy message:', event.data);
        toast.info(event.data.msg || 'Strategy message');
        break;
        
      case 'whitelist':
        console.log('[BotDashboard] Whitelist updated:', event.data);
        console.log('[BotDashboard] New whitelist contains', event.data?.length || 0, 'pairs');
        setWhitelist(event.data || []);
        break;
        
      case 'analyzed_df':
        console.log(
          '[BotDashboard] Analyzed dataframe:',
          Array.isArray(event.data.key) ? event.data.key.join('/') : 'unknown pair/timeframe'
        );
        // Only log basic info to avoid console spam
        if (selectedPair && Array.isArray(event.data.key) && event.data.key[0] === selectedPair) {
          console.log('[BotDashboard] Updating chart for current pair:', selectedPair);
          fetchCandleData(selectedPair, selectedTimeframe);
        }
        break;
        
      case 'new_candle':
        console.log(
          '[BotDashboard] New candle:',
          event.data.pair,
          event.data.timeframe,
          'O:', event.data.candle?.open,
          'C:', event.data.candle?.close
        );
        if (selectedPair && event.data.pair === selectedPair) {
          console.log('[BotDashboard] Updating chart with new candle data');
          fetchCandleData(selectedPair, selectedTimeframe);
        }
        break;
        
      case 'protection_trigger':
        console.log('[BotDashboard] Protection triggered for pair:', event.data);
        toast.warning(`Protection triggered for ${event.data.pair}: ${event.data.protection}`);
        break;
        
      case 'protection_trigger_global':
        console.log('[BotDashboard] Global protection triggered:', event.data);
        toast.warning(`Global protection triggered: ${event.data.protection}`);
        break;
        
      default:
        console.log('[BotDashboard] Unhandled event type:', event.type, event.data);
    }
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
          .eq('strategy_slug', id)
          .single();

        if (error) {
          console.error('Error fetching bot config:', error);
          throw error;
        }

        if (!botConfigRow?.config?.strategy) {
          console.error('No strategy found in bot config');
          throw new Error('Invalid bot configuration: No strategy found');
        }

        const strategy = botConfigRow.config.strategy;
        console.log(`[BotDashboard] Found strategy: ${strategy}`);
        setStrategyName(strategy);

        // Now fetch all the data
        await fetchAllData(strategy);
      } catch (error) {
        console.error('Error initializing bot dashboard:', error);
        toast.error('Failed to load bot data');
      } finally {
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

  // Fetch all data for the bot
  const fetchAllData = async (strategy: string) => {
    setIsRefreshing(true);
    try {
      console.log(`[BotDashboard] Fetching all data for strategy: ${strategy}`);
      
      // Fetch bot configuration
      await fetchBotConfig(strategy);
      
      // Fetch bot status
      await fetchBotStatus(strategy);
      
      // Fetch trades
      await fetchOpenTrades(strategy);
      await fetchClosedTrades(strategy);
      
      // Fetch statistics
      await fetchStats(strategy);
      await fetchProfit(strategy);
      await fetchPerformance(strategy);
      await fetchBalance(strategy);
      await fetchDailyProfit(strategy);
      
      // Fetch pair management data
      await fetchWhitelist(strategy);
      await fetchBlacklist(strategy);
      await fetchLocks(strategy);
      
      // Fetch logs
      await fetchLogs(strategy);
      
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
    
    try {
      console.log(`[BotDashboard] Fetching bot config for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategy}/api/v1/show_config`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch bot config: ${response.status} ${response.statusText}`);
      }
      
      const config = await response.json();
      console.log('[BotDashboard] Bot config:', config);
      setBotConfig(config);
      resetErrorCount('config');
    } catch (error) {
      console.error('Error fetching bot config:', error);
      showErrorToast('config', 'Failed to load bot configuration');
    }
  };

  // Fetch bot status
  const fetchBotStatus = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching bot status for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      // Use health endpoint to check if bot is running
      const healthResponse = await fetch(`/user/${strategy}/api/v1/health`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      console.log(`[BotDashboard] healthResponse - --- --- ${healthResponse}`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
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
      const openTradesResponse = await fetch(
        `/user/${strategy}/api/v1/status`, 
        {
          headers: {
            'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
          }
        }
      );
      
      if (openTradesResponse.ok) {
        const data = await openTradesResponse.json();
        if (Array.isArray(data)) {
          setOpenTrades(data);
        } else if (data.open_trades && Array.isArray(data.open_trades)) {
          setOpenTrades(data.open_trades);
        } else {
          setOpenTrades([]);
        }
      }
      
      resetErrorCount('trades');
    } catch (error) {
      console.error('Error fetching bot status:', error);
      setBotStatus('error');
    }
  };

  // Fetch open trades
  const fetchOpenTrades = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching open trades for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategy}/api/v1/status`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch open trades: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Raw open trades data:', data);
      
      if (Array.isArray(data)) {
        console.log(`[BotDashboard] Setting openTrades from array, length = ${data.length}`);
        setOpenTrades(data);
      } else if (data && typeof data === 'object' && Array.isArray(data.open_trades)) {
        console.log(`[BotDashboard] Setting openTrades from object.open_trades, length = ${data.open_trades.length}`);
        setOpenTrades(data.open_trades);
      } else {
        console.warn('[BotDashboard] Unexpected openTrades format:', data);
        setOpenTrades([]);
      }      
      
      resetErrorCount('trades');
      
      // If no pair is selected yet and we have trades, select the first one for the chart
      if (!selectedPair && data && data.length > 0) {
        setSelectedPair(data[0].pair);
        fetchCandleData(data[0].pair, selectedTimeframe);
      }
    } catch (error) {
      console.error('Error fetching open trades:', error);
      // Only show error toast if we've had multiple consecutive failures
      showErrorToast('trades', 'Failed to load open trades');
    }
  };

  // Fetch closed trades
  const fetchClosedTrades = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching closed trades for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategy}/api/v1/trades`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch closed trades: ${response.status} ${response.statusText}`);
      }
      
      const json = await response.json();
      console.log('[BotDashboard] Raw payload:', json);
      
      // Grab the trades array (or default to empty)
      const allTrades = Array.isArray(json.trades) ? json.trades : [];
      
      // Filter closed trades
      const closedTradesData = allTrades.filter(trade => trade.is_open === false);
      
      console.log('[BotDashboard] closedTradesData:', closedTradesData);

      setClosedTrades(closedTradesData);
      resetErrorCount('closedTrades');
    } catch (error) {
      console.error('Error fetching closed trades:', error);
      showErrorToast('closedTrades', 'Failed to load trade history');
    }
  };

  // Fetch bot statistics
  const fetchStats = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching stats for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategy}/api/v1/stats`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Bot stats:', data);
      setBotStats(data);
      resetErrorCount('stats');
    } catch (error) {
      console.error('Error fetching bot stats:', error);
      showErrorToast('stats', 'Failed to load bot statistics');
    }
  };

  // Fetch profit summary
  const fetchProfit = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching profit for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategy}/api/v1/profit`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch profit: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Profit data:', data);
      setBotProfit(data);
      resetErrorCount('profit');
    } catch (error) {
      console.error('Error fetching profit:', error);
      showErrorToast('profit', 'Failed to load profit data');
    }
  };

  // Fetch performance by pair
  const fetchPerformance = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching performance for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategy}/api/v1/performance`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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
    }
  };

  // Fetch account balance
  const fetchBalance = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching balance for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategy}/api/v1/balance`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch balance: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Balance data:', data);
      setBotBalance(data);
      resetErrorCount('balance');
    } catch (error) {
      console.error('Error fetching balance:', error);
      showErrorToast('balance', 'Failed to load balance data');
    }
  };

  // Fetch daily profit
  const fetchDailyProfit = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching daily profit for ${strategy}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategy}/api/v1/daily`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch daily profit: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Daily profit data:', data);
      setDailyProfit(Array.isArray(data) ? data : []);
      resetErrorCount('daily');
    } catch (error) {
      console.error('Error fetching daily profit:', error);
      showErrorToast('daily', 'Failed to load daily profit data');
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
      
      const response = await fetch(`/user/${strategy}/api/v1/whitelist`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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
      
      const response = await fetch(`/user/${strategy}/api/v1/blacklist`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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
      
      const response = await fetch(`/user/${strategy}/api/v1/locks`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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

  // Fetch logs
  const fetchLogs = async (strategy = strategyName) => {
    if (!strategy) return;
    
    try {
      console.log(`[BotDashboard] Fetching logs for ${strategy}`);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No authenticated user');
      }
      
      const response = await fetch(`/apa/podlogs?botName=${strategy}&userId=${user.id}&lines=100`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.status} ${response.statusText}`);
      }
      
      const text = await response.text();
      if (text) {
        // Split by newline and filter empty lines
        const logLines = text.split('\n').filter(line => line.trim());
        // Sanitize logs to replace 'freqtrade' with '10xtraders'
        const sanitizedLogs = sanitizeLogs(logLines);
        setLogs(sanitizedLogs);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      // Don't show toast for logs as they're not critical
    }
  };

  // Fetch candle data for chart
  const fetchCandleData = async (pair: string, timeframe: string) => {
    if (!strategyName || !pair || !timeframe) return;
    
    setIsLoadingChart(true);
    try {
      console.log(`[BotDashboard] Fetching candle data for ${pair} (${timeframe})`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(
        `/user/${strategyName}/api/v1/pair_candles?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}&limit=100`,
        {
          headers: {
            'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch candle data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Candle data:', data);
      setCandleData(data);
      resetErrorCount('chart');
    } catch (error) {
      console.error('Error fetching candle data:', error);
      showErrorToast('chart', 'Failed to load chart data');
    } finally {
      setIsLoadingChart(false);
    }
  };

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
      
      const response = await fetch(`/user/${strategyName}/api/v1/start`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/stop`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/reload_config`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/stopbuy`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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

  const updateChartWithAnalyzedData = (data: any) => {
    // This would update the chart with real-time analyzed data from WebSocket
    console.log('Updating chart with analyzed data:', data);
    // Implementation would depend on the data format
  };
  const updateChartWithNewCandle = (candle: any) => {
    // This would update the chart with a new candle from WebSocket
    console.log('Updating chart with new candle:', candle);
    // Implementation would depend on the data format
  };

  // Trade management actions
  const forceBuy = async () => {
    if (!strategyName || !forceBuyPair) return;
    
    setIsActionLoading({...isActionLoading, forcebuy: true});
    try {
      console.log(`[BotDashboard] Force buying ${forceBuyPair}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategyName}/api/v1/forceenter`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pair: forceBuyPair,
          side: 'long'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to force buy: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Force buy response:', data);
      
      toast.success(`Successfully opened position on ${forceBuyPair}`);
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

  const forceSell = async () => {
    if (!strategyName || !forceSellTradeId) return;
    
    setIsActionLoading({...isActionLoading, forcesell: true});
    try {
      console.log(`[BotDashboard] Force selling trade ${forceSellTradeId}`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      
      const response = await fetch(`/user/${strategyName}/api/v1/forceexit`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tradeid: parseInt(forceSellTradeId),
          ordertype: 'market'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to force sell: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[BotDashboard] Force sell response:', data);
      
      toast.success(`Successfully closed trade #${forceSellTradeId}`);
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/trades/${tradeId}/open-order`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/trades/${tradeId}/reload`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/trades/${tradeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/blacklist`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pair: newBlacklistPair
        })
      });
      
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/blacklist`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([pair])
      });
      
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/locks`, {
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
      
      const response = await fetch(`/user/${strategyName}/api/v1/locks/${lockId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      });
      
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

  // Prepare chart options
  const getChartOptions = () => {
    if (!candleData || !candleData.data || !candleData.columns) {
      return {
        title: {
          text: 'No data available',
          left: 'center'
        }
      };
    }
    
    // Find indices for OHLCV data
    const dateIndex = candleData.columns.indexOf('date');
    const openIndex = candleData.columns.indexOf('open');
    const highIndex = candleData.columns.indexOf('high');
    const lowIndex = candleData.columns.indexOf('low');
    const closeIndex = candleData.columns.indexOf('close');
    const volumeIndex = candleData.columns.indexOf('volume');
    
    // Check if we have all required indices
    if (dateIndex === -1 || openIndex === -1 || highIndex === -1 || 
        lowIndex === -1 || closeIndex === -1) {
      console.error('Missing required columns in candle data');
      return {
        title: {
          text: 'Invalid data format',
          left: 'center'
        }
      };
    }
    
    // Prepare candlestick data
    const candlestickData = candleData.data.map(row => {
      const timestamp = new Date(row[dateIndex]).getTime();
      return [
        timestamp,
        row[openIndex],
        row[highIndex],
        row[lowIndex],
        row[closeIndex]
      ];
    });
    
    // Prepare volume data if available
    let volumeData = [];
    if (volumeIndex !== -1) {
      volumeData = candleData.data.map(row => {
        const timestamp = new Date(row[dateIndex]).getTime();
        return [timestamp, row[volumeIndex]];
      });
    }
    
    // Look for buy/sell signals
    const buyIndex = candleData.columns.indexOf('buy');
    const sellIndex = candleData.columns.indexOf('sell');
    
    let buySignals = [];
    let sellSignals = [];
    
    if (buyIndex !== -1) {
      buySignals = candleData.data
        .filter(row => row[buyIndex] === 1)
        .map(row => {
          const timestamp = new Date(row[dateIndex]).getTime();
          return [timestamp, row[lowIndex] * 0.99]; // Place slightly below the low
        });
    }
    
    if (sellIndex !== -1) {
      sellSignals = candleData.data
        .filter(row => row[sellIndex] === 1)
        .map(row => {
          const timestamp = new Date(row[dateIndex]).getTime();
          return [timestamp, row[highIndex] * 1.01]; // Place slightly above the high
        });
    }
    
    // Create chart options
    return {
      animation: false,
      title: {
        text: `${candleData.pair} (${candleData.timeframe})`,
        left: 'center',
        textStyle: {
          color: '#ccc'
        }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        },
        backgroundColor: 'rgba(50, 50, 50, 0.9)',
        borderWidth: 0,
        textStyle: {
          color: '#fff'
        }
      },
      legend: {
        data: ['Candles', 'Volume', 'Buy', 'Sell'],
        inactiveColor: '#777',
        textStyle: {
          color: '#ccc'
        }
      },
      grid: [
        {
          left: '10%',
          right: '10%',
          top: '10%',
          height: '60%'
        },
        {
          left: '10%',
          right: '10%',
          top: '75%',
          height: '15%'
        }
      ],
      xAxis: [
        {
          type: 'time',
          scale: true,
          boundaryGap: false,
          axisLine: { lineStyle: { color: '#8392A5' } },
          splitLine: { show: false },
          axisLabel: {
            color: '#ccc',
            formatter: (value: number) => {
              const date = new Date(value);
              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
          }
        },
        {
          type: 'time',
          gridIndex: 1,
          scale: true,
          boundaryGap: false,
          axisLine: { lineStyle: { color: '#8392A5' } },
          axisLabel: { show: false },
          splitLine: { show: false }
        }
      ],
      yAxis: [
        {
          scale: true,
          splitArea: { show: false },
          axisLine: { lineStyle: { color: '#8392A5' } },
          splitLine: { show: true, lineStyle: { color: '#323232' } },
          axisLabel: { color: '#ccc' }
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLine: { lineStyle: { color: '#8392A5' } },
          axisLabel: { color: '#ccc' },
          splitLine: { show: false }
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 0,
          end: 100
        },
        {
          show: true,
          xAxisIndex: [0, 1],
          type: 'slider',
          bottom: '5%',
          start: 0,
          end: 100
        }
      ],
      series: [
        {
          name: 'Candles',
          type: 'candlestick',
          data: candlestickData,
          itemStyle: {
            color: '#00b07c',
            color0: '#f23645',
            borderColor: '#00b07c',
            borderColor0: '#f23645'
          }
        },
        {
          name: 'Volume',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumeData,
          itemStyle: {
            color: '#7fbbff'
          }
        },
        {
          name: 'Buy',
          type: 'scatter',
          data: buySignals,
          symbol: 'arrow',
          symbolSize: 15,
          symbolRotate: 0,
          itemStyle: {
            color: '#00b07c'
          }
        },
        {
          name: 'Sell',
          type: 'scatter',
          data: sellSignals,
          symbol: 'arrow',
          symbolSize: 15,
          symbolRotate: 180,
          itemStyle: {
            color: '#f23645'
          }
        }
      ]
    };
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
            {botProfit ? (
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
            {botBalance && botConfig?.stake_currency ? (
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
            <div className="text-xl font-bold text-bolt-elements-textPrimary">
              {openTrades.length} open
            </div>
            <div className="text-sm text-bolt-elements-textTertiary">
              {closedTrades.length} closed
            </div>
          </div>
        </div>
        
        {/* Performance by pair */}
        <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Performance by pair</h3>
          {performance.length > 0 ? (
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
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Daily Profit</h3>
          {dailyProfit && dailyProfit.length > 0 ? (
            <div className="h-64">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                      type: 'shadow'
                    }
                  },
                  grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    containLabel: true
                  },
                  xAxis: {
                    type: 'category',
                    data: dailyProfit.map(d => d.date),
                    axisLabel: {
                      color: '#ccc'
                    }
                  },
                  yAxis: {
                    type: 'value',
                    axisLabel: {
                      color: '#ccc',
                      formatter: '{value}%'
                    }
                  },
                  series: [
                    {
                      name: 'Profit',
                      type: 'bar',
                      data: dailyProfit.map(d => d.profit_pct),
                      itemStyle: {
                        color: (params: any) => {
                          return params.value >= 0 ? '#00b07c' : '#f23645';
                        }
                      }
                    }
                  ]
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
                            onClick={() => handleForceExit(trade.trade_id)}
                            className="px-2 py-1 bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text rounded-md hover:bg-bolt-elements-button-danger-backgroundHover text-xs"
                          >
                            Force Sell
                          </button>
                          {trade.order_type === 'limit' && (
                            <button
                              onClick={() => handleCancelOrder(trade.trade_id)}
                              className="px-2 py-1 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded-md hover:bg-bolt-elements-button-secondary-backgroundHover text-xs"
                            >
                              Cancel Order
                            </button>
                          )}
                          <button
                            onClick={() => handleReloadTrade(trade.trade_id)}
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
    // Get all unique pairs from open and closed trades
    const allPairs = [...new Set([
      ...openTrades.map(t => t.pair),
      ...closedTrades.map(t => t.pair),
      ...whitelist
    ])].filter(Boolean);
    
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
              Pair
            </label>
            <select
              value={selectedPair}
              onChange={(e) => {
                setSelectedPair(e.target.value);
                fetchCandleData(e.target.value, selectedTimeframe);
              }}
              className="w-full p-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
            >
              <option value="">Select a pair</option>
              {allPairs.map((pair) => (
                <option key={pair} value={pair}>{pair}</option>
              ))}
            </select>
          </div>
          
          <div className="w-[150px]">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
              Timeframe
            </label>
            <select
              value={selectedTimeframe}
              onChange={(e) => {
                setSelectedTimeframe(e.target.value);
                if (selectedPair) {
                  fetchCandleData(selectedPair, e.target.value);
                }
              }}
              className="w-full p-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary"
            >
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => {
                if (selectedPair) {
                  fetchCandleData(selectedPair, selectedTimeframe);
                }
              }}
              disabled={!selectedPair || isLoadingChart}
              className={classNames(
                "px-4 py-2 rounded-md",
                "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text",
                "hover:bg-bolt-elements-button-primary-backgroundHover",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoadingChart ? (
                <div className="i-svg-spinners:90-ring-with-bg animate-spin" />
              ) : (
                'Refresh'
              )}
            </button>
          </div>
        </div>
        
        <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
          <div className="h-[500px]">
            {selectedPair ? (
              isLoadingChart ? (
                <div className="flex items-center justify-center h-full">
                  <div className="i-svg-spinners:90-ring-with-bg animate-spin text-4xl" />
                </div>
              ) : (
                <ReactECharts
                  ref={chartRef}
                  option={getChartOptions()}
                  style={{ height: '100%', width: '100%' }}
                  theme="dark"
                />
              )
            ) : (
              <div className="flex items-center justify-center h-full text-bolt-elements-textSecondary">
                Select a pair to view chart
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render logs tab
  const renderLogs = () => {
    return (
      <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Bot Logs</h3>
        <div className="h-[500px] overflow-y-auto bg-bolt-elements-background-depth-4 p-4 rounded font-mono text-xs">
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div key={index} className="text-bolt-elements-textSecondary whitespace-pre-wrap mb-1">
                {log}
              </div>
            ))
          ) : (
            <div className="text-bolt-elements-textSecondary text-center py-4">
              No logs available
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
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
                  {botConfig.exchange?.name || 'Unknown Exchange'} • 
                  {botConfig.stake_currency || 'Unknown'} • 
                  {botConfig.timeframe || 'Unknown'} timeframe
                </span>
              ) : (
                'Loading configuration...'
              )}
              {renderStatusBadge(botStatus)}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigate('/bots')}
              className="p-2 rounded-full text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
              title="Back to Bots"
            >
              <div className="i-ph:arrow-left text-xl" />
            </button>
            
            <button
              onClick={refreshData}
              disabled={isRefreshing}
              className="p-2 rounded-full text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
              title="Refresh Data"
            >
              <div className={classNames(
                "i-ph:arrows-clockwise text-xl",
                isRefreshing && "animate-spin"
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
        {/* Bot Controls */}
        <div className="flex items-center gap-2 mr-6">
          {renderStatusBadge(botStatus)}
          
          <button
            onClick={startBot}
            disabled={isActionLoading.start || botStatus === 'running'}
            className={classNames(
              "px-3 py-1 rounded-md text-sm font-medium",
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
              "px-3 py-1 rounded-md text-sm font-medium",
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
              "px-3 py-1 rounded-md text-sm font-medium",
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
              "px-3 py-1 rounded-md text-sm font-medium",
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
      <div className="p-4">
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