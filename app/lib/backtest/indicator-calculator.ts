import { RSI, MACD, BollingerBands, EMA, SMA, ATR, Stochastic } from 'technicalindicators';
import type { OHLCVCandle } from './data-fetcher';
import type { IndicatorConfig } from './strategy-parser';

export interface Dataframe {
  [key: string]: number[];
}

export function calculateIndicators(
  ohlcvData: OHLCVCandle[],
  indicators: IndicatorConfig[]
): Dataframe {
  const dataframe: Dataframe = {};

  indicators.forEach((ind) => {
    try {
      const values = calculateIndicator(ohlcvData, ind);
      if (values) {
        dataframe[ind.name] = values;
      }
    } catch (error) {
      console.error(`Failed to calculate indicator ${ind.name}:`, error);
      dataframe[ind.name] = new Array(ohlcvData.length).fill(0);
    }
  });

  return dataframe;
}

function calculateIndicator(ohlcvData: OHLCVCandle[], ind: IndicatorConfig): number[] {
  const closes = ohlcvData.map((c) => c.close);
  const highs = ohlcvData.map((c) => c.high);
  const lows = ohlcvData.map((c) => c.low);
  const opens = ohlcvData.map((c) => c.open);

  switch (ind.taFunction.toUpperCase()) {
    case 'RSI': {
      const period = ind.params.timeperiod || 14;
      const rsiValues = RSI.calculate({
        values: closes,
        period,
      });
      return padArray(rsiValues, ohlcvData.length);
    }

    case 'MACD': {
      const fastPeriod = ind.params.fastperiod || 12;
      const slowPeriod = ind.params.slowperiod || 26;
      const signalPeriod = ind.params.signalperiod || 9;

      const macdResult = MACD.calculate({
        values: closes,
        fastPeriod,
        slowPeriod,
        signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });

      if (ind.name.includes('signal')) {
        return padArray(
          macdResult.map((m) => m.signal || 0),
          ohlcvData.length
        );
      }
      if (ind.name.includes('hist')) {
        return padArray(
          macdResult.map((m) => m.histogram || 0),
          ohlcvData.length
        );
      }
      return padArray(
        macdResult.map((m) => m.MACD || 0),
        ohlcvData.length
      );
    }

    case 'BBANDS':
    case 'BB': {
      const period = ind.params.timeperiod || 20;
      const stdDev = ind.params.nbdevup || 2;

      const bbResult = BollingerBands.calculate({
        values: closes,
        period,
        stdDev,
      });

      if (ind.name.includes('upper')) {
        return padArray(
          bbResult.map((b) => b.upper),
          ohlcvData.length
        );
      }
      if (ind.name.includes('lower')) {
        return padArray(
          bbResult.map((b) => b.lower),
          ohlcvData.length
        );
      }
      return padArray(
        bbResult.map((b) => b.middle),
        ohlcvData.length
      );
    }

    case 'EMA': {
      const period = ind.params.timeperiod || 20;
      const emaValues = EMA.calculate({
        values: closes,
        period,
      });
      return padArray(emaValues, ohlcvData.length);
    }

    case 'SMA': {
      const period = ind.params.timeperiod || 20;
      const smaValues = SMA.calculate({
        values: closes,
        period,
      });
      return padArray(smaValues, ohlcvData.length);
    }

    case 'ATR': {
      const period = ind.params.timeperiod || 14;
      const atrValues = ATR.calculate({
        high: highs,
        low: lows,
        close: closes,
        period,
      });
      return padArray(atrValues, ohlcvData.length);
    }

    case 'STOCH':
    case 'STOCHASTIC': {
      const period = ind.params.fastk_period || 14;
      const slowK = ind.params.slowk_period || 3;
      const slowD = ind.params.slowd_period || 3;

      const stochResult = Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period,
        signalPeriod: slowD,
      });

      if (ind.name.includes('slowd')) {
        return padArray(
          stochResult.map((s) => s.d),
          ohlcvData.length
        );
      }
      return padArray(
        stochResult.map((s) => s.k),
        ohlcvData.length
      );
    }

    default:
      console.warn(`Unsupported indicator: ${ind.taFunction}`);
      return new Array(ohlcvData.length).fill(0);
  }
}

function padArray(arr: number[], targetLength: number): number[] {
  const padding = targetLength - arr.length;
  if (padding <= 0) return arr;

  return [...new Array(padding).fill(NaN), ...arr];
}
