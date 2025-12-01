import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';
import { useSubscriptionFeatures } from '~/lib/hooks/useSubscriptionFeatures';

interface BotConfigFormProps {
  configId?: string;
  onSave?: () => void;
  onCancel?: () => void;
}

interface ConfigField {
  path: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'json' | 'textarea';
  options?: string[];
  description?: string;
  placeholder?: string;
  section: string;
  icon?: string;
  advanced?: boolean;
  requiresPlan?: string; // New field to indicate which plan is required
}

export function BotConfigForm({ configId, onSave, onCancel }: BotConfigFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configName, setConfigName] = useState('');
  const [configData, setConfigData] = useState<any>({});
  const [activeSection, setActiveSection] = useState('general');
  const [userScripts, setUserScripts] = useState<{id: string, name: string, created_at: string}[]>([]);
  const [strategySearchTerm, setStrategySearchTerm] = useState('');
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const navigate = useNavigate();
  const { maxPaperBots, maxLiveBots, planName, canAccessFeature } = useSubscriptionFeatures();
  const [botCount, setBotCount] = useState({ paper: 0, live: 0 });

  // Define form sections and fields
  const sections = [
    { id: 'general', label: 'General Settings', icon: 'i-ph:gear' },
    { id: 'trading', label: 'Trading Parameters', icon: 'i-ph:chart-line-up' },
    { id: 'risk', label: 'Risk Management', icon: 'i-ph:shield-warning' },
    { id: 'orders', label: 'Order Settings', icon: 'i-ph:shopping-cart' },
    { id: 'exchange', label: 'Exchange Configuration', icon: 'i-ph:currency-circle-dollar' },
    { id: 'pairs', label: 'Trading Pairs', icon: 'i-ph:currency-btc' },
    { id: 'advanced', label: 'Advanced Settings', icon: 'i-ph:sliders-horizontal' },
  ];

  const configFields: ConfigField[] = [
    // General Settings
    { path: 'strategy', label: 'Strategy Name', type: 'select', options: [], section: 'general', description: 'Trading strategy to use', icon: 'i-ph:strategy' },
    { path: 'bot_name', label: 'Bot Name', type: 'text', placeholder: 'My Trading Bot', section: 'general', description: 'Name of your trading bot', icon: 'i-ph:robot' },
    { path: 'timeframe', label: 'Timeframe', type: 'select', options: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'], section: 'general', description: 'Candle timeframe for analysis', icon: 'i-ph:clock' },
    { path: 'stake_currency', label: 'Stake Currency', type: 'text', placeholder: 'USDT', section: 'general', description: 'Currency used for trading', icon: 'i-ph:currency-circle-dollar' },
    { path: 'fiat_display_currency', label: 'Display Currency', type: 'text', placeholder: 'USD', section: 'general', description: 'Fiat currency for displaying profits', icon: 'i-ph:currency-dollar' },
    { path: 'dry_run', label: 'Paper Trading (Dry Run)', type: 'boolean', section: 'general', description: 'Run in simulation mode without real trades', icon: 'i-ph:test-tube' },
    { path: 'dry_run_wallet', label: 'Paper Wallet Size', type: 'number', section: 'general', description: 'Initial balance for simulation', icon: 'i-ph:wallet' },
    { path: 'cancel_open_orders_on_exit', label: 'Cancel Orders on Exit', type: 'boolean', section: 'general', description: 'Cancel open orders when bot stops', icon: 'i-ph:x-circle' },
    { path: 'trading_mode', label: 'Trading Mode', type: 'select', options: ['spot', 'margin', 'futures'], section: 'general', description: 'Type of trading to perform', icon: 'i-ph:chart-line' },
    { path: 'margin_mode', label: 'Margin Mode', type: 'select', options: ['', 'cross', 'isolated'], section: 'general', description: 'Margin mode for margin/futures trading', icon: 'i-ph:arrows-out' },
    { path: 'initial_state', label: 'Initial State', type: 'select', options: ['running', 'stopped'], section: 'general', description: 'Bot state when started', icon: 'i-ph:play' },
    
    // Trading Parameters
    { path: 'max_open_trades', label: 'Max Open Trades', type: 'number', section: 'trading', description: 'Maximum number of open trades', icon: 'i-ph:number-circle-three' },
    { path: 'stake_amount', label: 'Stake Amount', type: 'number', section: 'trading', description: 'Amount to stake per trade', icon: 'i-ph:money' },
    { path: 'tradable_balance_ratio', label: 'Tradable Balance Ratio', type: 'number', section: 'trading', description: 'Ratio of balance to use for trading', icon: 'i-ph:percent' },
    { path: 'available_capital', label: 'Available Capital', type: 'number', section: 'trading', description: 'Total capital available for trading', icon: 'i-ph:bank' },
    { path: 'amend_last_stake_amount', label: 'Amend Last Stake Amount', type: 'boolean', section: 'trading', description: 'Adjust final trade amount', icon: 'i-ph:pencil-simple' },
    { path: 'last_stake_amount_min_ratio', label: 'Last Stake Min Ratio', type: 'number', section: 'trading', description: 'Minimum ratio for last stake', icon: 'i-ph:chart-bar' },
    { path: 'amount_reserve_percent', label: 'Amount Reserve Percent', type: 'number', section: 'trading', description: 'Percentage to reserve from each trade', icon: 'i-ph:percent' },
    { path: 'process_only_new_candles', label: 'Process Only New Candles', type: 'boolean', section: 'trading', description: 'Only process new candle data', icon: 'i-ph:chart-bar' },
    { path: 'ignore_buying_expired_candle_after', label: 'Ignore Expired Candle', type: 'number', section: 'trading', description: 'Ignore buying signal after X seconds', icon: 'i-ph:clock-counter-clockwise' },
    { path: 'force_entry_enable', label: 'Force Entry Enable', type: 'boolean', section: 'trading', description: 'Enable force entry commands', icon: 'i-ph:arrow-square-in' },
    
    // Risk Management
    { path: 'minimal_roi.0', label: 'ROI (Immediate)', type: 'number', section: 'risk', description: 'Minimal ROI for immediate profit taking', icon: 'i-ph:chart-line-up' },
    { path: 'minimal_roi.20', label: 'ROI (20 min)', type: 'number', section: 'risk', description: 'Minimal ROI after 20 minutes', icon: 'i-ph:chart-line-up' },
    { path: 'minimal_roi.30', label: 'ROI (30 min)', type: 'number', section: 'risk', description: 'Minimal ROI after 30 minutes', icon: 'i-ph:chart-line-up' },
    { path: 'minimal_roi.40', label: 'ROI (40 min)', type: 'number', section: 'risk', description: 'Minimal ROI after 40 minutes', icon: 'i-ph:chart-line-up' },
    { path: 'minimal_roi.60', label: 'ROI (60 min)', type: 'number', section: 'risk', description: 'Minimal ROI after 60 minutes', icon: 'i-ph:chart-line-up' },
    { path: 'stoploss', label: 'Stop Loss', type: 'number', section: 'risk', description: 'Stop loss percentage (negative value)', icon: 'i-ph:hand-palm' },
    { path: 'trailing_stop', label: 'Trailing Stop', type: 'boolean', section: 'risk', description: 'Enable trailing stop loss', icon: 'i-ph:arrow-down-right' },
    { path: 'trailing_stop_positive', label: 'Trailing Stop Positive', type: 'number', section: 'risk', description: 'Trailing stop positive offset', icon: 'i-ph:arrow-up-right' },
    { path: 'trailing_stop_positive_offset', label: 'Trailing Stop Positive Offset', type: 'number', section: 'risk', description: 'Offset for trailing stop', icon: 'i-ph:arrows-out-line-horizontal' },
    { path: 'trailing_only_offset_is_reached', label: 'Trailing Only When Offset Reached', type: 'boolean', section: 'risk', description: 'Only trail once offset is reached', icon: 'i-ph:flag-checkered' },
    { path: 'use_exit_signal', label: 'Use Exit Signal', type: 'boolean', section: 'risk', description: 'Use exit signals from strategy', icon: 'i-ph:sign-out' },
    { path: 'exit_profit_only', label: 'Exit Profit Only', type: 'boolean', section: 'risk', description: 'Exit only in profit', icon: 'i-ph:trend-up' },
    { path: 'exit_profit_offset', label: 'Exit Profit Offset', type: 'number', section: 'risk', description: 'Offset for exit profit', icon: 'i-ph:arrow-up-right' },
    { path: 'ignore_roi_if_entry_signal', label: 'Ignore ROI with Entry Signal', type: 'boolean', section: 'risk', description: 'Ignore ROI if entry signal is still active', icon: 'i-ph:skip-back' },
    
    // Order Settings
    { path: 'order_types.entry', label: 'Entry Order Type', type: 'select', options: ['limit', 'market'], section: 'orders', description: 'Order type for entry', icon: 'i-ph:arrow-square-in' },
    { path: 'order_types.exit', label: 'Exit Order Type', type: 'select', options: ['limit', 'market'], section: 'orders', description: 'Order type for exit', icon: 'i-ph:arrow-square-out' },
    { path: 'order_types.stoploss', label: 'Stop Loss Order Type', type: 'select', options: ['market', 'limit'], section: 'orders', description: 'Order type for stop loss', icon: 'i-ph:arrow-down-right' },
    { path: 'order_types.stoploss_on_exchange', label: 'Stop Loss On Exchange', type: 'boolean', section: 'orders', description: 'Place stop loss orders on exchange', icon: 'i-ph:cloud-arrow-up' },
    { path: 'order_types.stoploss_on_exchange_interval', label: 'Stop Loss Check Interval', type: 'number', section: 'orders', description: 'Interval in seconds to check stop loss', icon: 'i-ph:clock' },
    { path: 'order_types.stoploss_on_exchange_limit_ratio', label: 'Stop Loss Limit Ratio', type: 'number', section: 'orders', description: 'Limit price ratio for stop loss', icon: 'i-ph:percent' },
    { path: 'order_time_in_force.entry', label: 'Entry Time In Force', type: 'select', options: ['GTC', 'FOK', 'IOC'], section: 'orders', description: 'Time in force for entry orders', icon: 'i-ph:clock-countdown' },
    { path: 'order_time_in_force.exit', label: 'Exit Time In Force', type: 'select', options: ['GTC', 'FOK', 'IOC'], section: 'orders', description: 'Time in force for exit orders', icon: 'i-ph:clock-countdown' },
    { path: 'unfilledtimeout.entry', label: 'Entry Timeout', type: 'number', section: 'orders', description: 'Cancel entry order after timeout', icon: 'i-ph:timer' },
    { path: 'unfilledtimeout.exit', label: 'Exit Timeout', type: 'number', section: 'orders', description: 'Cancel exit order after timeout', icon: 'i-ph:timer' },
    { path: 'unfilledtimeout.unit', label: 'Timeout Unit', type: 'select', options: ['minutes', 'seconds'], section: 'orders', description: 'Unit for timeout values', icon: 'i-ph:clock' },
    { path: 'unfilledtimeout.exit_timeout_count', label: 'Exit Timeout Count', type: 'number', section: 'orders', description: 'Number of times to retry exit', icon: 'i-ph:repeat' },
    
    // Exchange Configuration
    { path: 'exchange.name', label: 'Exchange Name', type: 'select', options: ['binance', 'kucoin', 'ftx', 'kraken', 'coinbase'], section: 'exchange', description: 'Cryptocurrency exchange to use', icon: 'i-ph:buildings' },
    { path: 'exchange.key', label: 'API Key', type: 'text', section: 'exchange', description: 'Exchange API key', icon: 'i-ph:key' },
    { path: 'exchange.secret', label: 'API Secret', type: 'text', section: 'exchange', description: 'Exchange API secret', icon: 'i-ph:password' },
    { path: 'exchange.password', label: 'API Password', type: 'text', section: 'exchange', description: 'Exchange API password (if required)', icon: 'i-ph:lock-key' },
    { path: 'exchange.uid', label: 'API UID', type: 'text', section: 'exchange', description: 'Exchange API UID (if required)', icon: 'i-ph:identification-badge' },
    { path: 'exchange.enable_ws', label: 'Enable WebSocket', type: 'boolean', section: 'exchange', description: 'Use WebSocket for real-time data', icon: 'i-ph:plugs-connected' },
    { path: 'exchange.sandbox', label: 'Use Sandbox', type: 'boolean', section: 'exchange', description: 'Use exchange sandbox/testnet', icon: 'i-ph:test-tube' },
    { path: 'exchange.log_responses', label: 'Log API Responses', type: 'boolean', section: 'exchange', description: 'Log exchange API responses', icon: 'i-ph:list-bullets' },
    { path: 'exchange.markets_refresh_interval', label: 'Markets Refresh Interval', type: 'number', section: 'exchange', description: 'Interval to refresh markets in minutes', icon: 'i-ph:arrows-clockwise' },
    
    // Trading Pairs
    { path: 'exchange.pair_whitelist', label: 'Pair Whitelist', type: 'textarea', section: 'pairs', description: 'List of trading pairs to include', icon: 'i-ph:list-checks' },
    { path: 'exchange.pair_blacklist', label: 'Pair Blacklist', type: 'textarea', section: 'pairs', description: 'List of trading pairs to exclude', icon: 'i-ph:prohibit' },
    { path: 'pairlists', label: 'Pair Lists', type: 'json', section: 'pairs', description: 'Configuration for pair selection', icon: 'i-ph:list-bullets' },
    
    // Advanced Settings
    { path: 'protections', label: 'Protections', type: 'json', section: 'advanced', description: 'Trade protection rules', icon: 'i-ph:shield-check', requiresPlan: 'Pro' },
    { path: 'edge.enabled', label: 'Enable Edge', type: 'boolean', section: 'advanced', description: 'Enable edge positioning', icon: 'i-ph:chart-polar', advanced: true, requiresPlan: 'Elite' },
    { path: 'edge.process_throttle_secs', label: 'Edge Process Throttle', type: 'number', section: 'advanced', description: 'Seconds between edge calculations', icon: 'i-ph:timer', advanced: true, requiresPlan: 'Elite' },
    { path: 'edge.calculate_since_number_of_days', label: 'Edge Calculation Days', type: 'number', section: 'advanced', description: 'Days of data to use for edge', icon: 'i-ph:calendar', advanced: true, requiresPlan: 'Elite' },
    { path: 'edge.allowed_risk', label: 'Edge Allowed Risk', type: 'number', section: 'advanced', description: 'Allowed risk for edge', icon: 'i-ph:warning', advanced: true, requiresPlan: 'Elite' },
    { path: 'telegram.enabled', label: 'Enable Telegram', type: 'boolean', section: 'advanced', description: 'Enable Telegram notifications', icon: 'i-ph:paper-plane-tilt', requiresPlan: 'Pro' },
    { path: 'telegram.token', label: 'Telegram Token', type: 'text', section: 'advanced', description: 'Telegram bot token', icon: 'i-ph:key', requiresPlan: 'Pro' },
    { path: 'telegram.chat_id', label: 'Telegram Chat ID', type: 'text', section: 'advanced', description: 'Telegram chat ID', icon: 'i-ph:chat', requiresPlan: 'Pro' },
    { path: 'api_server.enabled', label: 'Enable API Server', type: 'boolean', section: 'advanced', description: 'Enable REST API server', icon: 'i-ph:server' },
    { path: 'api_server.listen_ip_address', label: 'API Server IP', type: 'text', section: 'advanced', description: 'IP address for API server', icon: 'i-ph:globe' },
    { path: 'api_server.listen_port', label: 'API Server Port', type: 'number', section: 'advanced', description: 'Port for API server', icon: 'i-ph:number-circle' },
    { path: 'api_server.username', label: 'API Username', type: 'text', section: 'advanced', description: 'Username for API authentication', icon: 'i-ph:user' },
    { path: 'api_server.password', label: 'API Password', type: 'text', section: 'advanced', description: 'Password for API authentication', icon: 'i-ph:lock-key' },
    { path: 'db_url', label: 'Database URL', type: 'text', section: 'advanced', description: 'URL for database connection', icon: 'i-ph:database', advanced: true },
    { path: 'internals.process_throttle_secs', label: 'Process Throttle', type: 'number', section: 'advanced', description: 'Seconds between processing loops', icon: 'i-ph:timer' },
    { path: 'internals.heartbeat_interval', label: 'Heartbeat Interval', type: 'number', section: 'advanced', description: 'Seconds between heartbeats', icon: 'i-ph:heartbeat' },
    { path: 'dataformat_ohlcv', label: 'OHLCV Data Format', type: 'select', options: ['json', 'jsongz', 'hdf5', 'feather'], section: 'advanced', description: 'Format for OHLCV data', icon: 'i-ph:file' },
    { path: 'dataformat_trades', label: 'Trades Data Format', type: 'select', options: ['json', 'jsongz', 'hdf5', 'feather'], section: 'advanced', description: 'Format for trades data', icon: 'i-ph:file' },
  ];

  useEffect(() => {
    const fetchUserScripts = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        // Use the RPC function to get user-specific strategies
        const { data, error } = await supabase
          .rpc('get_user_strategies', { p_user_id: user.id });
          
        if (error) throw error;
        
        setUserScripts(data || []);
      } catch (error) {
        console.error('Error fetching user scripts:', error);
      }
    };
    
    fetchUserScripts();
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        
        if (configId) {
          // Fetch existing configuration
          const { data, error } = await supabase
            .from('bot_configurations')
            .select('*')
            .eq('id', configId)
            .single();
            
          if (error) throw error;
          
          setConfigName(data.name);
          setConfigData(data.config);
        } else {
          // Fetch default configuration
          const { data, error } = await supabase
            .from('bot_configurations')
            .select('*')
            .eq('is_active', true)
            .single();
            
          if (error && error.code !== 'PGRST116') {
            // PGRST116 is "no rows returned" which is fine for a new config
            throw error;
          }
          
          if (data) {
            setConfigName('Copy of ' + data.name);
            setConfigData(data.config);
          } else {
            // Use hardcoded default if no active config exists
            setConfigName('New Configuration');
            setConfigData({
              "$schema": "https://schema.freqtrade.io/schema.json",
              "max_open_trades": 3,
              "stake_currency": "USDT",
              "stake_amount": 100,
              "tradable_balance_ratio": 0.99,
              "fiat_display_currency": "USD",
              "amount_reserve_percent": 0.05,
              "available_capital": 1000,
              "amend_last_stake_amount": false,
              "last_stake_amount_min_ratio": 0.5,
              "dry_run": true,
              "dry_run_wallet": 1000,
              "cancel_open_orders_on_exit": false,
              "timeframe": "5m",
              "trailing_stop": false,
              "trailing_stop_positive": 0.005,
              "trailing_stop_positive_offset": 0.0051,
              "trailing_only_offset_is_reached": false,
              "use_exit_signal": true,
              "exit_profit_only": false,
              "exit_profit_offset": 0.0,
              "ignore_roi_if_entry_signal": false,
              "ignore_buying_expired_candle_after": 300,
              "trading_mode": "spot",
              "margin_mode": "",
              "minimal_roi": {
                  "40": 0.0,
                  "30": 0.01,
                  "20": 0.02,
                  "0": 0.04
              },
              "stoploss": -0.10,
              "unfilledtimeout": {
                  "entry": 10,
                  "exit": 10,
                  "exit_timeout_count": 0,
                  "unit": "minutes"
              },
              "entry_pricing": {
                  "price_side": "same",
                  "use_order_book": true,
                  "order_book_top": 1,
                  "price_last_balance": 0.0,
                  "check_depth_of_market": {
                      "enabled": false,
                      "bids_to_ask_delta": 1
                  }
              },
              "exit_pricing": {
                  "price_side": "same",
                  "use_order_book": true,
                  "order_book_top": 1,
                  "price_last_balance": 0.0
              },
              "order_types": {
                  "entry": "limit",
                  "exit": "limit",
                  "emergency_exit": "market",
                  "force_exit": "market",
                  "force_entry": "market",
                  "stoploss": "market",
                  "stoploss_on_exchange": false,
                  "stoploss_price_type": "last",
                  "stoploss_on_exchange_interval": 60,
                  "stoploss_on_exchange_limit_ratio": 0.99
              },
              "order_time_in_force": {
                  "entry": "GTC",
                  "exit": "GTC"
              },
              "pairlists": [
                  {"method": "StaticPairList"},
                  {"method": "FullTradesFilter"},
                  {
                      "method": "VolumePairList",
                      "number_assets": 20,
                      "sort_key": "quoteVolume",
                      "refresh_period": 1800
                  },
                  {"method": "AgeFilter", "min_days_listed": 10},
                  {"method": "PrecisionFilter"},
                  {"method": "PriceFilter", "low_price_ratio": 0.01, "min_price": 0.00000010},
                  {"method": "SpreadFilter", "max_spread_ratio": 0.005},
                  {
                      "method": "RangeStabilityFilter",
                      "lookback_days": 10,
                      "min_rate_of_change": 0.01,
                      "refresh_period": 1440
                  }
              ],
              "exchange": {
                  "name": "binance",
                  "key": "",
                  "secret": "",
                  "password": "",
                  "log_responses": false,
                  "ccxt_config": {},
                  "ccxt_async_config": {},
                  "pair_whitelist": [
                      "ALGO/USDT",
                      "ATOM/USDT",
                      "BAT/USDT",
                      "BCH/USDT",
                      "BRD/USDT",
                      "EOS/USDT",
                      "ETH/USDT",
                      "IOTA/USDT",
                      "LINK/USDT",
                      "LTC/USDT",
                      "NEO/USDT",
                      "NXS/USDT",
                      "XMR/USDT",
                      "XRP/USDT",
                      "XTZ/USDT"
                  ],
                  "pair_blacklist": [
                      "DOGE/USDT"
                  ],
                  "outdated_offset": 5,
                  "markets_refresh_interval": 60
              },
              "edge": {
                  "enabled": false,
                  "process_throttle_secs": 3600,
                  "calculate_since_number_of_days": 7,
                  "allowed_risk": 0.01,
                  "stoploss_range_min": -0.01,
                  "stoploss_range_max": -0.1,
                  "stoploss_range_step": -0.01,
                  "minimum_winrate": 0.60,
                  "minimum_expectancy": 0.20,
                  "min_trade_number": 10,
                  "max_trade_duration_minute": 1440,
                  "remove_pumps": false
              },
              "telegram": {
                  "enabled": false,
                  "token": "",
                  "chat_id": "",
                  "notification_settings": {
                      "status": "on",
                      "warning": "on",
                      "startup": "on",
                      "entry": "on",
                      "entry_fill": "on",
                      "exit": {
                          "roi": "off",
                          "emergency_exit": "off",
                          "force_exit": "off",
                          "exit_signal": "off",
                          "trailing_stop_loss": "off",
                          "stop_loss": "off",
                          "stoploss_on_exchange": "off",
                          "custom_exit": "off"
                      },
                      "exit_fill": "on",
                      "entry_cancel": "on",
                      "exit_cancel": "on",
                      "protection_trigger": "off",
                      "protection_trigger_global": "on",
                      "show_candle": "off"
                  },
                  "reload": true,
                  "balance_dust_level": 0.01
              },
              "api_server": {
                  "enabled": true,
                  "listen_ip_address": "127.0.0.1",
                  "listen_port": 8080,
                  "verbosity": "error",
                  "enable_openapi": false,
                  "jwt_secret_key": "somethingrandom",
                  "CORS_origins": [],
                  "username": "10xtraders",
                  "password": "SuperSecurePassword",
                  "ws_token": "secret_ws_t0ken."
              },
              "bot_name": "10xtraders",
              "db_url": "sqlite:///tradesv3.sqlite",
              "initial_state": "running",
              "force_entry_enable": false,
              "internals": {
                  "process_throttle_secs": 5,
                  "heartbeat_interval": 60
              },
              "disable_dataframe_checks": false,
              "strategy": "TrendFollowing",
              "strategy_path": "user_data/strategies/",
              "recursive_strategy_search": false,
              "reduce_df_footprint": false,
              "dataformat_ohlcv": "json",
              "dataformat_trades": "json"
            });
          }
        }

        // Fetch bot counts
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: botConfigs, error: botError } = await supabase
            .from('bot_configurations')
            .select('*')
            .eq('user_id', user.id);
            
          if (!botError && botConfigs) {
            const paperBots = botConfigs.filter(bot => bot.config?.dry_run === true).length;
            const liveBots = botConfigs.filter(bot => bot.config?.dry_run === false).length;
            setBotCount({ paper: paperBots, live: liveBots });
          }
        }
      } catch (error) {
        console.error('Error fetching bot configuration:', error);
        toast.error('Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };
    
    fetchConfig();
  }, [configId]);

  // Helper function to get nested object value by path
  const getNestedValue = (obj: any, path: string) => {
    const keys = path.split('.');
    return keys.reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : undefined, obj);
  };

  // Helper function to set nested object value by path
  const setNestedValue = (obj: any, path: string, value: any) => {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((acc, key) => {
      if (acc[key] === undefined) {
        acc[key] = {};
      }
      return acc[key];
    }, obj);
    
    target[lastKey] = value;
    return obj;
  };

  const handleInputChange = (path: string, value: any) => {
    console.log(`Updating ${path} to:`, value);
    
    setConfigData(prevData => {
      const newData = JSON.parse(JSON.stringify(prevData));
      return setNestedValue(newData, path, value);
    });
    
    // Close strategy dropdown if it was open
    if (path === 'strategy') {
      setShowStrategyDropdown(false);
      setStrategySearchTerm('');
    }
  };

  // Function to handle textarea inputs that represent arrays
  const handleArrayTextareaChange = (path: string, value: string) => {
    try {
      // Split by commas or newlines and trim each item
      const items = value
        .split(/[,\n]/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
      
      handleInputChange(path, items);
    } catch (error) {
      console.error('Error parsing array input:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to save configuration');
        return;
      }
      
      if (!configName.trim()) {
        toast.error('Please provide a name for this configuration');
        return;
      }
      
      // Validate strategy is selected
      if (!configData.strategy) {
        toast.error('Please select a strategy for this bot');
        return;
      }
      
      // Check if this is a new live bot and if user has reached their limit
      if (!configId && !configData.dry_run) {
        if (botCount.live >= maxLiveBots && maxLiveBots !== -1) {
          toast.error(`You've reached your limit of ${maxLiveBots} live bots. Please upgrade your plan to create more.`);
          return;
        }
      }
      
      // Check if this is a new paper bot and if user has reached their limit
      if (!configId && configData.dry_run) {
        if (botCount.paper >= maxPaperBots && maxPaperBots !== -1) {
          toast.error(`You've reached your limit of ${maxPaperBots} paper bots. Please upgrade your plan to create more.`);
          return;
        }
      }
      
      // Ensure all required fields are present in the config
      const requiredFields = [
        'max_open_trades',
        'stake_currency',
        'stake_amount',
        'timeframe',
        'dry_run',
        'bot_name',
        'exchange.name'
      ];
      
      for (const field of requiredFields) {
        const value = getNestedValue(configData, field);
        if (value === undefined) {
          // Set default values for missing required fields
          if (field === 'max_open_trades') handleInputChange(field, 3);
          if (field === 'stake_currency') handleInputChange(field, 'BTC');
          if (field === 'stake_amount') handleInputChange(field, 0.05);
          if (field === 'timeframe') handleInputChange(field, '5m');
          if (field === 'dry_run') handleInputChange(field, true);
          if (field === 'bot_name') handleInputChange(field, configName);
          if (field === 'exchange.name') handleInputChange(field, 'binance');
        }
      }
      
      // Ensure minimal_roi is present
      if (!configData.minimal_roi) {
        handleInputChange('minimal_roi', {
          "40": 0.0,
          "30": 0.01,
          "20": 0.02,
          "0": 0.04
        });
      }
      
      // Ensure stoploss is present
      if (configData.stoploss === undefined) {
        handleInputChange('stoploss', -0.10);
      }
      
      // Ensure order_types is present
      if (!configData.order_types) {
        handleInputChange('order_types', {
          "entry": "limit",
          "exit": "limit",
          "emergency_exit": "market",
          "force_exit": "market",
          "force_entry": "market",
          "stoploss": "market",
          "stoploss_on_exchange": false,
          "stoploss_price_type": "last",
          "stoploss_on_exchange_interval": 60,
          "stoploss_on_exchange_limit_ratio": 0.99
        });
      }
      
      // Ensure order_time_in_force is present
      if (!configData.order_time_in_force) {
        handleInputChange('order_time_in_force', {
          "entry": "GTC",
          "exit": "GTC"
        });
      }
      
      // Ensure bot_name is set to the configuration name if not specified
      if (!configData.bot_name) {
        handleInputChange('bot_name', configName);
      }
      
      console.log('Final config data:', configData);
      
      const configRecord = {
        user_id: user.id,
        name: configName,
        config: configData,
        is_active: false
      };
      
      if (configId) {
        // Update existing configuration
        const { error } = await supabase
          .from('bot_configurations')
          .update(configRecord)
          .eq('id', configId);
          
        if (error) throw error;
        toast.success('Bot Configuration updated successfully');
      } else {
        // Create new configuration
        const { error } = await supabase
          .from('bot_configurations')
          .insert(configRecord);
          
        if (error) throw error;
        toast.success('Bot Configuration created successfully');
      }
      
      if (onSave) onSave();
    } catch (error) {
      console.error('Error saving bot configuration:', error);
      toast.error('Failed to save bot configuration');
    } finally {
      setSaving(false);
    }
  };

  // Format array for display in textarea
  const formatArrayForTextarea = (array: string[] | undefined) => {
    if (!array) return '';
    return array.join('\n');
  };

  // Filter strategies based on search term
  const filteredStrategies = strategySearchTerm 
    ? userScripts.filter(script => 
        script.name.toLowerCase().includes(strategySearchTerm.toLowerCase())
      )
    : userScripts;

  // Filter fields based on section, advanced setting, and subscription plan
  const filteredFields = configFields.filter(field => {
    // Check if field belongs to current section
    const inCurrentSection = field.section === activeSection;
    
    // Check if field should be shown based on advanced setting
    const showBasedOnAdvanced = showAdvanced || !field.advanced;
    
    // Check if field is accessible based on subscription plan
    let accessibleByPlan = true;
    if (field.requiresPlan) {
      if (field.requiresPlan === 'Pro') {
        // Pro features are accessible by Pro and Elite plans
        accessibleByPlan = planName === 'Pro' || planName === 'Elite';
      } else if (field.requiresPlan === 'Elite') {
        // Elite features are only accessible by Elite plan
        accessibleByPlan = planName === 'Elite';
      }
    }
    
    return inCurrentSection && showBasedOnAdvanced && accessibleByPlan;
  });

  // Check if user has reached their bot limit
  const isPaperBotLimitReached = maxPaperBots !== -1 && botCount.paper >= maxPaperBots;
  const isLiveBotLimitReached = maxLiveBots !== -1 && botCount.live >= maxLiveBots;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg shadow-md relative">
      <div className="p-6 border-b border-bolt-elements-borderColor flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">
            {configId ? 'Edit Bot Configuration' : 'Create New Bot Configuration'}
          </h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Configure your trading bot parameters
          </p>
        </div>
        <button
          onClick={onCancel}
          className="p-2 rounded-full text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors"
          title="Close"
        >
          <div className="i-ph:x-circle text-xl" />
        </button>
      </div>
      
      <div className="flex flex-col md:flex-row">
        {/* Section Navigation */}
        <div className="w-full md:w-64 border-r border-bolt-elements-borderColor">
          <div className="p-4">
            <div className="mb-4">
              <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
                Configuration Name
              </label>
              <input
                type="text"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none"
                placeholder="My Trading Bot"
              />
            </div>
            
            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={classNames(
                    "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                    activeSection === section.id
                      ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                      : "text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-textPrimary"
                  )}
                >
                  <div className={section.icon} />
                  {section.label}
                </button>
              ))}
            </nav>

            {activeSection === 'advanced' && (
              <div className="mt-4 flex items-center">
                <input
                  type="checkbox"
                  id="show-advanced"
                  checked={showAdvanced}
                  onChange={(e) => setShowAdvanced(e.target.checked)}
                  className="h-4 w-4 text-accent-500 focus:ring-accent-500 border-bolt-elements-borderColor rounded"
                />
                <label htmlFor="show-advanced" className="ml-2 text-sm text-bolt-elements-textSecondary">
                  Show advanced settings
                </label>
              </div>
            )}
          </div>
        </div>
        
        {/* Form Fields */}
        <div className="flex-1 p-6 overflow-auto max-h-[70vh]">
          {/* Paper/Live Trading Warning */}
          {activeSection === 'general' && (
            <div className="mb-6">
              <div className={classNames(
                "p-4 rounded-md border",
                isPaperBotLimitReached || isLiveBotLimitReached 
                  ? "bg-red-500/10 border-red-500/30 text-red-500"
                  : "bg-blue-500/10 border-blue-500/30 text-blue-500"
              )}>
                <div className="flex items-start">
                  <div className={classNames(
                    "mt-0.5 mr-3",
                    isPaperBotLimitReached || isLiveBotLimitReached ? "i-ph:warning-circle" : "i-ph:info-circle"
                  )} />
                  <div>
                    <h3 className="font-medium">Subscription Limits</h3>
                    <p className="mt-1 text-sm">
                      Your current plan ({planName}) allows for {maxPaperBots === -1 ? 'unlimited' : maxPaperBots} paper trading bots and {maxLiveBots} live trading bots.
                      {isPaperBotLimitReached && <span className="block mt-1 font-medium">You've reached your paper bot limit.</span>}
                      {isLiveBotLimitReached && <span className="block mt-1 font-medium">You've reached your live bot limit.</span>}
                      {(isPaperBotLimitReached || isLiveBotLimitReached) && (
                        <a href="/subscription/plans" className="block mt-1 underline">Upgrade your plan for more bots</a>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {filteredFields.map((field) => {
              const value = getNestedValue(configData, field.path);
              
              // Special handling for strategy field
              if (field.path === 'strategy') {
                return (
                  <div key={field.path} className="space-y-2">
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                      {field.icon && <div className={field.icon} />}
                      {field.label}
                    </label>
                    
                    {field.description && (
                      <p className="text-xs text-bolt-elements-textTertiary mb-1">
                        {field.description}
                      </p>
                    )}
                    
                    <div className="relative">
                      <div 
                        className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus-within:border-bolt-elements-borderColorActive flex items-center cursor-pointer"
                        onClick={() => setShowStrategyDropdown(!showStrategyDropdown)}
                      >
                        <input
                          type="text"
                          value={strategySearchTerm}
                          onChange={(e) => {
                            setStrategySearchTerm(e.target.value);
                            setShowStrategyDropdown(true);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowStrategyDropdown(true);
                          }}
                          placeholder={value || "Search strategies..."}
                          className="flex-1 bg-transparent border-none outline-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary"
                        />
                        <div className={`${showStrategyDropdown ? 'i-ph:caret-up' : 'i-ph:caret-down'} text-bolt-elements-textSecondary`} />
                      </div>
                      
                      {showStrategyDropdown && (
                        <div className="absolute z-10 w-full mt-1 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md shadow-lg max-h-60 overflow-auto">
                          {filteredStrategies.length === 0 ? (
                            <div className="p-2 text-bolt-elements-textSecondary text-sm">
                              No strategies found
                            </div>
                          ) : (
                            filteredStrategies.map(script => (
                              <div
                                key={script.id}
                                className={classNames(
                                  "p-2 cursor-pointer hover:bg-bolt-elements-item-backgroundActive",
                                  value === script.name ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent" : "text-bolt-elements-textPrimary"
                                )}
                                onClick={() => {
                                  handleInputChange('strategy', script.name);
                                  setShowStrategyDropdown(false);
                                }}
                              >
                                <div className="flex justify-between items-center">
                                  <span>{script.name}</span>
                                  <span className="text-xs text-bolt-elements-textTertiary">
                                    {new Date(script.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Special handling for dry_run field (Paper Trading)
              if (field.path === 'dry_run') {
                const isPaperDisabled = !configId && isPaperBotLimitReached && value === true;
                const isLiveDisabled = !configId && isLiveBotLimitReached && value === false;
                
                return (
                  <div key={field.path} className="space-y-2">
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                      {field.icon && <div className={field.icon} />}
                      {field.label}
                    </label>
                    
                    {field.description && (
                      <p className="text-xs text-bolt-elements-textTertiary mb-1">
                        {field.description}
                      </p>
                    )}
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => {
                          // Check limits before allowing change
                          if (!e.target.checked && isLiveBotLimitReached) {
                            toast.error(`You've reached your limit of ${maxLiveBots} live bots. Please upgrade your plan to create more.`);
                            return;
                          }
                          
                          if (e.target.checked && isPaperBotLimitReached) {
                            toast.error(`You've reached your limit of ${maxPaperBots} paper bots. Please upgrade your plan to create more.`);
                            return;
                          }
                          
                          handleInputChange(field.path, e.target.checked);
                        }}
                        className={classNames(
                          "h-4 w-4 text-accent-500 focus:ring-accent-500 border-bolt-elements-borderColor rounded",
                          (isPaperDisabled || isLiveDisabled) && "opacity-50 cursor-not-allowed"
                        )}
                        disabled={isPaperDisabled || isLiveDisabled}
                      />
                      <span className="ml-2 text-sm text-bolt-elements-textSecondary">
                        {value ? 'Enabled (Paper Trading)' : 'Disabled (Live Trading)'}
                      </span>
                    </div>
                    
                    {isPaperDisabled && (
                      <p className="text-xs text-amber-500">
                        You've reached your limit of {maxPaperBots} paper bots. <a href="/subscription/plans" className="underline">Upgrade now</a>
                      </p>
                    )}
                    
                    {isLiveDisabled && (
                      <p className="text-xs text-amber-500">
                        You've reached your limit of {maxLiveBots} live bots. <a href="/subscription/plans" className="underline">Upgrade now</a>
                      </p>
                    )}
                  </div>
                );
              }

              // Special handling for pair whitelist and blacklist
              if (field.path === 'exchange.pair_whitelist' || field.path === 'exchange.pair_blacklist') {
                return (
                  <div key={field.path} className="space-y-2">
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                      {field.icon && <div className={field.icon} />}
                      {field.label}
                    </label>
                    
                    {field.description && (
                      <p className="text-xs text-bolt-elements-textTertiary mb-1">
                        {field.description}
                      </p>
                    )}
                    
                    <textarea
                      value={formatArrayForTextarea(value)}
                      onChange={(e) => handleArrayTextareaChange(field.path, e.target.value)}
                      rows={5}
                      className="w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none font-mono text-sm"
                      placeholder="Enter one pair per line (e.g., BTC/USDT)"
                    />
                    <p className="text-xs text-bolt-elements-textTertiary">
                      Enter one trading pair per line (e.g., BTC/USDT)
                    </p>
                  </div>
                );
              }
              
              // Check if field requires a specific plan
              const isPlanRequired = field.requiresPlan && (
                (field.requiresPlan === 'Pro' && planName !== 'Pro' && planName !== 'Elite') ||
                (field.requiresPlan === 'Elite' && planName !== 'Elite')
              );
              
              return (
                <div key={field.path} className="space-y-2">
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                    {field.icon && <div className={field.icon} />}
                    {field.label}
                    {field.requiresPlan && (
                      <span className={classNames(
                        "ml-2 px-2 py-0.5 text-xs rounded-full",
                        isPlanRequired 
                          ? "bg-gray-500/20 text-gray-500" 
                          : "bg-accent-500/20 text-accent-500"
                      )}>
                        {field.requiresPlan}+
                      </span>
                    )}
                  </label>
                  
                  {field.description && (
                    <p className="text-xs text-bolt-elements-textTertiary mb-1">
                      {field.description}
                    </p>
                  )}
                  
                  {field.type === 'text' && (
                    <input
                      type="text"
                      value={value || ''}
                      onChange={(e) => handleInputChange(field.path, e.target.value)}
                      className={classNames(
                        "w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none",
                        isPlanRequired && "opacity-50 cursor-not-allowed"
                      )}
                      placeholder={field.placeholder}
                      disabled={isPlanRequired}
                    />
                  )}
                  
                  {field.type === 'number' && (
                    <input
                      type="number"
                      value={value !== undefined ? value : ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        handleInputChange(field.path, val);
                      }}
                      className={classNames(
                        "w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none",
                        isPlanRequired && "opacity-50 cursor-not-allowed"
                      )}
                      step="any"
                      disabled={isPlanRequired}
                    />
                  )}
                  
                  {field.type === 'boolean' && (
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => handleInputChange(field.path, e.target.checked)}
                        className={classNames(
                          "h-4 w-4 text-accent-500 focus:ring-accent-500 border-bolt-elements-borderColor rounded",
                          isPlanRequired && "opacity-50 cursor-not-allowed"
                        )}
                        disabled={isPlanRequired}
                      />
                      <span className="ml-2 text-sm text-bolt-elements-textSecondary">
                        {value ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  )}
                  
                  {field.type === 'select' && field.options && (
                    <select
                      value={value || ''}
                      onChange={(e) => handleInputChange(field.path, e.target.value)}
                      className={classNames(
                        "w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none",
                        isPlanRequired && "opacity-50 cursor-not-allowed"
                      )}
                      disabled={isPlanRequired}
                    >
                      <option value="">Select {field.label}</option>
                      {field.options.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  )}
                  
                  {field.type === 'textarea' && (
                    <textarea
                      value={value || ''}
                      onChange={(e) => handleInputChange(field.path, e.target.value)}
                      rows={5}
                      className={classNames(
                        "w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none",
                        isPlanRequired && "opacity-50 cursor-not-allowed"
                      )}
                      placeholder={field.placeholder}
                      disabled={isPlanRequired}
                    />
                  )}
                  
                  {field.type === 'json' && (
                    <textarea
                      value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value || ''}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          handleInputChange(field.path, parsed);
                        } catch (err) {
                          // Allow invalid JSON during editing
                          handleInputChange(field.path, e.target.value);
                        }
                      }}
                      rows={8}
                      className={classNames(
                        "w-full p-2 rounded-md bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:border-bolt-elements-borderColorActive focus:outline-none font-mono text-sm",
                        isPlanRequired && "opacity-50 cursor-not-allowed"
                      )}
                      disabled={isPlanRequired}
                    />
                  )}
                  
                  {isPlanRequired && (
                    <p className="text-xs text-amber-500">
                      This feature requires {field.requiresPlan} plan or higher. <a href="/subscription/plans" className="underline">Upgrade now</a>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="p-6 border-t border-bolt-elements-borderColor flex justify-end gap-4">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-md text-bolt-elements-button-secondary-text bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !configData.strategy}
          className={classNames(
            "px-4 py-2 rounded-md text-bolt-elements-button-primary-text bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover transition-colors",
            (saving || !configData.strategy) && "opacity-70 cursor-not-allowed"
          )}
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
      
      {/* Subscription Plan Limits Info */}
      <div className="p-4 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-3/50">
        <div className="flex flex-wrap gap-4 justify-between">
          <div className="flex items-center gap-2">
            <div className="i-ph:robot text-bolt-elements-textSecondary" />
            <span className="text-sm text-bolt-elements-textSecondary">
              Paper Bots: {botCount.paper} / {maxPaperBots === -1 ? '∞' : maxPaperBots}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="i-ph:currency-circle-dollar text-bolt-elements-textSecondary" />
            <span className="text-sm text-bolt-elements-textSecondary">
              Live Bots: {botCount.live} / {maxLiveBots === -1 ? '∞' : maxLiveBots}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="i-ph:arrow-square-up-right text-bolt-elements-textSecondary" />
            <a href="/subscription/plans" className="text-sm text-accent-500 hover:underline">
              Upgrade Plan
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}