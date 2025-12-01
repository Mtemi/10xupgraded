import React from 'react';
import { classNames } from '~/utils/classNames';
import type { BacktestResult } from '~/lib/backtest';

interface BacktestMetricsProps {
  result: BacktestResult | null;
  strategyVersion?: string;
}

const PLACEHOLDER_SYMBOLS = [
  { symbol: 'BTC/USDT', roi: 85.78, maxDD: 33.73 },
  { symbol: 'ETH/USDT', roi: 57.07, maxDD: 22.61 },
  { symbol: 'SOL/USDT', roi: 45.87, maxDD: 19.23 },
  { symbol: 'MATIC/USDT', roi: 32.45, maxDD: 15.82 },
  { symbol: 'LINK/USDT', roi: 28.91, maxDD: 12.34 },
  { symbol: 'DOT/USDT', roi: 23.02, maxDD: 18.56 },
  { symbol: 'ADA/USDT', roi: 19.67, maxDD: 14.23 },
  { symbol: 'AVAX/USDT', roi: 15.43, maxDD: 11.89 },
  { symbol: 'ATOM/USDT', roi: 12.78, maxDD: 9.45 },
  { symbol: 'UNI/USDT', roi: 8.92, maxDD: 7.12 },
  { symbol: 'XRP/USDT', roi: -4.23, maxDD: 8.67 },
  { symbol: 'LTC/USDT', roi: -8.81, maxDD: 12.43 },
];

export function BacktestMetrics({ result, strategyVersion = '1.0.1' }: BacktestMetricsProps) {
  // Always show placeholder data
  const displayData = PLACEHOLDER_SYMBOLS;

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
      <div className="p-3 space-y-2">
        {/* Header Row */}
        <div className="flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-gray-500 border-b border-gray-800">
          <span className="w-24">PAIR</span>
          <span className="w-16 text-right">ROI</span>
          <span className="w-14 text-right">MAX DD</span>
        </div>

        {/* Data Rows */}
        <div className="space-y-1">
          {displayData.map((item, index) => (
            <div
              key={index}
              className={classNames(
                'flex items-center justify-between px-3 py-2 rounded-md text-xs hover:bg-[#1a1a1a] transition-colors cursor-pointer',
                index === 0 && 'bg-[#1e293b] border border-blue-900/30'
              )}
            >
              <span className="text-gray-300 font-medium w-24 truncate">{item.symbol}</span>
              <span className={classNames(
                'font-bold w-16 text-right',
                item.roi > 0 ? 'text-green-400' : item.roi < 0 ? 'text-red-400' : 'text-gray-500'
              )}>
                {item.roi > 0 ? '+' : ''}{item.roi.toFixed(1)}%
              </span>
              <span className="text-gray-400 w-14 text-right text-[10px]">{item.maxDD.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
