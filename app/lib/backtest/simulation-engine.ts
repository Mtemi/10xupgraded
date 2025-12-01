import type { OHLCVCandle } from './data-fetcher';
import type { ParsedStrategy, Condition } from './strategy-parser';
import type { Dataframe } from './indicator-calculator';

export interface Trade {
  type: 'entry' | 'exit';
  time: number;
  price: number;
  profit?: number;
  profitPct?: number;
  reason?: string;
}

export interface BacktestResult {
  trades: Trade[];
  equity: { time: number; value: number }[];
  finalBalance: number;
  roi: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgProfit: number;
  maxDrawdown: number;
  sharpeRatio: number;
  logs: string[];
}

interface Position {
  entryTime: number;
  entryPrice: number;
  amount: number;
  highestPrice: number;
}

export function runBacktest(
  ohlcvData: OHLCVCandle[],
  dataframe: Dataframe,
  strategy: ParsedStrategy,
  startingBalance: number = 1000
): BacktestResult {
  let balance = startingBalance;
  let position: Position | null = null;
  const trades: Trade[] = [];
  const equity: { time: number; value: number }[] = [];
  const logs: string[] = [];

  let peakBalance = startingBalance;
  let maxDrawdown = 0;

  for (let i = 0; i < ohlcvData.length; i++) {
    const candle = ohlcvData[i];

    const hasData = strategy.indicators.every((ind) => {
      const value = dataframe[ind.name]?.[i];
      return value !== undefined && !isNaN(value);
    });

    if (!hasData) continue;

    if (!position) {
      const shouldEnter = checkConditions(dataframe, i, strategy.entryConditions);

      if (shouldEnter) {
        const entryAmount = balance / candle.close;
        position = {
          entryTime: candle.time,
          entryPrice: candle.close,
          amount: entryAmount,
          highestPrice: candle.close,
        };

        const entryTrade: Trade = {
          type: 'entry',
          time: candle.time,
          price: candle.close,
          reason: formatReason(dataframe, i, strategy.entryConditions),
        };
        trades.push(entryTrade);

        const timestamp = new Date(candle.time).toISOString().replace('T', ' ').substring(0, 19);
        logs.push(
          `${timestamp} - [STRATEGY] Creating BUY order @ $${candle.close.toFixed(2)} | ${entryTrade.reason}`
        );
      }
    }

    if (position) {
      position.highestPrice = Math.max(position.highestPrice, candle.high);

      const shouldExit = checkConditions(dataframe, i, strategy.exitConditions);
      const profitPct = ((candle.close - position.entryPrice) / position.entryPrice) * 100;
      const timeSinceEntry = (candle.time - position.entryTime) / 1000 / 60;

      const roiTarget = getROITarget(strategy.roi, timeSinceEntry);
      const hitROI = profitPct >= roiTarget * 100;

      const hitStoploss = profitPct <= strategy.stoploss * 100;

      if (shouldExit || hitROI || hitStoploss) {
        const exitValue = position.amount * candle.close;
        const profit = exitValue - balance;
        balance = exitValue;

        const exitReason = shouldExit
          ? 'Exit signal'
          : hitROI
            ? `ROI target (${roiTarget * 100}%)`
            : 'Stoploss';

        const exitTrade: Trade = {
          type: 'exit',
          time: candle.time,
          price: candle.close,
          profit,
          profitPct,
          reason: exitReason,
        };
        trades.push(exitTrade);

        const timestamp = new Date(candle.time).toISOString().replace('T', ' ').substring(0, 19);
        const profitSign = profit >= 0 ? '+' : '';
        logs.push(
          `${timestamp} - [STRATEGY] Executing SELL @ $${candle.close.toFixed(2)} | Profit: ${profitSign}${profit.toFixed(2)} (${profitPct.toFixed(2)}%) | ${exitReason}`
        );

        position = null;
      }
    }

    const currentEquity = position ? position.amount * candle.close : balance;

    equity.push({ time: candle.time, value: currentEquity });

    if (currentEquity > peakBalance) {
      peakBalance = currentEquity;
    }

    const drawdown = ((peakBalance - currentEquity) / peakBalance) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const closedTrades = trades.filter((t) => t.type === 'exit');
  const winningTrades = closedTrades.filter((t) => t.profit && t.profit > 0).length;
  const losingTrades = closedTrades.filter((t) => t.profit && t.profit <= 0).length;
  const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);

  const roi = ((balance - startingBalance) / startingBalance) * 100;
  const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;
  const avgProfit = closedTrades.length > 0 ? totalProfit / closedTrades.length : 0;
  const sharpeRatio = calculateSharpe(equity, startingBalance);

  return {
    trades,
    equity,
    finalBalance: balance,
    roi,
    totalTrades: trades.filter((t) => t.type === 'entry').length,
    winningTrades,
    losingTrades,
    winRate,
    avgProfit,
    maxDrawdown,
    sharpeRatio,
    logs,
  };
}

function checkConditions(dataframe: Dataframe, index: number, conditions: Condition[]): boolean {
  return conditions.every((cond) => {
    const value = dataframe[cond.indicator]?.[index];
    if (value === undefined || isNaN(value)) return false;

    switch (cond.operator) {
      case '>':
        return value > cond.value;
      case '<':
        return value < cond.value;
      case '>=':
        return value >= cond.value;
      case '<=':
        return value <= cond.value;
      case '==':
        return value === cond.value;
      case '!=':
        return value !== cond.value;
      default:
        return false;
    }
  });
}

function formatReason(dataframe: Dataframe, index: number, conditions: Condition[]): string {
  return conditions
    .map((cond) => {
      const value = dataframe[cond.indicator]?.[index];
      return `${cond.indicator.toUpperCase()}(${value?.toFixed(2)}) ${cond.operator} ${cond.value}`;
    })
    .join(' & ');
}

function getROITarget(roi: Record<string, number>, minutesElapsed: number): number {
  const sortedKeys = Object.keys(roi)
    .map(Number)
    .sort((a, b) => b - a);

  for (const minutes of sortedKeys) {
    if (minutesElapsed >= minutes) {
      return roi[minutes.toString()];
    }
  }

  return roi['0'] || 0.1;
}

function calculateSharpe(equity: { time: number; value: number }[], startingBalance: number): number {
  if (equity.length < 2) return 0;

  const returns = [];
  for (let i = 1; i < equity.length; i++) {
    const ret = (equity[i].value - equity[i - 1].value) / equity[i - 1].value;
    returns.push(ret);
  }

  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  return (avgReturn / stdDev) * Math.sqrt(252);
}
