import { useState, useEffect, useRef } from 'react';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';

// Domain helper (match BotList rule: only binanceus => US, else EU)
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

export interface Trade {
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
  [key: string]: any;
}

export interface BotBalance {
  [currency: string]: {
    free: number;
    used: number;
    total: number;
  };
}

export interface BotProfit {
  total_closed_trades: number;
  overall_profit_abs: number;
  overall_profit_pct: number;
  winning_trades: number;
  losing_trades: number;
  win_rate_pct: number;
  [key: string]: any;
}

export interface LiveBotData {
  strategyName: string;
  exchangeName: string;
  botStatus: 'running' | 'stopped' | 'error';
  openTrades: Trade[];
  closedTrades: Trade[];
  logs: string[];
  balance: BotBalance | null;
  profit: BotProfit | null;
  isLoading: boolean;
}

export function useLiveBotData(chatId: string | undefined, enabled: boolean = true) {
  const [data, setData] = useState<LiveBotData>({
    strategyName: '',
    exchangeName: '',
    botStatus: 'stopped',
    openTrades: [],
    closedTrades: [],
    logs: [],
    balance: null,
    profit: null,
    isLoading: true,
  });

  const exchangeNameRef = useRef<string>('');
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch strategy name and exchange from database
  useEffect(() => {
    if (!chatId || !enabled) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const fetchBotInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get strategy name from trading_scripts
        const { data: scriptData } = await supabase
          .from('trading_scripts')
          .select('name')
          .eq('chat_id', chatId)
          .eq('user_id', user.id)
          .single();

        if (!scriptData) {
          setData(prev => ({ ...prev, isLoading: false }));
          return;
        }

        const strategyName = scriptData.name;

        // Get bot configuration to check status and exchange
        const { data: botData } = await supabase
          .from('bot_configurations')
          .select('status, config')
          .eq('user_id', user.id)
          .eq('config->>strategy', strategyName)
          .single();

        if (!botData) {
          setData(prev => ({ ...prev, strategyName, isLoading: false }));
          return;
        }

        const config = typeof botData.config === 'string' ? JSON.parse(botData.config) : botData.config;
        const exObj = config?.exchange;
        const exName = typeof exObj === 'string' ? exObj : (exObj?.name || exObj?.exchange?.name || '');

        exchangeNameRef.current = exName;

        setData(prev => ({
          ...prev,
          strategyName,
          exchangeName: exName,
          botStatus: botData.status as 'running' | 'stopped' | 'error',
        }));

        // Only fetch live data if bot is running
        if (botData.status === 'running') {
          fetchLiveData(strategyName, exName);
        } else {
          setData(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('[useLiveBotData] Error fetching bot info:', error);
        setData(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchBotInfo();
  }, [chatId, enabled]);

  // Fetch live data from API
  const fetchLiveData = async (strategyName: string, exchangeName: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;
      const authHeader = 'Basic ' + btoa(`${apiUsername}:${apiPassword}`);

      // Fetch open trades, logs, balance, and profit in parallel
      const [tradesRes, logsRes, balanceRes, profitRes] = await Promise.allSettled([
        apiFetch(`/user/${strategyName}/api/v1/trades`, {
          headers: { 'Authorization': authHeader }
        }, exchangeName),
        fetch(`/apa/podlogs?botName=${strategyName}&userId=${session.user.id}&lines=100`, {
          headers: { 'Content-Type': 'application/json' }
        }),
        apiFetch(`/user/${strategyName}/api/v1/balance`, {
          headers: { 'Authorization': authHeader }
        }, exchangeName),
        apiFetch(`/user/${strategyName}/api/v1/profit`, {
          headers: { 'Authorization': authHeader }
        }, exchangeName),
      ]);

      // Process trades
      let openTrades: Trade[] = [];
      if (tradesRes.status === 'fulfilled' && tradesRes.value.ok) {
        const tradesData = await tradesRes.value.json();
        openTrades = Array.isArray(tradesData) ? tradesData.filter((t: Trade) => t.is_open) : [];
      }

      // Process logs
      let logs: string[] = [];
      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        const logsData = await logsRes.value.json();
        if (logsData.logs) {
          const rawLogs = typeof logsData.logs === 'string' ? logsData.logs : JSON.stringify(logsData.logs);
          logs = sanitizeLogs(rawLogs.split('\n').filter((line: string) => line.trim()));
        }
      }

      // Process balance
      let balance: BotBalance | null = null;
      if (balanceRes.status === 'fulfilled' && balanceRes.value.ok) {
        const balanceData = await balanceRes.value.json();
        balance = balanceData.currencies || balanceData;
      }

      // Process profit
      let profit: BotProfit | null = null;
      if (profitRes.status === 'fulfilled' && profitRes.value.ok) {
        profit = await profitRes.value.json();
      }

      setData(prev => ({
        ...prev,
        openTrades,
        logs,
        balance,
        profit,
        isLoading: false,
      }));
    } catch (error) {
      console.error('[useLiveBotData] Error fetching live data:', error);
      setData(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Refresh live data periodically if bot is running
  useEffect(() => {
    if (!enabled || data.botStatus !== 'running' || !data.strategyName) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    // Refresh every 10 seconds
    refreshIntervalRef.current = setInterval(() => {
      fetchLiveData(data.strategyName, data.exchangeName);
    }, 10000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [enabled, data.botStatus, data.strategyName, data.exchangeName]);

  // Start bot function
  const startBot = async () => {
    if (!data.strategyName) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      const response = await apiFetch(`/user/${data.strategyName}/api/v1/start`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);

      if (!response.ok) {
        throw new Error(`Failed to start bot: ${response.status}`);
      }

      toast.success('Bot started successfully');
      setData(prev => ({ ...prev, botStatus: 'running' }));
    } catch (error) {
      console.error('[useLiveBotData] Error starting bot:', error);
      toast.error('Failed to start bot');
    }
  };

  // Stop bot function
  const stopBot = async () => {
    if (!data.strategyName) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const apiUsername = 'meghan';
      const apiPassword = session.user.id;

      const response = await apiFetch(`/user/${data.strategyName}/api/v1/stop`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
        }
      }, exchangeNameRef.current);

      if (!response.ok) {
        throw new Error(`Failed to stop bot: ${response.status}`);
      }

      toast.success('Bot stopped successfully');
      setData(prev => ({ ...prev, botStatus: 'stopped' }));
    } catch (error) {
      console.error('[useLiveBotData] Error stopping bot:', error);
      toast.error('Failed to stop bot');
    }
  };

  return {
    ...data,
    startBot,
    stopBot,
    refresh: () => fetchLiveData(data.strategyName, data.exchangeName),
  };
}
