import { useState, useEffect, useCallback } from 'react';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';

interface Trade {
  trade_id: number;
  pair: string;
  direction: string;
  open_date: string;
  open_rate: number;
  close_date?: string;
  close_rate?: number;
  profit_ratio?: number;
  profit_amount?: number;
  exit_reason?: string;
  amount: number;
  stake_currency: string;
  base_currency: string;
  quote_currency: string;
}

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  [key: string]: any; // For indicators
}

interface TradingDataHookProps {
  strategyName: string;
  selectedPair: string;
  timeframe: string;
}

export function useTradingData({ strategyName, selectedPair, timeframe }: TradingDataHookProps) {
  const [candleData, setCandleData] = useState<CandleData[]>([]);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get authentication header
  const getAuthHeader = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Authentication required');
    return 'Basic ' + btoa(`meghan:${user.id}`);
  }, []);

  // Fetch historical candle data
  const fetchCandleData = useCallback(async (limit: number = 1000) => {
    try {
      const authHeader = await getAuthHeader();
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/pair_candles?pair=${selectedPair}&timeframe=${timeframe}&limit=${limit}`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': authHeader }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch candles: ${response.statusText}`);
      }

      const data: CandleData[] = await response.json();
      setCandleData(data);
      return data;
    } catch (error) {
      console.error('Error fetching candle data:', error);
      throw error;
    }
  }, [strategyName, selectedPair, timeframe, getAuthHeader]);

  // Fetch historical data with strategy indicators
  const fetchHistoricalData = useCallback(async (timerange?: string) => {
    try {
      const authHeader = await getAuthHeader();
      const url = new URL(`https://10xtraders.ai/user/${strategyName}/api/v1/pair_history`);
      url.searchParams.set('pair', selectedPair);
      url.searchParams.set('timeframe', timeframe);
      url.searchParams.set('strategy', strategyName);
      
      if (timerange) {
        url.searchParams.set('timerange', timerange);
      }

      const response = await fetch(url.toString(), {
        headers: { 'Authorization': authHeader }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch historical data: ${response.statusText}`);
      }

      const data: CandleData[] = await response.json();
      setCandleData(data);
      return data;
    } catch (error) {
      console.error('Error fetching historical data:', error);
      throw error;
    }
  }, [strategyName, selectedPair, timeframe, getAuthHeader]);

  // Fetch open trades
  const fetchOpenTrades = useCallback(async () => {
    try {
      const authHeader = await getAuthHeader();
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/status`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': authHeader }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch open trades: ${response.statusText}`);
      }

      const data: Trade[] = await response.json();
      setOpenTrades(data);
      return data;
    } catch (error) {
      console.error('Error fetching open trades:', error);
      throw error;
    }
  }, [strategyName, getAuthHeader]);

  // Fetch closed trades
  const fetchClosedTrades = useCallback(async (limit: number = 100) => {
    try {
      const authHeader = await getAuthHeader();
      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/trades?pair=${selectedPair}&limit=${limit}`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': authHeader }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch closed trades: ${response.statusText}`);
      }

      const data: Trade[] = await response.json();
      setClosedTrades(data);
      return data;
    } catch (error) {
      console.error('Error fetching closed trades:', error);
      throw error;
    }
  }, [strategyName, selectedPair, getAuthHeader]);

  // Load all initial data
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      await Promise.all([
        fetchCandleData(),
        fetchOpenTrades(),
        fetchClosedTrades()
      ]);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load trading data';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [fetchCandleData, fetchOpenTrades, fetchClosedTrades]);

  // Load data when parameters change
  useEffect(() => {
    if (strategyName && selectedPair && timeframe) {
      loadInitialData();
    }
  }, [strategyName, selectedPair, timeframe, loadInitialData]);

  // Add new candle data (for real-time updates)
  const addCandleData = useCallback((newCandle: CandleData) => {
    setCandleData(prev => {
      const newTime = new Date(newCandle.date).getTime();
      const lastCandle = prev[prev.length - 1];
      
      if (lastCandle && new Date(lastCandle.date).getTime() === newTime) {
        // Update existing candle
        return [...prev.slice(0, -1), newCandle];
      } else {
        // Add new candle
        return [...prev, newCandle];
      }
    });
  }, []);

  // Update trade data
  const addTrade = useCallback((trade: Trade) => {
    if (trade.close_date) {
      // Closed trade
      setClosedTrades(prev => [...prev, trade]);
      setOpenTrades(prev => prev.filter(t => t.trade_id !== trade.trade_id));
    } else {
      // Open trade
      setOpenTrades(prev => [...prev, trade]);
    }
  }, []);

  const removeTrade = useCallback((tradeId: number) => {
    setOpenTrades(prev => prev.filter(t => t.trade_id !== tradeId));
  }, []);

  return {
    candleData,
    openTrades,
    closedTrades,
    isLoading,
    error,
    loadInitialData,
    fetchCandleData,
    fetchHistoricalData,
    fetchOpenTrades,
    fetchClosedTrades,
    addCandleData,
    addTrade,
    removeTrade,
  };
}