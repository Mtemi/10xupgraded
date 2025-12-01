import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle, PriceScaleMode } from 'lightweight-charts';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { themeStore } from '~/lib/stores/theme';

// === Types ===
interface Trade {
  open_time: number;
  open_price: number;
  close_time?: number;
  close_price?: number;
  profit?: string | number;
  pair?: string;
  amount?: number;
  exit_reason?: string;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface TradingViewLightweightChartProps {
  strategyName: string;
  selectedPair: string;
  timeframe: string;
  openTrades: Trade[];
  closedTrades: Trade[];
  height?: number;
  className?: string;
}

// === Timeframe Mapping ===
const timeframeToSeconds = (tf: string): number => {
  const mapping: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
    '1w': 604800,
    '1M': 2592000
  };
  return mapping[tf] || 300;
};

export function TradingViewLightweightChart({
  strategyName,
  selectedPair,
  timeframe,
  openTrades = [],
  closedTrades = [],
  height = 600,
  className = ''
}: TradingViewLightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const theme = useStore(themeStore);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candleData, setCandleData] = useState<CandleData[]>([]);

  // === Chart Theme Configuration ===
  const getChartOptions = useCallback(() => {
    const isDark = theme === 'dark';
    
    return {
      layout: {
        background: { 
          type: ColorType.Solid, 
          color: isDark ? '#1a1a1a' : '#ffffff' 
        },
        textColor: isDark ? '#d1d5db' : '#374151',
        fontSize: 12,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
      },
      grid: {
        vertLines: { 
          color: isDark ? '#374151' : '#e5e7eb',
          style: LineStyle.Dotted
        },
        horzLines: { 
          color: isDark ? '#374151' : '#e5e7eb',
          style: LineStyle.Dotted
        }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#6b7280' : '#9ca3af',
          width: 1,
          style: LineStyle.Dashed
        },
        horzLine: {
          color: isDark ? '#6b7280' : '#9ca3af',
          width: 1,
          style: LineStyle.Dashed
        }
      },
      rightPriceScale: {
        borderColor: isDark ? '#374151' : '#e5e7eb',
        mode: PriceScaleMode.Normal,
        autoScale: true
      },
      timeScale: {
        borderColor: isDark ? '#374151' : '#e5e7eb',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 4
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      }
    };
  }, [theme]);

  // === Fetch Candle Data ===
  const fetchCandleData = useCallback(async () => {
    if (!strategyName || !selectedPair || !timeframe) return;

    try {
      setIsLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Authentication required');

      const url = `https://10xtraders.ai/user/${strategyName}/api/v1/pair_candles?pair=${selectedPair}&timeframe=${timeframe}&limit=1000`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': 'Basic ' + btoa(`meghan:${user.id}`) }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        setCandleData([]);
        return;
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        setCandleData([]);
        return;
      }

      if (!json.columns || !json.data || json.data.length === 0) {
        setCandleData([]);
        return;
      }

      // Parse the data structure
      const cols = json.columns;
      const iDate = cols.indexOf('date');
      const iOpen = cols.indexOf('open');
      const iHigh = cols.indexOf('high');
      const iLow = cols.indexOf('low');
      const iClose = cols.indexOf('close');
      const iVolume = cols.indexOf('volume');

      if (iDate < 0 || iOpen < 0 || iHigh < 0 || iLow < 0 || iClose < 0) {
        throw new Error('Invalid data format');
      }

      const candles = json.data.map((row: any[]) => ({
        time: Math.floor((row[11] && !isNaN(row[11]) ? Number(row[11]) : new Date(row[iDate]).getTime()) / 1000),
        open: Number(row[iOpen]),
        high: Number(row[iHigh]),
        low: Number(row[iLow]),
        close: Number(row[iClose]),
        volume: iVolume >= 0 ? Number(row[iVolume]) : 0
      })).sort((a: CandleData, b: CandleData) => a.time - b.time);

      setCandleData(candles);
    } catch (err) {
      console.error('Error fetching candle data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, [strategyName, selectedPair, timeframe]);

  // === Create Trade Markers ===
  const createTradeMarkers = useCallback(() => {
    const markers: any[] = [];
    const allTrades = [...openTrades, ...closedTrades];

    allTrades.forEach((trade, index) => {
      if (trade.pair !== selectedPair) return;

      // Entry marker
      const openTime = Math.floor((trade.open_time > 1e12 ? trade.open_time / 1000 : trade.open_time));
      markers.push({
        time: openTime,
        position: 'belowBar',
        color: '#00ff88',
        shape: 'arrowUp',
        text: `Buy @ ${trade.open_price.toFixed(4)}`,
        size: 1
      });

      // Exit marker (for closed trades)
      if (trade.close_time && trade.close_price) {
        const closeTime = Math.floor((trade.close_time > 1e12 ? trade.close_time / 1000 : trade.close_time));
        const profit = typeof trade.profit === 'number' ? trade.profit : parseFloat(trade.profit || '0');
        const isProfit = profit > 0;

        markers.push({
          time: closeTime,
          position: 'aboveBar',
          color: isProfit ? '#00ff88' : '#ff4444',
          shape: 'arrowDown',
          text: `Sell @ ${trade.close_price.toFixed(4)} (${isProfit ? '+' : ''}${profit.toFixed(2)}%)`,
          size: 1
        });
      }
    });

    return markers;
  }, [openTrades, closedTrades, selectedPair]);

  // === Initialize Chart ===
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      ...getChartOptions(),
      width: chartContainerRef.current.clientWidth,
      height: height
    });

    chartRef.current = chart;

    // Create candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff4444',
      borderDownColor: '#ff4444',
      borderUpColor: '#00ff88',
      wickDownColor: '#ff4444',
      wickUpColor: '#00ff88',
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001
      }
    });

    candlestickSeriesRef.current = candlestickSeries;

    // Create volume series
    const volumeSeries = chart.addHistogramSeries({
      color: theme === 'dark' ? '#6b7280' : '#9ca3af',
      priceFormat: {
        type: 'volume'
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0
      }
    });

    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
      }
    };
  }, [height, getChartOptions]);

  // === Update Chart Data ===
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    if (candleData.length > 0) {
      // Set candlestick data
      candlestickSeriesRef.current.setData(candleData);

      // Set volume data
      const volumeData = candleData.map(candle => ({
        time: candle.time,
        value: candle.volume || 0,
        color: candle.close >= candle.open 
          ? (theme === 'dark' ? '#00ff8844' : '#00ff8866')
          : (theme === 'dark' ? '#ff444444' : '#ff444466')
      }));
      
      volumeSeriesRef.current.setData(volumeData);

      // Fit content to show all data
      chartRef.current?.timeScale().fitContent();
    }
  }, [candleData, theme]);

  // === Update Trade Markers ===
  useEffect(() => {
    if (!candlestickSeriesRef.current) return;

    const markers = createTradeMarkers();
    candlestickSeriesRef.current.setMarkers(markers);
    markersRef.current = markers;
  }, [createTradeMarkers]);

  // === Update Chart Theme ===
  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.applyOptions(getChartOptions());
  }, [getChartOptions]);

  // === Fetch Data on Props Change ===
  useEffect(() => {
    fetchCandleData();
  }, [fetchCandleData]);

  // === Handle Real-time Updates ===
  useEffect(() => {
    const handleNewCandle = (event: CustomEvent) => {
      const data = event.detail;
      if (data.pair !== selectedPair || !candlestickSeriesRef.current) return;

      const newCandle: CandleData = {
        time: Math.floor(new Date(data.candle.timestamp).getTime() / 1000),
        open: data.candle.open,
        high: data.candle.high,
        low: data.candle.low,
        close: data.candle.close,
        volume: data.candle.volume || 0
      };

      // Update the last candle or add new one
      setCandleData(prev => {
        const newData = [...prev];
        const lastIndex = newData.length - 1;
        
        if (lastIndex >= 0 && newData[lastIndex].time === newCandle.time) {
          // Update existing candle
          newData[lastIndex] = newCandle;
        } else {
          // Add new candle
          newData.push(newCandle);
        }
        
        return newData;
      });
    };

    window.addEventListener('freqtrade:new_candle', handleNewCandle as EventListener);
    return () => window.removeEventListener('freqtrade:new_candle', handleNewCandle as EventListener);
  }, [selectedPair]);

  // === Render ===
  if (error) {
    return (
      <div className={classNames('flex items-center justify-center bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor', className)} style={{ height }}>
        <div className="text-center p-6">
          <div className="i-ph:warning-circle text-4xl text-red-500 mb-2" />
          <p className="text-bolt-elements-textSecondary">Failed to load chart data</p>
          <p className="text-xs text-bolt-elements-textTertiary mt-1">{error}</p>
          <button
            onClick={fetchCandleData}
            className="mt-3 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={classNames('flex items-center justify-center bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor', className)} style={{ height }}>
        <div className="text-center">
          <div className="i-svg-spinners:90-ring-with-bg text-4xl text-accent-500 mb-2" />
          <p className="text-bolt-elements-textSecondary">Loading chart data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={classNames('relative bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor overflow-hidden', className)}>
      {/* Chart Header */}
      <div className="flex items-center justify-between p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-bolt-elements-textPrimary">
            {selectedPair} • {timeframe}
          </h3>
          <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              Open: {openTrades.length}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              Closed: {closedTrades.length}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCandleData}
            className="p-1.5 rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4 transition-colors"
            title="Refresh data"
          >
            <div className="i-ph:arrow-clockwise text-sm" />
          </button>
          <button
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className="p-1.5 rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4 transition-colors"
            title="Fit to content"
          >
            <div className="i-ph:arrows-out text-sm" />
          </button>
        </div>
      </div>

      {/* Chart Container */}
      <div 
        ref={chartContainerRef} 
        style={{ height: height - 60 }} // Subtract header height
        className="w-full"
      />

      {/* Chart Info Overlay */}
      {candleData.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bolt-elements-background-depth-2/80">
          <div className="text-center">
            <div className="i-ph:chart-line text-4xl text-bolt-elements-textTertiary mb-2" />
            <p className="text-bolt-elements-textSecondary">No chart data available</p>
            <p className="text-xs text-bolt-elements-textTertiary mt-1">
              Try selecting a different pair or timeframe
            </p>
          </div>
        </div>
      )}

      {/* Trade Statistics */}
      {(openTrades.length > 0 || closedTrades.length > 0) && (
        <div className="absolute top-16 left-3 bg-bolt-elements-background-depth-3/90 backdrop-blur-sm rounded-md p-2 text-xs">
          <div className="space-y-1">
            {openTrades.length > 0 && (
              <div className="text-green-500">
                Open Trades: {openTrades.length}
              </div>
            )}
            {closedTrades.length > 0 && (
              <div className="text-bolt-elements-textSecondary">
                Closed: {closedTrades.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// === Export Default ===
export default TradingViewLightweightChart;