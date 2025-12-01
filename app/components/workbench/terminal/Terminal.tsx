import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as XTerm } from '@xterm/xterm';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import type { Theme } from '~/lib/stores/theme';
import { createScopedLogger } from '~/utils/logger';
import { getTerminalTheme } from './theme';

const logger = createScopedLogger('Terminal');

export interface TerminalRef {
  reloadStyles: () => void;
  write: (data: string) => void;
  reset: () => void;
  clear: () => void;
}

export interface TerminalProps {
  className?: string;
  theme: Theme;
  readonly?: boolean;
  onTerminalReady?: (terminal: XTerm) => void;
  onTerminalResize?: (cols: number, rows: number) => void;
  logs?: string[];
}

const PLACEHOLDER_LOGS = [
  '\x1b[32m[INFO]\x1b[0m 10xtraders Bot v1.0.0 starting...',
  '\x1b[32m[INFO]\x1b[0m Loading configuration from config.json',
  '\x1b[32m[INFO]\x1b[0m Connecting to exchange...',
  '\x1b[32m[INFO]\x1b[0m Connected successfully',
  '\x1b[32m[INFO]\x1b[0m Initializing strategy: Advanced_RSI_MACD',
  '\x1b[32m[INFO]\x1b[0m Loading market data for BTC/USDT (5m timeframe)',
  '\x1b[32m[INFO]\x1b[0m Loading market data for ETH/USDT (5m timeframe)',
  '\x1b[32m[INFO]\x1b[0m Loading market data for SOL/USDT (5m timeframe)',
  '\x1b[36m[INFO]\x1b[0m Calculating RSI indicators...',
  '\x1b[36m[INFO]\x1b[0m Calculating MACD indicators...',
  '\x1b[36m[INFO]\x1b[0m Calculating Bollinger Bands...',
  '\x1b[32m[INFO]\x1b[0m Strategy initialized successfully',
  '\x1b[32m[INFO]\x1b[0m Starting trading loop...',
];

const LIVE_LOGS_POOL = [
  'BTC/USDT: Price $45,234.56 | RSI: 54.2 | MACD: Neutral',
  'ETH/USDT: Price $2,345.67 | RSI: 48.3 | MACD: Bearish',
  'SOL/USDT: Price $98.45 | RSI: 62.1 | MACD: Bullish',
  'MATIC/USDT: Price $0.8912 | RSI: 58.7 | MACD: Bullish',
  'LINK/USDT: Price $14.23 | RSI: 61.4 | MACD: Neutral',
  'DOT/USDT: Price $6.87 | RSI: 44.2 | MACD: Bearish',
  'ADA/USDT: Price $0.5234 | RSI: 52.8 | MACD: Neutral',
  'AVAX/USDT: Price $35.67 | RSI: 67.3 | MACD: Bullish',
  'Monitoring 20 trading pairs for signals...',
  'Risk management: Max positions 3/3 | Available capital: $1,000',
  'Signal detected: BTC/USDT | Type: BUY | Confidence: 78%',
  'Signal detected: ETH/USDT | Type: SELL | Confidence: 65%',
  'Order placed: BUY BTC/USDT @ $45,250 | Size: 0.022 BTC',
  'Order filled: BUY BTC/USDT @ $45,251 | Total: $994.52',
  'Position opened: BTC/USDT | Entry: $45,251 | Stop: $44,800',
  'Trailing stop updated: BTC/USDT | New stop: $45,500',
];

export const Terminal = memo(
  forwardRef<TerminalRef, TerminalProps>(({ className, theme, readonly, onTerminalReady, onTerminalResize, logs }, ref) => {
    const terminalElementRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<XTerm>();
    const hasWrittenPlaceholder = useRef(false);
    const logIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      const element = terminalElementRef.current!;

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      const terminal = new XTerm({
        cursorBlink: true,
        convertEol: true,
        disableStdin: readonly,
        theme: getTerminalTheme(readonly ? { cursor: '#00000000' } : {}),
        fontSize: 12,
        fontFamily: 'Menlo, courier-new, courier, monospace',
      });

      terminalRef.current = terminal;

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(element);

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        onTerminalResize?.(terminal.cols, terminal.rows);
      });

      resizeObserver.observe(element);

      logger.info('Attach terminal');

      // Write placeholder logs immediately
      if (!hasWrittenPlaceholder.current) {
        PLACEHOLDER_LOGS.forEach(log => {
          terminal.writeln(log);
        });
        hasWrittenPlaceholder.current = true;

        // Start flowing logs after initial logs
        logIntervalRef.current = setInterval(() => {
          const randomLog = LIVE_LOGS_POOL[Math.floor(Math.random() * LIVE_LOGS_POOL.length)];
          terminal.writeln(`\x1b[37m[INFO]\x1b[0m ${randomLog}`);
        }, 3000); // Add new log every 3 seconds
      }

      onTerminalReady?.(terminal);

      return () => {
        if (logIntervalRef.current) {
          clearInterval(logIntervalRef.current);
        }
        resizeObserver.disconnect();
        terminal.dispose();
      };
    }, []);

    // Handle external logs
    useEffect(() => {
      if (logs && logs.length > 0 && terminalRef.current) {
        const terminal = terminalRef.current;
        logs.forEach(log => {
          terminal.writeln(log);
        });
      }
    }, [logs]);

    useEffect(() => {
      const terminal = terminalRef.current!;

      terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});
      terminal.options.disableStdin = readonly;
    }, [theme, readonly]);

    useImperativeHandle(ref, () => {
      return {
        reloadStyles: () => {
          const terminal = terminalRef.current!;
          terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});
        },
        write: (data: string) => {
          const terminal = terminalRef.current!;
          terminal.write(data);
        },
        reset: () => {
          const terminal = terminalRef.current!;
          terminal.clear();
          terminal.reset();
        },
        clear: () => {
          const terminal = terminalRef.current!;
          terminal.clear();
        }
      };
    }, []);

    return <div className={className} ref={terminalElementRef} />;
  }),
);