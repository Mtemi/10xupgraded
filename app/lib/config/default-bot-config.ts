// Default bot configuration for first-time users
// This configuration is automatically created when a user generates their first strategy

export interface DefaultBotConfig {
  exchange: string;
  trading_mode: string;
  trading_type: string;
  market: string;
  timeframe: string;
  stake_currency: string;
  max_open_trades: number;
  stake_amount: number;
  paper_trading_wallet_size: number;
  stop_loss: number;
  minimal_roi: {
    "0": number;
    "30": number;
    "60": number;
  };
  pair_whitelist: string[];
  strategy?: string; // Will be set dynamically
}

export const DEFAULT_BOT_CONFIGURATION: DefaultBotConfig = {
  exchange: 'binance',
  trading_mode: 'paper',
  trading_type: 'CEX',
  market: 'spot',
  timeframe: '5m',
  stake_currency: 'USDT',
  max_open_trades: 3,
  stake_amount: 100,
  paper_trading_wallet_size: 1000,
  stop_loss: -0.1,
  minimal_roi: {
    "0": 0.04,
    "30": 0.02,
    "60": 0.01
  },
  pair_whitelist: [
    'AVAX/USDT',
    'DOT/USDT',
    'LINK/USDT',
    'UNI/USDT',
    'MATIC/USDT',
    'LTC/USDT',
    'ATOM/USDT',
    'NEAR/USDT',
    'FIL/USDT',
    'AAVE/USDT',
    'SAND/USDT',
    'GRT/USDT',
    'FTM/USDT',
    'ALGO/USDT',
    'ICP/USDT',
    'VET/USDT',
    'SOL/USDT'
  ]
};

// Create a complete bot configuration for deployment
export function createDefaultBotConfigForStrategy(strategyName: string) {
  return {
    name: `${strategyName}_bot`,
    config: {
      ...DEFAULT_BOT_CONFIGURATION,
      strategy: strategyName,
      // Add freqtrade-specific config
      dry_run: true,
      dry_run_wallet: DEFAULT_BOT_CONFIGURATION.paper_trading_wallet_size,
      stake_amount: DEFAULT_BOT_CONFIGURATION.stake_amount,
      max_open_trades: DEFAULT_BOT_CONFIGURATION.max_open_trades,
      timeframe: DEFAULT_BOT_CONFIGURATION.timeframe,
      minimal_roi: DEFAULT_BOT_CONFIGURATION.minimal_roi,
      stoploss: DEFAULT_BOT_CONFIGURATION.stop_loss,
      exchange: {
        name: DEFAULT_BOT_CONFIGURATION.exchange,
        pair_whitelist: DEFAULT_BOT_CONFIGURATION.pair_whitelist,
        ccxt_config: {},
        ccxt_async_config: {}
      }
    },
    is_active: true
  };
}
