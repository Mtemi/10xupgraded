import { memo, useEffect, useRef, useState } from 'react';
import { classNames } from '~/utils/classNames';
import { supabase } from '~/lib/superbase/client';

interface LogsPanelProps {
  strategyName: string | null;
  className?: string;
}

const PLACEHOLDER_LOGS = [
  '2025-01-10 14:32:15 - INFO - 10xtraders Bot v1.0.0 starting...',
  '2025-01-10 14:32:16 - INFO - Loading configuration from config.json',
  '2025-01-10 14:32:16 - INFO - Connecting to Binance exchange...',
  '2025-01-10 14:32:17 - INFO - Connected successfully to Binance',
  '2025-01-10 14:32:17 - INFO - Initializing strategy: Advanced_RSI_MACD',
  '2025-01-10 14:32:18 - INFO - Loading market data for BTC/USDT (5m timeframe)',
  '2025-01-10 14:32:19 - INFO - Loading market data for ETH/USDT (5m timeframe)',
  '2025-01-10 14:32:20 - INFO - Loading market data for SOL/USDT (5m timeframe)',
  '2025-01-10 14:32:21 - INFO - Calculating RSI indicators...',
  '2025-01-10 14:32:21 - INFO - Calculating MACD indicators...',
  '2025-01-10 14:32:22 - INFO - Calculating Bollinger Bands...',
  '2025-01-10 14:32:23 - INFO - Strategy initialized successfully',
  '2025-01-10 14:32:23 - INFO - Starting trading loop...',
  '2025-01-10 14:32:24 - INFO - BTC/USDT: Price $45,234.56 | RSI: 54.2 | MACD: Neutral',
  '2025-01-10 14:32:24 - INFO - ETH/USDT: Price $2,345.67 | RSI: 48.3 | MACD: Bearish',
  '2025-01-10 14:32:25 - INFO - SOL/USDT: Price $98.45 | RSI: 62.1 | MACD: Bullish',
  '2025-01-10 14:32:26 - INFO - Monitoring 20 trading pairs for signals...',
  '2025-01-10 14:32:27 - INFO - Risk management: Max positions 3/3 | Available capital: $1,000',
  '2025-01-10 14:32:28 - INFO - Waiting for entry signals...',
];

export const LogsPanel = memo(({ strategyName, className }: LogsPanelProps) => {
  const [logs, setLogs] = useState<string[]>(PLACEHOLDER_LOGS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Fetch logs from pod
  const fetchLogs = async () => {
    if (!strategyName) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const response = await fetch(
        `/apa/podlogs?botName=${strategyName}&userId=${user.id}&lines=100`
      );

      if (!response.ok) {
        if (response.status === 404) {
          setLogs(['Bot is starting up... Logs will appear shortly.']);
          return;
        }
        throw new Error('Failed to fetch logs');
      }

      const text = await response.text();
      const sanitizedLogs = text
        .split('\n')
        .filter(l => l.trim())
        .map(l => l.replace(/freqtrade/gi, '10xtraders'));

      if (sanitizedLogs.length > 0) {
        setLogs(sanitizedLogs);
        setError(null);
      } else {
        setLogs(['Waiting for bot to start...']);
      }
    } catch (err) {
      console.error('[LogsPanel] Error fetching logs:', err);
      setError('Failed to load logs');
    }
  };

  // Start polling for logs when strategy name is available
  useEffect(() => {
    if (!strategyName) {
      setLogs(PLACEHOLDER_LOGS);
      return;
    }

    // Show analyzing state
    setIsAnalyzing(true);
    setTimeout(() => setIsAnalyzing(false), 2000);

    // Initial fetch
    setIsLoading(true);
    fetchLogs().finally(() => setIsLoading(false));

    // Poll for new logs every 3 seconds
    intervalRef.current = setInterval(fetchLogs, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [strategyName]);

  return (
    <div className={classNames('flex flex-col bg-bolt-elements-background-depth-3 h-full', className)}>
      {/* Header */}
      <div className="flex items-center px-4 py-2 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
        <div className="i-ph:terminal-window-duotone text-lg mr-2 text-bolt-elements-textSecondary" />
        <span className="text-sm font-medium text-bolt-elements-textPrimary">Bot Logs</span>
        {isLoading && (
          <div className="ml-auto">
            <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress" />
          </div>
        )}
        {strategyName && (
          <span className="ml-auto text-xs text-bolt-elements-textSecondary">
            {strategyName}
          </span>
        )}
      </div>

      {/* Logs Content */}
      <div className="flex-1 overflow-auto p-4 font-mono text-xs text-bolt-elements-textSecondary relative">
        {isAnalyzing && (
          <div className="absolute inset-0 flex items-center justify-center bg-bolt-elements-background-depth-3/90 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-gray-800 border-t-blue-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="i-ph:terminal-window text-xl text-gray-600" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-blue-400">Analyzing strategy...</p>
                <p className="text-xs text-gray-500 mt-1">Initializing execution environment</p>
              </div>
            </div>
          </div>
        )}
        {!strategyName ? (
          <>
            {logs.map((line, index) => (
              <div
                key={index}
                className="whitespace-pre-wrap mb-1 hover:bg-bolt-elements-background-depth-4 px-2 py-1 rounded"
              >
                {line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            <div className="text-center">
              <div className="i-ph:warning text-2xl mb-2" />
              <p>{error}</p>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
            <div className="text-center">
              <div className="i-svg-spinners:90-ring-with-bg text-2xl mb-2" />
              <p>Waiting for logs...</p>
            </div>
          </div>
        ) : (
          <>
            {logs.map((line, index) => (
              <div
                key={index}
                className="whitespace-pre-wrap mb-1 hover:bg-bolt-elements-background-depth-4 px-2 py-1 rounded"
              >
                {line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </>
        )}
      </div>

      {/* Footer with log count */}
      {logs.length > 0 && strategyName && (
        <div className="px-4 py-2 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor">
          <span className="text-xs text-bolt-elements-textTertiary">
            {logs.length} log entries • Refreshing every 3s
          </span>
        </div>
      )}
    </div>
  );
});
