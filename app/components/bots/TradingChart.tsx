// src/components/bots/TradingChart.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CrosshairMode,
  ColorType,
  LineStyle,
  PriceScaleMode,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { supabase } from '~/lib/superbase/client';
import { useFreqtradeWS } from '~/lib/hooks/useFreqtradeWS';

interface TradingChartProps {
  strategyName: string;
  selectedPair: string;
  timeframe: string;
  theme: 'light' | 'dark';
  exchangeName?: string;
}

interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Marker {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text: string;
  size: number;
}

// === Domain helper (match BotList/BotDashboard rule: only binanceus => US, else EU) ===
const apiHostForExchange = (name?: string) => {
  const n = (name || '').trim().toLowerCase();
  return n === 'binanceus' ? 'https://10xtraders.ai' : 'https://eu.10xtraders.ai';
};

export default function TradingChart({
  strategyName,
  selectedPair,
  timeframe,
  theme,
  exchangeName,
}: TradingChartProps) {
  const apiBase = apiHostForExchange(exchangeName);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build Basic Auth header from Supabase user
  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw new Error('Not authenticated');
    }
    const header = 'Basic ' + btoa(`meghan:${data.user.id}`);
    return header;
  }, []);

  // Initialize chart once
  const initChart = useCallback(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: theme === 'dark' ? '#1e1e1e' : '#ffffff' },
        textColor: theme === 'dark' ? '#d1d4dc' : '#333333',
      },
      grid: {
        vertLines: { color: theme === 'dark' ? 'rgba(42,46,57,0.5)' : 'rgba(197,203,206,0.5)' },
        horzLines: { color: theme === 'dark' ? 'rgba(42,46,57,0.5)' : 'rgba(197,203,206,0.5)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: theme === 'dark' ? '#555' : '#ccc',
        mode: PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: theme === 'dark' ? '#555' : '#ccc',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 4,
        fixLeftEdge: false,
        lockVisibleTimeRangeOnResize: true,
      },
      width: containerRef.current.clientWidth,
      height: 400,
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });
    chartRef.current = chart;

    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });

    volumeSeriesRef.current = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: 'rgba(38, 166, 154, 0.5)',
    });
    
    chart.priceScale('volume').applyOptions({ 
      scaleMargins: { top: 0.7, bottom: 0 },
      mode: PriceScaleMode.Normal,
    });
  }, [theme]);

  // Resize observer
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: 400,
        });
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load historical candles + trades
  const loadInitialData = useCallback(async () => {
    if (!strategyName || !selectedPair || !timeframe) {
      console.log('[TradingChart] Skipping loadInitialData - missing requirements:', {
        strategyName,
        selectedPair,
        timeframe,
      });
      return;
    }

    console.log('[TradingChart] Starting loadInitialData for:', {
      strategyName,
      selectedPair,
      timeframe,
      exchangeName,
      apiBase,
    });

    setIsLoading(true);
    setError(null);

    try {
      const auth = await getAuthHeader();
      console.log('[TradingChart] Auth header generated (masked):', auth.substring(0, 20) + '...');

      // 1. Fetch historical candles
      const candlesUrl = `${apiBase}/user/${strategyName}/api/v1/pair_candles?pair=${encodeURIComponent(selectedPair)}&timeframe=${timeframe}&limit=500`;
      console.log('[TradingChart] Fetching candles from URL:', candlesUrl);
      console.log('[TradingChart] Request headers:', { Authorization: auth.substring(0, 30) + '...' });

      const candlesRes = await fetch(candlesUrl, { headers: { Authorization: auth } });
      console.log('[TradingChart] Candles response status:', candlesRes.status, candlesRes.statusText);

      if (!candlesRes.ok) {
        const errorText = await candlesRes.text();
        console.error('[TradingChart] Candles fetch failed:', {
          status: candlesRes.status,
          statusText: candlesRes.statusText,
          errorBody: errorText,
        });
        throw new Error(`Failed to fetch candles: ${candlesRes.status} ${candlesRes.statusText}`);
      }

      const responseText = await candlesRes.text();
      console.log('[TradingChart] Raw candles response (first 500 chars):', responseText.substring(0, 500));

      let rawCandles;
      try {
        rawCandles = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('[TradingChart] Failed to parse candles JSON:', parseErr);
        throw new Error('Invalid JSON response from candles endpoint');
      }

      console.log('[TradingChart] Parsed candles data type:', Array.isArray(rawCandles) ? 'Array' : typeof rawCandles);
      console.log('[TradingChart] Candles data structure keys:', Object.keys(rawCandles));

      // Check if response is in DataFrame format (columns + data arrays)
      let candleRows: any[];
      if (rawCandles.columns && Array.isArray(rawCandles.data)) {
        console.log('[TradingChart] Detected DataFrame format with columns:', rawCandles.columns);
        console.log('[TradingChart] Data rows count:', rawCandles.data.length);

        // Parse DataFrame format
        const cols = rawCandles.columns;
        const iDate = cols.indexOf('date');
        const iOpen = cols.indexOf('open');
        const iHigh = cols.indexOf('high');
        const iLow = cols.indexOf('low');
        const iClose = cols.indexOf('close');
        const iVolume = cols.indexOf('volume');
        const iTimestamp = cols.indexOf('__date_ts');

        if (iDate < 0 || iOpen < 0 || iHigh < 0 || iLow < 0 || iClose < 0) {
          console.error('[TradingChart] Missing required columns:', { iDate, iOpen, iHigh, iLow, iClose });
          throw new Error('Invalid DataFrame format - missing required columns');
        }

        console.log('[TradingChart] Column indices:', { iDate, iOpen, iHigh, iLow, iClose, iVolume, iTimestamp });

        candleRows = rawCandles.data.map((row: any[]) => ({
          date: row[iDate],
          open: row[iOpen],
          high: row[iHigh],
          low: row[iLow],
          close: row[iClose],
          volume: iVolume >= 0 ? row[iVolume] : 0,
          timestamp: iTimestamp >= 0 ? row[iTimestamp] : null,
        }));

        console.log('[TradingChart] Converted', candleRows.length, 'DataFrame rows to candle objects');
      } else if (Array.isArray(rawCandles)) {
        console.log('[TradingChart] Detected simple array format');
        candleRows = rawCandles;
      } else {
        throw new Error('Invalid candles data format - expected array or DataFrame');
      }

      if (candleRows.length === 0) {
        console.warn('[TradingChart] No candle data returned from API');
        throw new Error('No candle data available for this pair and timeframe');
      }

      console.log('[TradingChart] Received', candleRows.length, 'candles');
      console.log('[TradingChart] Sample raw candle (first):', candleRows[0]);

      // Process and validate candle data
      const candles: Candle[] = candleRows
        .map((c, idx) => {
          // Use __date_ts if available, otherwise parse date string
          const timestamp = c.timestamp
            ? (c.timestamp > 1e12 ? c.timestamp / 1000 : c.timestamp)
            : c.date
            ? new Date(c.date).getTime() / 1000
            : null;

          if (!timestamp || isNaN(timestamp)) {
            if (idx === 0) console.warn('[TradingChart] Invalid timestamp in candle:', c);
            return null;
          }

          const candle = {
            time: Math.floor(timestamp) as UTCTimestamp,
            open: parseFloat(c.open) || 0,
            high: parseFloat(c.high) || 0,
            low: parseFloat(c.low) || 0,
            close: parseFloat(c.close) || 0,
            volume: parseFloat(c.volume) || 0,
          };

          if (idx === 0) {
            console.log('[TradingChart] Processed first candle:', candle);
          }

          return candle;
        })
        .filter((c): c is Candle => c !== null && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
        .sort((a, b) => a.time - b.time);

      console.log('[TradingChart] Processed', candles.length, 'valid candles');

      if (candles.length === 0) {
        console.error('[TradingChart] No valid candles after processing');
        throw new Error('No valid candle data after processing');
      }

      // Set candle data
      console.log('[TradingChart] Setting', candles.length, 'candles to chart');
      candleSeriesRef.current?.setData(candles);

      // Set volume data
      const volumeData = candles.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
      }));
      console.log('[TradingChart] Setting', volumeData.length, 'volume bars to chart');
      volumeSeriesRef.current?.setData(volumeData);

      // 2. Fetch open trades
      const statusUrl = `${apiBase}/user/${strategyName}/api/v1/status`;
      console.log('[TradingChart] Fetching open trades from URL:', statusUrl);

      const statusRes = await fetch(statusUrl, { headers: { Authorization: auth } });
      console.log('[TradingChart] Open trades response status:', statusRes.status);

      let openTrades: any[] = [];
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        openTrades = Array.isArray(statusData) ? statusData : [];
        console.log('[TradingChart] Open trades count:', openTrades.length);
        if (openTrades.length > 0) {
          console.log('[TradingChart] Sample open trade:', openTrades[0]);
        }
      } else {
        console.warn('[TradingChart] Failed to fetch open trades:', statusRes.status);
      }

      // 3. Fetch closed trades
      const tradesUrl = `${apiBase}/user/${strategyName}/api/v1/trades?pair=${encodeURIComponent(selectedPair)}&limit=200`;
      console.log('[TradingChart] Fetching closed trades from URL:', tradesUrl);

      const tradesRes = await fetch(tradesUrl, { headers: { Authorization: auth } });
      console.log('[TradingChart] Closed trades response status:', tradesRes.status);

      let closedTrades: any[] = [];
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        closedTrades = Array.isArray(tradesData) ? tradesData :
                      Array.isArray(tradesData.trades) ? tradesData.trades : [];
        console.log('[TradingChart] Closed trades count:', closedTrades.length);
        if (closedTrades.length > 0) {
          console.log('[TradingChart] Sample closed trade:', closedTrades[0]);
        }
      } else {
        console.warn('[TradingChart] Failed to fetch closed trades:', tradesRes.status);
      }

      // 4. Create trade markers
      console.log('[TradingChart] Creating markers for pair:', selectedPair);
      const newMarkers: Marker[] = [];

      // Add markers for open trades
      openTrades.forEach(t => {
        if (t.pair === selectedPair) {
          const openTime = Math.floor(new Date(t.open_date).getTime() / 1000) as UTCTimestamp;
          newMarkers.push({
            time: openTime,
            position: 'belowBar',
            shape: 'arrowUp',
            color: '#26a69a',
            text: `OPEN\n$${parseFloat(t.open_rate).toFixed(4)}`,
            size: 1,
          });
        }
      });

      // Add markers for closed trades
      closedTrades.forEach(t => {
        if (t.pair !== selectedPair) return;
        
        const openTime = Math.floor(new Date(t.open_date).getTime() / 1000) as UTCTimestamp;
        newMarkers.push({
          time: openTime,
          position: 'belowBar',
          shape: 'arrowUp',
          color: '#26a69a',
          text: `BUY\n$${parseFloat(t.open_rate).toFixed(4)}`,
          size: 1,
        });
        
        if (t.close_date && t.close_rate) {
          const closeTime = Math.floor(new Date(t.close_date).getTime() / 1000) as UTCTimestamp;
          const profit = parseFloat(t.profit_ratio || '0') > 0;
          newMarkers.push({
            time: closeTime,
            position: 'aboveBar',
            shape: 'arrowDown',
            color: profit ? '#26a69a' : '#ef5350',
            text: `SELL\n$${parseFloat(t.close_rate).toFixed(4)}\n${(parseFloat(t.profit_ratio || '0') * 100).toFixed(1)}%`,
            size: 1,
          });
        }
      });

      console.log('[TradingChart] Created', newMarkers.length, 'trade markers');
      if (newMarkers.length > 0) {
        console.log('[TradingChart] Sample marker:', newMarkers[0]);
      }

      setMarkers(newMarkers);
      candleSeriesRef.current?.setMarkers(newMarkers);

      // Set visible range to show last ~150 candles (better spacing)
      if (candles.length > 0) {
        const lastTime = candles[candles.length - 1].time;
        const visibleCandles = Math.min(150, candles.length);
        const firstVisibleIndex = Math.max(0, candles.length - visibleCandles);
        const firstVisibleTime = candles[firstVisibleIndex].time;

        chartRef.current?.timeScale().setVisibleRange({
          from: firstVisibleTime as any,
          to: lastTime as any,
        });

        console.log('[TradingChart] Set visible range:', {
          from: new Date(firstVisibleTime * 1000).toISOString(),
          to: new Date(lastTime * 1000).toISOString(),
          visibleCandles,
        });
      }

      console.log('[TradingChart] ✅ Successfully loaded all chart data');

    } catch (err) {
      console.error('[TradingChart] ❌ Error loading data:', err);
      if (err instanceof Error) {
        console.error('[TradingChart] Error stack:', err.stack);
      }
      setError(err instanceof Error ? err.message : 'Failed to load chart data');
    } finally {
      setIsLoading(false);
    }
  }, [strategyName, selectedPair, timeframe, getAuthHeader, apiBase, exchangeName]);

  // WebSocket live updates
  const handleEvent = useCallback(
    async (ev: any) => {
      console.log('[TradingChart] WebSocket event received:', {
        type: ev.type,
        pair: ev.data?.pair,
        hasData: !!ev.data,
      });

      if (!chartRef.current) {
        console.warn('[TradingChart] Chart ref not available, skipping event');
        return;
      }

      switch (ev.type) {
        case 'analyzed_df':
          // Reload all data when new analysis is available
          console.log('[TradingChart] Received analyzed_df event, reloading data');
          await loadInitialData();
          break;
          
        case 'new_candle':
          const df = ev.data?.df;
          if (Array.isArray(df) && df.length) {
            const last = df[df.length - 1];
            const timestamp = last.date ? new Date(last.date).getTime() / 1000 : last.timestamp;
            
            if (timestamp && !isNaN(timestamp)) {
              const newCandle: Candle = {
                time: Math.floor(timestamp) as UTCTimestamp,
                open: parseFloat(last.open) || 0,
                high: parseFloat(last.high) || 0,
                low: parseFloat(last.low) || 0,
                close: parseFloat(last.close) || 0,
                volume: parseFloat(last.volume) || 0,
              };
              
              candleSeriesRef.current?.update(newCandle);
              volumeSeriesRef.current?.update({
                time: newCandle.time,
                value: newCandle.volume,
                color: newCandle.close >= newCandle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
              });
            }
          }
          break;
          
        case 'candle':
          // Handle direct candle updates
          if (ev.data && typeof ev.data === 'object') {
            const { ts, o, h, l, c, v } = ev.data;
            if (ts && o !== undefined && h !== undefined && l !== undefined && c !== undefined) {
              const newCandle: Candle = {
                time: Math.floor(ts) as UTCTimestamp,
                open: parseFloat(o),
                high: parseFloat(h),
                low: parseFloat(l),
                close: parseFloat(c),
                volume: parseFloat(v || '0'),
              };
              
              candleSeriesRef.current?.update(newCandle);
              if (v !== undefined) {
                volumeSeriesRef.current?.update({
                  time: newCandle.time,
                  value: newCandle.volume,
                  color: newCandle.close >= newCandle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
                });
              }
            }
          }
          break;
          
        case 'entry_fill':
        case 'exit_fill':
          // Reload markers when trades are filled
          setTimeout(() => loadInitialData(), 1000);
          break;
          
        case 'entry':
          // Add pending entry marker
          if (ev.data && ev.data.pair === selectedPair) {
            const entryTime = Math.floor(new Date(ev.data.open_date).getTime() / 1000) as UTCTimestamp;
            const pendingMarker: Marker = {
              time: entryTime,
              position: 'belowBar',
              shape: 'circle',
              color: '#FFA500',
              text: `PENDING BUY\n$${parseFloat(ev.data.limit || ev.data.open_rate).toFixed(4)}`,
              size: 1,
            };
            
            setMarkers(prev => {
              const updated = [...prev, pendingMarker];
              candleSeriesRef.current?.setMarkers(updated);
              return updated;
            });
          }
          break;
          
        case 'exit':
          // Add pending exit marker
          if (ev.data && ev.data.pair === selectedPair) {
            const exitTime = Math.floor(new Date(ev.data.close_date || ev.data.open_date).getTime() / 1000) as UTCTimestamp;
            const pendingMarker: Marker = {
              time: exitTime,
              position: 'aboveBar',
              shape: 'square',
              color: '#FFA500',
              text: `PENDING SELL\n$${parseFloat(ev.data.limit || ev.data.close_rate).toFixed(4)}`,
              size: 1,
            };
            
            setMarkers(prev => {
              const updated = [...prev, pendingMarker];
              candleSeriesRef.current?.setMarkers(updated);
              return updated;
            });
          }
          break;
          
        case 'entry_cancel':
        case 'exit_cancel':
          // Remove cancelled order markers
          if (ev.data?.order_id) {
            const orderId = ev.data.order_id;
            setMarkers(prev => {
              const updated = prev.filter(m => !m.text.includes(orderId));
              candleSeriesRef.current?.setMarkers(updated);
              return updated;
            });
          }
          break;
          
        default:
          // Ignore other event types
          break;
      }
    },
    [loadInitialData]
  );

  // WebSocket subscription for real-time updates
  useEffect(() => {
    console.log('[TradingChart] WebSocket subscription state:', {
      strategyName,
      selectedPair,
      timeframe,
      exchangeName,
      enabled: !!strategyName && !!selectedPair && !!timeframe,
    });
  }, [strategyName, selectedPair, timeframe, exchangeName]);

  useFreqtradeWS({
    strategyName,
    enabled: !!strategyName && !!selectedPair && !!timeframe,
    eventTypes: [
      'analyzed_df',
      'new_candle',
      'candle',
      'entry_fill',
      'exit_fill',
      'entry',
      'exit',
      'entry_cancel',
      'exit_cancel',
    ],
    exchangeName,
    onEvent: handleEvent,
  });

  useEffect(() => {
    console.log('[TradingChart] Initializing chart');
    initChart();
  }, [initChart]);

  useEffect(() => {
    console.log('[TradingChart] Triggering loadInitialData (delayed for chart init)');
    // Small delay to ensure chart is initialized first
    const timer = setTimeout(() => {
      loadInitialData();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadInitialData]);

  // Update chart theme when theme changes
  useEffect(() => {
    if (!chartRef.current) return;
    
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: theme === 'dark' ? '#1e1e1e' : '#ffffff' },
        textColor: theme === 'dark' ? '#d1d4dc' : '#333333',
      },
      grid: {
        vertLines: { color: theme === 'dark' ? 'rgba(42,46,57,0.5)' : 'rgba(197,203,206,0.5)' },
        horzLines: { color: theme === 'dark' ? 'rgba(42,46,57,0.5)' : 'rgba(197,203,206,0.5)' },
      },
    });
  }, [theme]);

  return (
    <div className="relative w-full h-[400px]">
      {/* Chart container - always rendered so lightweight-charts can mount */}
      <div
        ref={containerRef}
        className="w-full h-full bg-bolt-elements-background-depth-1 rounded-lg overflow-hidden"
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-bolt-elements-background-depth-1 rounded-lg flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-bolt-elements-textSecondary">Loading chart data...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && !isLoading && (
        <div className="absolute inset-0 bg-bolt-elements-background-depth-1 rounded-lg flex items-center justify-center z-10">
          <div className="text-center">
            <div className="i-ph:warning-circle text-4xl text-red-500 mb-2" />
            <p className="text-bolt-elements-textSecondary mb-2">Failed to load chart data</p>
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => loadInitialData()}
              className="mt-4 px-4 py-2 bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
