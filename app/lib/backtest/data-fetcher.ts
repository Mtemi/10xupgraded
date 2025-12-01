export interface OHLCVCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const CACHE_KEY_PREFIX = 'ohlcv_cache_';
const CACHE_DURATION = 24 * 60 * 60 * 1000;

export async function fetchHistoricalData(
  symbol: string = 'BTC/USDT',
  timeframe: string = '5m',
  months: number = 3
): Promise<OHLCVCandle[]> {
  const cacheKey = `${CACHE_KEY_PREFIX}${symbol}_${timeframe}`;
  const cached = getCachedData(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const mockData = generateMockData(symbol, timeframe, months);
  setCachedData(cacheKey, mockData);
  return mockData;
}

function getCachedData(key: string): { data: OHLCVCandle[]; timestamp: number } | null {
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('Failed to read cache:', error);
  }
  return null;
}

function setCachedData(key: string, data: OHLCVCandle[]): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    console.error('Failed to cache data:', error);
  }
}

function generateMockData(symbol: string, timeframe: string, months: number): OHLCVCandle[] {
  const candles: OHLCVCandle[] = [];
  const intervalsPerMonth = {
    '1m': 43200,
    '5m': 8640,
    '15m': 2880,
    '1h': 720,
    '4h': 180,
    '1d': 30,
  };

  const totalCandles = (intervalsPerMonth[timeframe as keyof typeof intervalsPerMonth] || 8640) * months;
  const timeInterval = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };

  const interval = timeInterval[timeframe as keyof typeof timeInterval] || 5 * 60 * 1000;
  const startTime = Date.now() - totalCandles * interval;

  let price = 40000;

  for (let i = 0; i < totalCandles; i++) {
    const change = (Math.random() - 0.5) * 1000;
    price += change;

    const open = price;
    const close = price + (Math.random() - 0.5) * 500;
    const high = Math.max(open, close) + Math.random() * 200;
    const low = Math.min(open, close) - Math.random() * 200;

    candles.push({
      time: startTime + i * interval,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000,
    });

    price = close;
  }

  return candles;
}
