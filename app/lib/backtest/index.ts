import { parseFreqtradeStrategy } from './strategy-parser';
import { fetchHistoricalData } from './data-fetcher';
import { calculateIndicators } from './indicator-calculator';
import { runBacktest } from './simulation-engine';
import type { BacktestResult } from './simulation-engine';

export async function executeBacktest(
  pythonCode: string,
  symbol: string = 'BTC/USDT',
  startingBalance: number = 1000
): Promise<BacktestResult> {
  const strategy = parseFreqtradeStrategy(pythonCode);

  const ohlcvData = await fetchHistoricalData(symbol, strategy.timeframe, 3);

  const dataframe = calculateIndicators(ohlcvData, strategy.indicators);

  const result = runBacktest(ohlcvData, dataframe, strategy, startingBalance);

  return result;
}

export type { BacktestResult } from './simulation-engine';
export type { ParsedStrategy } from './strategy-parser';
