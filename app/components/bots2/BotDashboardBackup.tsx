import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from '@remix-run/react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { useFreqtradeWS } from '~/lib/hooks/useFreqtradeWS';
import ReactECharts from 'echarts-for-react';

interface BotDashboardProps {
  // Add props if needed
}

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
  sell_reason?: string;
  exit_reason?: string;
  strategy?: string;
  current_rate?: number;
  order_type?: string;
  [key: string]: any; // For any additional fields
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
  stake_amount: number;
  timeframe: string;
  dry_run: boolean;
  exchange: {
    name: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface BotStats {
  win_rate_pct: number;
  avg_profit_pct: number;
  avg_duration_min: number;
  sell_reason_counts: Record<string, number>;
  [key: string]: any;
}

interface BotProfit {
  total_closed_trades: number;
  overall_profit_abs: number;
  overall_profit_pct: number;
  winning_trades: number;
  losing_trades: number;
  [key: string]: any;
}

interface BotBalance {
  currencies: Record<string, {
    free: number;
    used: number;
    total: number;
  }>;
  total: number;
  [key: string]: any;
}

interface DailyProfit {
  date: string;
  profit_abs: number;
  profit_pct: number;
  trades: number;
}

interface Lock {
  id: number;
  pair: string;
  lock_until: string;
  side: string;
  reason: string;
}

interface CandleData {
  columns: string[];
  data: any[][];
  pair: string;
  timeframe: string;
  [key: string]: any;
}

export default function BotDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [strategyName, setStrategyName] = useState<string>('');
  const [botConfig, setBotConfig] = useState<BotConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trades' | 'chart' | 'logs'>('dashboard');
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [performance, setPerformance] = useState<PerformanceItem[]>([]);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [profit, setProfit] = useState<BotProfit | null>(null);
  const [balance, setBalance] = useState<BotBalance | null>(null);
  const [dailyProfit, setDailyProfit] = useState<DailyProfit[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>('');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('');
  const [candleData, setCandleData] = useState<CandleData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  
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
  useFreqtradeWS({
    strategyName,
    enabled: !!strategyName,
    onEvent: (event) => {
      console.log('WebSocket event:', event);
      
      // Handle different event types
      switch (event.type) {
        case 'status':
          if (event.data?.status) {
            setIsRunning(event.data.status === 'running');
          }
          break;
        case 'entry':
        case 'entry_fill':
        case 'exit':
        case 'exit_fill':
          // Refresh trades data when trade events occur
          fetchOpenTrades();
          if (event.type === 'exit_fill') {
            fetchClosedTrades();
            fetchPerformance();
            fetchProfit();
            fetchBalance();
          }
          break;
      }
    },
    eventTypes: ['status', 'startup', 'entry', 'entry_fill', 'exit', 'exit_fill', 'warning', 'strategy_msg']
  });

  useEffect(() => {
    const fetchBotConfig = async () => {
      try {
        setIsLoading(true);
        
        // First get the bot configuration from Supabase to find the strategy name
        const { data: botConfigRow, error } = await supabase
          .from('bot_configurations')
          .select('*')
          .eq('id', id)
          .single();
          
        if (error) throw error;
        
        if (!botConfigRow?.config?.strategy) {
          toast.error('Strategy not found in bot configuration');
          return;
        }
        
        const strategy = botConfigRow.config.strategy;
        setStrategyName(strategy);
        
        // Now fetch the live config from the trading engine
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to view bot details');
          return;
        }
        
        // Fetch bot status first to check if it's running
        try {
          const statusUrl = `https://10xtraders.ai/user/${strategy}/api/v1/status`;
          const statusResponse = await fetch(statusUrl, {
            headers: {
              'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
            }
          });
          
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log('Status data:', statusData);
            
            // If we get an array, it's open trades
            if (Array.isArray(statusData)) {
              setOpenTrades(statusData);
              setIsRunning(true);
            } 
            // If we get an object with status property
            else if (statusData.status) {
              setIsRunning(statusData.status === 'running');
              if (statusData.open_trades) {
                setOpenTrades(statusData.open_trades);
              }
            }
            
            // Now fetch the config
            const configUrl = `https://10xtraders.ai/user/${strategy}/api/v1/show_config`;
            const configResponse = await fetch(configUrl, {
              headers: {
                'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
              }
            });
            
            if (configResponse.ok) {
              const configData = await configResponse.json();
              setBotConfig(configData);
              
              // If we have a timeframe in the config, set it as the selected timeframe
              if (configData.timeframe) {
                setSelectedTimeframe(configData.timeframe);
              }
              
              // If we have open trades, set the first one's pair as the selected pair
              if (statusData.open_trades && statusData.open_trades.length > 0) {
                setSelectedPair(statusData.open_trades[0].pair);
              } else if (Array.isArray(statusData) && statusData.length > 0) {
                setSelectedPair(statusData[0].pair);
              }
            }
            
            // Fetch all the other data
            fetchAllData(strategy, user.id);
          } else {
            // If we can't connect to the bot API, check pod status
            const podStatusUrl = `/apa/podstatus?botName=${strategy}&userId=${user.id}`;
            const podResponse = await fetch(podStatusUrl);
            
            if (podResponse.ok) {
              const podData = await podResponse.json();
              
              if (podData.ready) {
                setIsRunning(true);
              } else if (podData.phase === 'Running' && !podData.ready) {
                setIsDeploying(true);
              } else if (podData.phase === 'Failed') {
                toast.error('Bot deployment failed');
              }
            }
            
            // Still set the config from Supabase
            setBotConfig(botConfigRow.config);
          }
        } catch (error) {
          console.error('Error fetching bot status:', error);
          // Still set the config from Supabase
          setBotConfig(botConfigRow.config);
        }
      } catch (error) {
        console.error('Error fetching bot configuration:', error);
        toast.error('Failed to load bot configuration');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBotConfig();
  }, [id]);
  
  const fetchAllData = async (strategy: string, userId: string) => {
    try {
      // Fetch all data in parallel
      await Promise.all([
        fetchOpenTrades(),
        fetchClosedTrades(),
        fetchPerformance(),
        fetchStats(),
        fetchProfit(),
        fetchBalance(),
        fetchDailyProfit(),
        fetchLocks(),
        fetchWhitelist(),
        fetchBlacklist(),
        fetchLogs()
      ]);
    } catch (error) {
      console.error('Error fetching all data:', error);
    }
  };
  
  const fetchOpenTrades = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/status`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (Array.isArray(data)) {
          setOpenTrades(data);
        } else if (data.open_trades) {
          setOpenTrades(data.open_trades);
        }
      }
    } catch (error) {
      console.error('Error fetching open trades:', error);
    }
  };
  
  const fetchClosedTrades = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/trades`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setClosedTrades(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching closed trades:', error);
    }
  };
  
  const fetchPerformance = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/performance`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPerformance(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching performance:', error);
    }
  };
  
  const fetchStats = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/stats`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };
  
  const fetchProfit = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/profit`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setProfit(data);
      }
    } catch (error) {
      console.error('Error fetching profit:', error);
    }
  };
  
  const fetchBalance = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/balance`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBalance(data);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };
  
  const fetchDailyProfit = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/daily`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDailyProfit(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching daily profit:', error);
    }
  };
  
  const fetchLocks = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/locks`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLocks(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching locks:', error);
    }
  };
  
  const fetchWhitelist = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/whitelist`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setWhitelist(Array.isArray(data) ? data : []);
        
        // If we don't have a selected pair yet, use the first one from the whitelist
        if (!selectedPair && Array.isArray(data) && data.length > 0) {
          setSelectedPair(data[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching whitelist:', error);
    }
  };
  
  const fetchBlacklist = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/blacklist`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBlacklist(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching blacklist:', error);
    }
  };
  
  const fetchLogs = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // First try to get logs from the API
      try {
        const url = `https://10xtraders.ai/user/${strategyName}/api/v1/logs?limit=100`;
        const response = await fetch(url, {
          headers: {
            'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            // Sanitize logs - replace 'freqtrade' with '10xtraders'
            const sanitizedLogs = data.map(log => log.replace(/freqtrade/gi, '10xtraders'));
            setLogs(sanitizedLogs);
            return;
          }
        }
      } catch (error) {
        console.error('Error fetching logs from API:', error);
      }
      
      // Fallback to pod logs
      const podLogsUrl = `/apa/podlogs?botName=${strategyName}&userId=${user.id}&lines=100`;
      const podResponse = await fetch(podLogsUrl);
      
      if (podResponse.ok) {
        const text = await podResponse.text();
        if (text) {
          // Sanitize logs - replace 'freqtrade' with '10xtraders'
          const sanitizedLogs = text.split('\n')
            .filter(line => line.trim())
            .map(log => log.replace(/freqtrade/gi, '10xtraders'));
          setLogs(sanitizedLogs);
        }
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };
  
  const fetchCandleData = async () => {
    if (!strategyName || !selectedPair || !selectedTimeframe) return;
    
    try {
      setIsLoadingChart(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/pair_candles?pair=${selectedPair}&timeframe=${selectedTimeframe}&limit=100`;
      const response = await fetch(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCandleData(data);
      }
    } catch (error) {
      console.error('Error fetching candle data:', error);
      toast.error('Failed to load chart data');
    } finally {
      setIsLoadingChart(false);
    }
  };
  
  useEffect(() => {
    if (strategyName && selectedPair && selectedTimeframe) {
      fetchCandleData();
    }
  }, [strategyName, selectedPair, selectedTimeframe]);
  
  // Set up polling for data updates
  useEffect(() => {
    if (!strategyName) return;
    
    // Poll for status updates every 10 seconds
    const statusInterval = setInterval(() => {
      fetchOpenTrades();
    }, 10000);
    
    // Poll for full data refresh every 30 seconds
    const dataInterval = setInterval(() => {
      fetchClosedTrades();
      fetchPerformance();
      fetchProfit();
      fetchBalance();
      fetchDailyProfit();
      fetchLocks();
    }, 30000);
    
    return () => {
      clearInterval(statusInterval);
      clearInterval(dataInterval);
    };
  }, [strategyName]);
  
  const handleStartBot = async () => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/start`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsRunning(data.status === 'running');
        toast.success('Bot started successfully');
        
        // Refresh data
        fetchOpenTrades();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error starting bot:', error);
      toast.error('Failed to start bot');
    }
  };
  
  const handleStopBot = async () => {
    if (!strategyName) return;
    
    try {
      setIsStopping(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/stop`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsRunning(data.status !== 'stopped');
        toast.success('Bot stopped successfully');
        
        // Refresh data
        fetchOpenTrades();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error stopping bot:', error);
      toast.error('Failed to stop bot');
    } finally {
      setIsStopping(false);
    }
  };
  
  const handleReloadConfig = async () => {
    if (!strategyName) return;
    
    try {
      setIsReloading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/reload_config`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        toast.success('Configuration reloaded successfully');
        
        // Refresh all data
        fetchAllData(strategyName, user.id);
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error reloading config:', error);
      toast.error('Failed to reload configuration');
    } finally {
      setIsReloading(false);
    }
  };
  
  const handleForceExit = async (tradeId: number) => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/forceexit`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tradeid: tradeId,
          ordertype: 'market'
        })
      });
      
      if (response.ok) {
        toast.success(`Force exited trade #${tradeId}`);
        
        // Refresh trades
        fetchOpenTrades();
        fetchClosedTrades();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error force exiting trade:', error);
      toast.error(`Failed to force exit trade #${tradeId}`);
    }
  };
  
  const handleForceEnter = async (pair: string) => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/forceenter`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pair: pair,
          side: 'long'
        })
      });
      
      if (response.ok) {
        toast.success(`Force entered ${pair}`);
        
        // Refresh trades
        fetchOpenTrades();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error force entering trade:', error);
      toast.error(`Failed to force enter ${pair}`);
    }
  };
  
  const handleCancelOrder = async (tradeId: number) => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/trades/${tradeId}/open-order`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        toast.success(`Canceled order for trade #${tradeId}`);
        
        // Refresh trades
        fetchOpenTrades();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error canceling order:', error);
      toast.error(`Failed to cancel order for trade #${tradeId}`);
    }
  };
  
  const handleReloadTrade = async (tradeId: number) => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/trades/${tradeId}/reload`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        toast.success(`Reloaded trade #${tradeId}`);
        
        // Refresh trades
        fetchOpenTrades();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error reloading trade:', error);
      toast.error(`Failed to reload trade #${tradeId}`);
    }
  };
  
  const handleAddToBlacklist = async (pair: string) => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/blacklist`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pair: pair
        })
      });
      
      if (response.ok) {
        toast.success(`Added ${pair} to blacklist`);
        
        // Refresh blacklist
        fetchBlacklist();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error adding to blacklist:', error);
      toast.error(`Failed to add ${pair} to blacklist`);
    }
  };
  
  const handleRemoveFromBlacklist = async (pair: string) => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/blacklist`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([pair])
      });
      
      if (response.ok) {
        toast.success(`Removed ${pair} from blacklist`);
        
        // Refresh blacklist
        fetchBlacklist();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error removing from blacklist:', error);
      toast.error(`Failed to remove ${pair} from blacklist`);
    }
  };
  
  const handleCreateLock = async (pair: string, duration: number) => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      // Calculate lock until time (current time + duration in minutes)
      const until = new Date();
      until.setMinutes(until.getMinutes() + duration);
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/locks`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pair: pair,
          until: until.toISOString(),
          side: 'long',
          reason: 'manual'
        })
      });
      
      if (response.ok) {
        toast.success(`Locked ${pair} for ${duration} minutes`);
        
        // Refresh locks
        fetchLocks();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error creating lock:', error);
      toast.error(`Failed to lock ${pair}`);
    }
  };
  
  const handleRemoveLock = async (lockId: number) => {
    if (!strategyName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/locks/${lockId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
        }
      });
      
      if (response.ok) {
        toast.success(`Removed lock #${lockId}`);
        
        // Refresh locks
        fetchLocks();
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error) {
      console.error('Error removing lock:', error);
      toast.error(`Failed to remove lock #${lockId}`);
    }
  };
  
  const renderDashboard = () => {
    return (
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status card */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Status</h3>
            <div className="flex items-center">
              <div className={classNames(
                "w-3 h-3 rounded-full mr-2",
                isRunning ? "bg-green-500" : "bg-red-500"
              )}></div>
              <span className="text-bolt-elements-textSecondary">
                {isRunning ? 'Running' : isDeploying ? 'Deploying' : 'Stopped'}
              </span>
            </div>
            <div className="mt-2 text-sm text-bolt-elements-textSecondary">
              {botConfig && (
                <div>
                  <p>Exchange: {botConfig.exchange?.name || 'Unknown'}</p>
                  <p>Timeframe: {botConfig.timeframe || 'Unknown'}</p>
                  <p>Max trades: {botConfig.max_open_trades || 'Unknown'}</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Profit card */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Profit</h3>
            {profit ? (
              <div>
                <div className={classNames(
                  "text-xl font-bold",
                  profit.overall_profit_pct >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {profit.overall_profit_pct >= 0 ? '+' : ''}{profit.overall_profit_pct?.toFixed(2)}%
                </div>
                <div className="text-sm text-bolt-elements-textSecondary mt-1">
                  <p>Total trades: {profit.total_closed_trades || 0}</p>
                  <p>Win rate: {profit.win_rate_pct?.toFixed(2) || 0}%</p>
                  <p>Profit: {profit.overall_profit_abs?.toFixed(6) || 0} {botConfig?.stake_currency}</p>
                </div>
              </div>
            ) : (
              <div className="text-bolt-elements-textSecondary">No profit data available</div>
            )}
          </div>
          
          {/* Balance card */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Balance</h3>
            {balance ? (
              <div>
                <div className="text-xl font-bold text-bolt-elements-textPrimary">
                  {balance.total?.toFixed(2) || 0} {botConfig?.stake_currency}
                </div>
                <div className="text-sm text-bolt-elements-textSecondary mt-1">
                  {botConfig?.stake_currency && balance.currencies && balance.currencies[botConfig.stake_currency] && (
                    <>
                      <p>Free: {balance.currencies[botConfig.stake_currency].free?.toFixed(6) || 0}</p>
                      <p>Used: {balance.currencies[botConfig.stake_currency].used?.toFixed(6) || 0}</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-bolt-elements-textSecondary">No balance data available</div>
            )}
          </div>
          
          {/* Open trades card */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Open Trades</h3>
            <div className="text-xl font-bold text-bolt-elements-textPrimary">
              {openTrades.length} / {botConfig?.max_open_trades || '?'}
            </div>
            <div className="text-sm text-bolt-elements-textSecondary mt-1">
              <p>Available slots: {Math.max(0, (botConfig?.max_open_trades || 0) - openTrades.length)}</p>
              {openTrades.length > 0 && (
                <p>
                  Avg. profit: {
                    (openTrades.reduce((sum, trade) => sum + (trade.profit_pct || 0), 0) / openTrades.length).toFixed(2)
                  }%
                </p>
              )}
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
        
        {/* Daily profit */}
        <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Daily profit</h3>
          {dailyProfit.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bolt-elements-background-depth-4">
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Date</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Trades</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Profit %</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Profit Abs</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyProfit.map((item, index) => (
                    <tr key={index} className="border-t border-bolt-elements-borderColor">
                      <td className="px-4 py-2 text-bolt-elements-textPrimary">{item.date}</td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">{item.trades}</td>
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
            </div>
          ) : (
            <div className="text-bolt-elements-textSecondary">No daily profit data available</div>
          )}
        </div>
        
        {/* Locks */}
        <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Locks</h3>
          {locks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bolt-elements-background-depth-4">
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">ID</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Pair</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Side</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Until</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Reason</th>
                    <th className="px-4 py-2 text-left text-bolt-elements-textPrimary">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {locks.map((lock) => (
                    <tr key={lock.id} className="border-t border-bolt-elements-borderColor">
                      <td className="px-4 py-2 text-bolt-elements-textPrimary">{lock.id}</td>
                      <td className="px-4 py-2 text-bolt-elements-textPrimary">{lock.pair}</td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">{lock.side}</td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">
                        {new Date(lock.lock_until).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-bolt-elements-textSecondary">{lock.reason}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleRemoveLock(lock.id)}
                          className="px-2 py-1 bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text rounded-md hover:bg-bolt-elements-button-danger-backgroundHover"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-bolt-elements-textSecondary">No locks active</div>
          )}
        </div>
        
        {/* Whitelist & Blacklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Whitelist */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Whitelist</h3>
            {whitelist.length > 0 ? (
              <div className="overflow-y-auto max-h-60">
                <ul className="space-y-1">
                  {whitelist.map((pair, index) => (
                    <li key={index} className="flex justify-between items-center p-2 hover:bg-bolt-elements-background-depth-4 rounded">
                      <span className="text-bolt-elements-textPrimary">{pair}</span>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleForceEnter(pair)}
                          className="px-2 py-1 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover text-xs"
                        >
                          Force Buy
                        </button>
                        <button
                          onClick={() => handleAddToBlacklist(pair)}
                          className="px-2 py-1 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded-md hover:bg-bolt-elements-button-secondary-backgroundHover text-xs"
                        >
                          Blacklist
                        </button>
                        <button
                          onClick={() => handleCreateLock(pair, 60)}
                          className="px-2 py-1 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded-md hover:bg-bolt-elements-button-secondary-backgroundHover text-xs"
                        >
                          Lock 1h
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-bolt-elements-textSecondary">No whitelist available</div>
            )}
          </div>
          
          {/* Blacklist */}
          <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Blacklist</h3>
            {blacklist.length > 0 ? (
              <div className="overflow-y-auto max-h-60">
                <ul className="space-y-1">
                  {blacklist.map((pair, index) => (
                    <li key={index} className="flex justify-between items-center p-2 hover:bg-bolt-elements-background-depth-4 rounded">
                      <span className="text-bolt-elements-textPrimary">{pair}</span>
                      <button
                        onClick={() => handleRemoveFromBlacklist(pair)}
                        className="px-2 py-1 bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text rounded-md hover:bg-bolt-elements-button-danger-backgroundHover text-xs"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-bolt-elements-textSecondary">No blacklist available</div>
            )}
          </div>
        </div>
      </div>
    );
  };
  
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
  
  const renderChart = () => {
    // Prepare chart options if we have candle data
    const getChartOptions = () => {
      if (!candleData || !candleData.data || !candleData.columns) return null;
      
      // Find the indices for OHLCV data
      const dateIndex = candleData.columns.indexOf('date');
      const openIndex = candleData.columns.indexOf('open');
      const highIndex = candleData.columns.indexOf('high');
      const lowIndex = candleData.columns.indexOf('low');
      const closeIndex = candleData.columns.indexOf('close');
      const volumeIndex = candleData.columns.indexOf('volume');
      
      if (dateIndex === -1 || openIndex === -1 || highIndex === -1 || lowIndex === -1 || closeIndex === -1) {
        return null;
      }
      
      // Format data for ECharts
      const categoryData = [];
      const values = [];
      const volumes = [];
      
      for (let i = 0; i < candleData.data.length; i++) {
        const item = candleData.data[i];
        
        // Format date
        const dateStr = typeof item[dateIndex] === 'string' ? item[dateIndex] : new Date(item[dateIndex]).toISOString();
        categoryData.push(dateStr);
        
        // Format OHLC
        values.push([
          item[openIndex],
          item[closeIndex],
          item[lowIndex],
          item[highIndex]
        ]);
        
        // Format volume if available
        if (volumeIndex !== -1) {
          volumes.push(item[volumeIndex]);
        }
      }
      
      // Find buy/sell signals if available
      const buySignals = [];
      const sellSignals = [];
      
      const buyIndex = candleData.columns.indexOf('buy');
      const sellIndex = candleData.columns.indexOf('sell');
      
      if (buyIndex !== -1) {
        for (let i = 0; i < candleData.data.length; i++) {
          if (candleData.data[i][buyIndex] === 1) {
            buySignals.push({
              coord: [i, candleData.data[i][lowIndex] * 0.99],
              value: 'Buy',
              itemStyle: {
                color: '#00b07c'
              }
            });
          }
        }
      }
      
      if (sellIndex !== -1) {
        for (let i = 0; i < candleData.data.length; i++) {
          if (candleData.data[i][sellIndex] === 1) {
            sellSignals.push({
              coord: [i, candleData.data[i][highIndex] * 1.01],
              value: 'Sell',
              itemStyle: {
                color: '#e74c3c'
              }
            });
          }
        }
      }
      
      // Create chart options
      return {
        animation: false,
        legend: {
          data: ['OHLC', 'MA5', 'MA10', 'MA20', 'Volume'],
          selected: {
            'Volume': false
          }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross'
          },
          position: function (pos, params, el, elRect, size) {
            const obj = { top: 10 };
            obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 30;
            return obj;
          }
        },
        axisPointer: {
          link: [{ xAxisIndex: 'all' }]
        },
        toolbox: {
          feature: {
            dataZoom: {
              yAxisIndex: false
            },
            restore: {},
            saveAsImage: {}
          }
        },
        grid: [
          {
            left: '3%',
            right: '3%',
            height: '70%'
          },
          {
            left: '3%',
            right: '3%',
            top: '80%',
            height: '15%'
          }
        ],
        xAxis: [
          {
            type: 'category',
            data: categoryData,
            scale: true,
            boundaryGap: false,
            axisLine: { onZero: false },
            splitLine: { show: false },
            splitNumber: 20,
            min: 'dataMin',
            max: 'dataMax',
            axisPointer: {
              z: 100
            }
          },
          {
            type: 'category',
            gridIndex: 1,
            data: categoryData,
            scale: true,
            boundaryGap: false,
            axisLine: { onZero: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            splitNumber: 20,
            min: 'dataMin',
            max: 'dataMax'
          }
        ],
        yAxis: [
          {
            scale: true,
            splitArea: {
              show: true
            }
          },
          {
            scale: true,
            gridIndex: 1,
            splitNumber: 2,
            axisLabel: { show: false },
            axisLine: { show: false },
            axisTick: { show: false },
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
            top: '97%',
            start: 0,
            end: 100
          }
        ],
        series: [
          {
            name: 'OHLC',
            type: 'candlestick',
            data: values,
            itemStyle: {
              color: '#00b07c',
              color0: '#e74c3c',
              borderColor: '#00b07c',
              borderColor0: '#e74c3c'
            }
          },
          {
            name: 'MA5',
            type: 'line',
            data: calculateMA(5, values),
            smooth: true,
            lineStyle: {
              opacity: 0.5
            }
          },
          {
            name: 'MA10',
            type: 'line',
            data: calculateMA(10, values),
            smooth: true,
            lineStyle: {
              opacity: 0.5
            }
          },
          {
            name: 'MA20',
            type: 'line',
            data: calculateMA(20, values),
            smooth: true,
            lineStyle: {
              opacity: 0.5
            }
          },
          {
            name: 'Volume',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: volumes
          },
          {
            name: 'Buy Signals',
            type: 'scatter',
            data: buySignals,
            symbolSize: 15,
            symbol: 'arrow',
            symbolRotate: 0,
            itemStyle: {
              color: '#00b07c'
            },
            label: {
              show: true,
              position: 'bottom',
              formatter: '{b}'
            }
          },
          {
            name: 'Sell Signals',
            type: 'scatter',
            data: sellSignals,
            symbolSize: 15,
            symbol: 'arrow',
            symbolRotate: 180,
            itemStyle: {
              color: '#e74c3c'
            },
            label: {
              show: true,
              position: 'top',
              formatter: '{b}'
            }
          }
        ]
      };
    };
    
    // Helper function to calculate Moving Averages
    function calculateMA(dayCount, data) {
      const result = [];
      for (let i = 0; i < data.length; i++) {
        if (i < dayCount - 1) {
          result.push('-');
          continue;
        }
        let sum = 0;
        for (let j = 0; j < dayCount; j++) {
          sum += data[i - j][1]; // Use closing price
        }
        result.push((sum / dayCount).toFixed(2));
      }
      return result;
    }
    
    return (
      <div className="space-y-6">
        <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
                Pair
              </label>
              <select
                value={selectedPair}
                onChange={(e) => setSelectedPair(e.target.value)}
                className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md px-3 py-2 text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
              >
                <option value="">Select Pair</option>
                {whitelist.map((pair) => (
                  <option key={pair} value={pair}>{pair}</option>
                ))}
                {openTrades.map((trade) => (
                  <option key={`trade-${trade.trade_id}`} value={trade.pair}>{trade.pair}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
                Timeframe
              </label>
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md px-3 py-2 text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
              >
                <option value="">Select Timeframe</option>
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
                onClick={fetchCandleData}
                disabled={!selectedPair || !selectedTimeframe || isLoadingChart}
                className={classNames(
                  "px-4 py-2 rounded-md text-sm font-medium",
                  (!selectedPair || !selectedTimeframe || isLoadingChart)
                    ? "bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text opacity-50 cursor-not-allowed"
                    : "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
                )}
              >
                {isLoadingChart ? (
                  <div className="flex items-center">
                    <div className="i-svg-spinners:90-ring-with-bg animate-spin mr-2" />
                    Loading...
                  </div>
                ) : (
                  'Load Chart'
                )}
              </button>
            </div>
          </div>
          
          <div className="h-[500px] bg-bolt-elements-background-depth-2 rounded-lg">
            {candleData ? (
              <ReactECharts
                option={getChartOptions() || {}}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-bolt-elements-textSecondary">
                {isLoadingChart ? (
                  <div className="flex flex-col items-center">
                    <div className="i-svg-spinners:90-ring-with-bg animate-spin text-4xl mb-2" />
                    <p>Loading chart data...</p>
                  </div>
                ) : (
                  <p>Select a pair and timeframe to view chart</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  const renderLogs = () => {
    return (
      <div className="bg-bolt-elements-background-depth-3 p-4 rounded-lg">
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Logs</h3>
        <div className="bg-bolt-elements-background-depth-2 p-4 rounded-lg h-[500px] overflow-y-auto font-mono text-xs">
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div key={index} className="text-bolt-elements-textSecondary mb-1">
                {log}
              </div>
            ))
          ) : (
            <div className="text-bolt-elements-textSecondary">No logs available</div>
          )}
        </div>
      </div>
    );
  };
  
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
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center">
          <div className="i-svg-spinners:90-ring-with-bg animate-spin text-4xl mb-2 text-bolt-elements-loader-progress" />
          <p className="text-bolt-elements-textSecondary">Loading bot details...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bolt-elements-textPrimary">
            {strategyName}
          </h1>
          <p className="text-bolt-elements-textSecondary">
            {botConfig?.exchange?.name || 'Unknown'} • {botConfig?.timeframe || 'Unknown'} • 
            {botConfig?.dry_run ? ' Dry Run' : ' Live'}
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigate('/bots')}
            className="p-2 rounded-full text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
            title="Back to Bots"
          >
            <div className="i-ph:arrow-left text-xl" />
          </button>
        </div>
      </div>
      
      {/* Control bar and tabs */}
      <div className="bg-bolt-elements-background-depth-3 rounded-lg mb-6">
        <div className="flex flex-wrap items-center p-4 border-b border-bolt-elements-borderColor">
          {/* Bot controls */}
          <div className="flex space-x-2 mr-6">
            {!isRunning ? (
              <button
                onClick={handleStartBot}
                disabled={isDeploying}
                className={classNames(
                  "px-4 py-2 rounded-md text-sm font-medium flex items-center",
                  isDeploying
                    ? "bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text opacity-50 cursor-not-allowed"
                    : "bg-green-500 text-white hover:bg-green-600"
                )}
              >
                {isDeploying ? (
                  <>
                    <div className="i-svg-spinners:90-ring-with-bg animate-spin mr-2" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <div className="i-ph:play-circle mr-2" />
                    Start
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleStopBot}
                disabled={isStopping}
                className={classNames(
                  "px-4 py-2 rounded-md text-sm font-medium flex items-center",
                  isStopping
                    ? "bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text opacity-50 cursor-not-allowed"
                    : "bg-red-500 text-white hover:bg-red-600"
                )}
              >
                {isStopping ? (
                  <>
                    <div className="i-svg-spinners:90-ring-with-bg animate-spin mr-2" />
                    Stopping...
                  </>
                ) : (
                  <>
                    <div className="i-ph:stop-circle mr-2" />
                    Stop
                  </>
                )}
              </button>
            )}
            
            <button
              onClick={handleReloadConfig}
              disabled={isReloading || !isRunning}
              className={classNames(
                "px-4 py-2 rounded-md text-sm font-medium flex items-center",
                isReloading || !isRunning
                  ? "bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text opacity-50 cursor-not-allowed"
                  : "bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover"
              )}
            >
              {isReloading ? (
                <>
                  <div className="i-svg-spinners:90-ring-with-bg animate-spin mr-2" />
                  Reloading...
                </>
              ) : (
                <>
                  <div className="i-ph:arrows-clockwise mr-2" />
                  Reload
                </>
              )}
            </button>
          </div>
          
          {/* Tab navigation */}
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={classNames(
                "px-4 py-2 rounded-md text-sm font-medium",
                activeTab === 'dashboard'
                  ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                  : "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4"
              )}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('trades')}
              className={classNames(
                "px-4 py-2 rounded-md text-sm font-medium",
                activeTab === 'trades'
                  ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                  : "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4"
              )}
            >
              Trades
            </button>
            <button
              onClick={() => setActiveTab('chart')}
              className={classNames(
                "px-4 py-2 rounded-md text-sm font-medium",
                activeTab === 'chart'
                  ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                  : "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4"
              )}
            >
              Chart
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={classNames(
                "px-4 py-2 rounded-md text-sm font-medium",
                activeTab === 'logs'
                  ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                  : "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4"
              )}
            >
              Logs
            </button>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      {renderContent()}
    </div>
  );
}