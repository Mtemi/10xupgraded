import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CrosshairMode,
  ColorType,
  PriceScaleMode,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { executeBacktest, type BacktestResult } from '~/lib/backtest';
import { fetchBinanceCandles, subscribeToBinanceStream, type BinanceCandle } from '~/lib/binance/live-data';

interface BacktestChartProps {
  pythonCode: string;
  symbol?: string;
  onBacktestComplete?: (result: BacktestResult) => void;
  onLogs?: (logs: string[]) => void;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Marker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

// Fetch live data from Binance
const fetchLiveData = async (symbol: string = 'BTCUSDT', count: number = 100): Promise<Candle[]> => {
  try {
    const binanceData = await fetchBinanceCandles(symbol, '5m', count);
    return binanceData;
  } catch (error) {
    console.error('Error fetching live data:', error);
    return generateFallbackData(count);
  }
};

const generateFallbackData = (count: number = 100): Candle[] => {
  const now = Date.now();
  const data: Candle[] = [];
  let price = 97000; // Current realistic BTC price

  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * 5 * 60 * 1000;
    const volatility = price * 0.002;
    const change = (Math.random() - 0.48) * volatility;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;

    data.push({
      time: Math.floor(time / 1000),
      open,
      high,
      low,
      close,
    });

    price = close;
  }

  return data;
};

const generatePlaceholderMarkers = (data: Candle[]): Marker[] => {
  const markers: Marker[] = [];
  const tradeCount = Math.floor(data.length / 25); // Reduced from 10 to 25 (fewer trades, less clutter)

  for (let i = 0; i < tradeCount; i++) {
    const buyIndex = Math.floor(Math.random() * (data.length - 20)) + 10;
    const sellIndex = buyIndex + Math.floor(Math.random() * 12) + 5;

    // Buy marker - no text for cleaner look
    markers.push({
      time: data[buyIndex].time,
      position: 'belowBar',
      color: '#22c55e',
      shape: 'arrowUp',
      text: '',
    });

    // Sell marker - no text for cleaner look
    if (sellIndex < data.length) {
      const profitPct = ((data[sellIndex].close - data[buyIndex].close) / data[buyIndex].close) * 100;
      markers.push({
        time: data[sellIndex].time,
        position: 'aboveBar',
        color: profitPct > 0 ? '#22c55e' : '#ef4444',
        shape: 'arrowDown',
        text: '',
      });
    }
  }

  return markers.sort((a, b) => a.time - b.time);
};

export function BacktestChart({ pythonCode, symbol = 'BTC/USDT', onBacktestComplete, onLogs }: BacktestChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indicatorSeriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedPlaceholder, setHasLoadedPlaceholder] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0a' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42,46,57,0.3)' },
        horzLines: { color: 'rgba(42,46,57,0.3)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#2a2e39',
        mode: PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        fixLeftEdge: false,
        fixRightEdge: false,
        minBarSpacing: 4,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      autoSize: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== containerRef.current) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });

    resizeObserver.observe(containerRef.current);

    // Fetch live data from Binance
    let chartData: Candle[] = [];
    let unsubscribe: (() => void) | null = null;

    fetchLiveData('BTCUSDT', 300).then(liveData => {
      chartData = liveData;
      candleSeries.setData(chartData);

      // Add buy/sell markers
      const markers = generatePlaceholderMarkers(chartData);
      candleSeries.setMarkers(markers);

      // Fit content to show all data initially
      setTimeout(() => {
        chart.timeScale().fitContent();
      }, 100);

      setHasLoadedPlaceholder(true);

      // Subscribe to live WebSocket updates from Binance
      unsubscribe = subscribeToBinanceStream('btcusdt', (newCandle: BinanceCandle) => {
        if (chartData.length > 0) {
          const lastCandle = chartData[chartData.length - 1];
          // If same time, update. Otherwise, append
          if (lastCandle.time === newCandle.time) {
            chartData[chartData.length - 1] = newCandle;
          } else {
            chartData.push(newCandle);
            if (chartData.length > 300) {
              chartData.shift();
            }
          }
          candleSeries.update(newCandle);
        }
      });
    }).catch(() => {
      // Fallback to generated data
      chartData = generateFallbackData(300);
      candleSeries.setData(chartData);
      setHasLoadedPlaceholder(true);
    });

    return () => {
      if (unsubscribe) unsubscribe();
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!pythonCode.trim() || !chartRef.current || !candleSeriesRef.current) {
      setIsLoading(false);
      return;
    }

    const runBacktest = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const result = await executeBacktest(pythonCode, symbol, 1000);

        if (result.ohlcvData && result.ohlcvData.length > 0) {
          const candles: Candle[] = result.ohlcvData.map((candle) => ({
            time: (candle.time / 1000) as number,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          }));

          candleSeriesRef.current?.setData(candles);

          if (result.trades && result.trades.length > 0) {
            const markers: Marker[] = result.trades.map((trade) => ({
              time: (trade.time / 1000) as number,
              position: trade.type === 'entry' ? 'belowBar' : 'aboveBar',
              color: trade.type === 'entry' ? '#22c55e' : trade.profitPct && trade.profitPct > 0 ? '#22c55e' : '#ef4444',
              shape: trade.type === 'entry' ? 'arrowUp' : 'arrowDown',
              text:
                trade.type === 'entry'
                  ? `Buy $${trade.price.toFixed(2)}`
                  : `Sell $${trade.price.toFixed(2)} ${trade.profitPct ? `(${trade.profitPct.toFixed(1)}%)` : ''}`,
            }));

            candleSeriesRef.current?.setMarkers(markers);
          }

          if (result.indicators) {
            indicatorSeriesRefs.current.forEach((series) => {
              chartRef.current?.removeSeries(series);
            });
            indicatorSeriesRefs.current.clear();

            Object.entries(result.indicators).forEach(([name, values]) => {
              if (Array.isArray(values) && values.length > 0) {
                const color = getIndicatorColor(name);
                const lineSeries = chartRef.current!.addLineSeries({
                  color,
                  lineWidth: 2,
                  title: name,
                });

                const lineData = values
                  .map((value, index) => {
                    if (result.ohlcvData && result.ohlcvData[index]) {
                      return {
                        time: (result.ohlcvData[index].time / 1000) as number,
                        value: value as number,
                      };
                    }
                    return null;
                  })
                  .filter((d): d is { time: UTCTimestamp; value: number } => d !== null && !isNaN(d.value));

                lineSeries.setData(lineData);
                indicatorSeriesRefs.current.set(name, lineSeries);
              }
            });
          }

          chartRef.current?.timeScale().fitContent();

          if (onBacktestComplete) {
            onBacktestComplete(result);
          }

          if (onLogs && result.logs) {
            onLogs(result.logs);
          }
        }
      } catch (err) {
        console.error('Backtest error:', err);
        setError(err instanceof Error ? err.message : 'Failed to run backtest');
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(runBacktest, 500);

    return () => clearTimeout(debounceTimer);
  }, [pythonCode, symbol, onBacktestComplete]);

  const getIndicatorColor = (name: string): string => {
    const colorMap: Record<string, string> = {
      sma: '#3b82f6',
      ema: '#8b5cf6',
      rsi: '#f59e0b',
      macd: '#06b6d4',
      bb_upper: '#ec4899',
      bb_lower: '#ec4899',
      bb_middle: '#a855f7',
    };

    const lowerName = name.toLowerCase();
    for (const [key, color] of Object.entries(colorMap)) {
      if (lowerName.includes(key)) {
        return color;
      }
    }

    return '#64748b';
  };

  return (
    <div className="relative w-full h-full bg-[#0a0a0a]">
      {isLoading && hasLoadedPlaceholder && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/90 z-10 backdrop-blur-sm">
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

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 z-10">
          <div className="flex flex-col items-center gap-2 max-w-md p-4 text-center">
            <div className="i-ph:warning-circle text-3xl text-red-500" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
