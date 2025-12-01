import { memo, useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { TradingViewChart } from '~/components/bots/TradingViewChart';
import { supabase } from '~/lib/superbase/client';

interface BacktestsPanelProps {
  strategyName: string | null;
  className?: string;
}

interface BacktestResult {
  symbol: string;
  version: string;
  roi: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  avgProfit: number;
  sharpeRatio: number;
}

type ViewMode = 'backtests' | 'charts';

export const BacktestsPanel = memo(({ strategyName, className }: BacktestsPanelProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('backtests');
  const [backtests, setBacktests] = useState<BacktestResult[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [isLoading, setIsLoading] = useState(false);

  // Mock backtest data - In production, fetch from your backend
  useEffect(() => {
    if (!strategyName) {
      setBacktests([]);
      return;
    }

    // Simulate loading
    setIsLoading(true);
    const timer = setTimeout(() => {
      setBacktests([
        {
          symbol: 'BTC/USDT',
          version: 'v1.0',
          roi: 85.78,
          maxDrawdown: 33.73,
          winRate: 45.87,
          totalTrades: 355,
          avgProfit: 9.06,
          sharpeRatio: 2.34
        },
        {
          symbol: 'ETH/USDT',
          version: 'v1.0',
          roi: 57.07,
          maxDrawdown: 22.61,
          winRate: 52.0,
          totalTrades: 287,
          avgProfit: 7.8,
          sharpeRatio: 1.89
        },
        {
          symbol: 'SOL/USDT',
          version: 'v1.0',
          roi: 113.03,
          maxDrawdown: 22.66,
          winRate: 48.5,
          totalTrades: 412,
          avgProfit: 11.64,
          sharpeRatio: 3.02
        }
      ]);
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [strategyName]);

  return (
    <div className={classNames('flex flex-col bg-bolt-elements-background-depth-2 h-full', className)}>
      {/* Header with toggle */}
      <div className="flex items-center px-4 py-2 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
        <div className="flex gap-1 bg-bolt-elements-background-depth-3 rounded-md p-1">
          <button
            onClick={() => setViewMode('backtests')}
            className={classNames(
              'px-3 py-1.5 text-xs font-medium rounded transition-colors',
              viewMode === 'backtests'
                ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
                : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            )}
          >
            <div className="flex items-center gap-1.5">
              <div className="i-ph:chart-line-up text-sm" />
              Backtests
            </div>
          </button>
          <button
            onClick={() => setViewMode('charts')}
            className={classNames(
              'px-3 py-1.5 text-xs font-medium rounded transition-colors',
              viewMode === 'charts'
                ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
                : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            )}
          >
            <div className="flex items-center gap-1.5">
              <div className="i-ph:chart-candlestick text-sm" />
              Live Charts
            </div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!strategyName ? (
          <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
            <div className="text-center">
              <div className="i-ph:chart-line text-4xl mb-2" />
              <p>Generate a strategy to see backtest results</p>
            </div>
          </div>
        ) : viewMode === 'backtests' ? (
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="i-svg-spinners:90-ring-with-bg text-2xl text-bolt-elements-loader-progress" />
              </div>
            ) : (
              <div className="space-y-3">
                {backtests.map((result, index) => (
                  <div
                    key={index}
                    className="bg-bolt-elements-background-depth-3 rounded-lg p-4 border border-bolt-elements-borderColor hover:border-accent-500 transition-colors"
                  >
                    {/* Symbol Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-bolt-elements-textPrimary">
                          {result.symbol}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-bolt-elements-background-depth-4 text-bolt-elements-textTertiary">
                          {result.version}
                        </span>
                      </div>
                      <div className={classNames(
                        'text-sm font-bold',
                        result.roi > 0 ? 'text-green-500' : 'text-red-500'
                      )}>
                        {result.roi > 0 ? '+' : ''}{result.roi.toFixed(2)}%
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-bolt-elements-textTertiary mb-1">Max DD</div>
                        <div className="text-bolt-elements-textPrimary font-medium">
                          {result.maxDrawdown.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-bolt-elements-textTertiary mb-1">Win Rate</div>
                        <div className="text-bolt-elements-textPrimary font-medium">
                          {result.winRate.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-bolt-elements-textTertiary mb-1">Trades</div>
                        <div className="text-bolt-elements-textPrimary font-medium">
                          {result.totalTrades}
                        </div>
                      </div>
                      <div>
                        <div className="text-bolt-elements-textTertiary mb-1">Avg Profit</div>
                        <div className="text-bolt-elements-textPrimary font-medium">
                          {result.avgProfit.toFixed(2)}%
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-bolt-elements-textTertiary mb-1">Sharpe Ratio</div>
                        <div className="text-bolt-elements-textPrimary font-medium">
                          {result.sharpeRatio.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => {
                        setSelectedSymbol(result.symbol.replace('/', ''));
                        setViewMode('charts');
                      }}
                      className="w-full mt-3 px-3 py-1.5 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded text-xs font-medium hover:bg-bolt-elements-button-secondary-backgroundHover transition-colors"
                    >
                      View Chart
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full p-4">
            <TradingViewChart
              symbol={selectedSymbol}
              strategyName={strategyName}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      {strategyName && viewMode === 'backtests' && !isLoading && (
        <div className="px-4 py-2 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor">
          <span className="text-xs text-bolt-elements-textTertiary">
            {backtests.length} backtest results • Based on historical data
          </span>
        </div>
      )}
    </div>
  );
});
