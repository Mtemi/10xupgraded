import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';
import { ApiKeyDialog } from '~/components/auth/ApiKeyDialog';
import { useSubscriptionFeatures } from '~/lib/hooks/useSubscriptionFeatures';
import { ExchangeType, MarketType, CEX_SPOT, CEX_FUTURES, DEX } from '~/lib/exchange';

interface BotConfigFormProps {
  configId?: string;
  onSave?: () => void;
  onCancel?: () => void;
}

export function BotConfigForm({ configId, onSave, onCancel }: BotConfigFormProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [strategies, setStrategies] = useState<string[]>([]);
  const [recentStrategy, setRecentStrategy] = useState<string>('');
  const { maxPaperBots, maxLiveBots, planName, isExpired } = useSubscriptionFeatures();

  // Exchange selection state
  const [exchangeType, setExchangeType] = useState<ExchangeType | ''>('');
  const [marketType, setMarketType] = useState<MarketType>(null);
  const [exchangeId, setExchangeId] = useState<string>('');

  // Determine max symbols per bot based on plan
  const getMaxSymbolsPerBot = () => {
    if (isExpired) return 2; // Expired subscriptions get basic limits
    
    switch (planName) {
      case 'Elite': return 10;
      case 'Pro': return 5;
      case 'Free':
      default: return 2;
    }
  };

  // Determine max open trades based on plan
  const getMaxOpenTrades = () => {
    if (isExpired) return 1; // Expired subscriptions get basic limits
    
    switch (planName) {
      case 'Elite': return 15;
      case 'Pro': return 5;
      case 'Free':
      default: return 1;
    }
  };

  const maxSymbolsPerBot = getMaxSymbolsPerBot();
  const maxOpenTrades = getMaxOpenTrades();

  // Default configuration
  const defaultConfig = {
    botName: '',
    configName: '',
    strategy: '',
    max_open_trades: maxOpenTrades,
    stake_currency: 'USDT',
    stake_amount: 'unlimited',
    tradable_balance_ratio: 0.99,
    available_capital: 0.0,
    amend_last_stake_amount: false,
    last_stake_amount_min_ratio: 0.5,
    amount_reserve_percent: 0.05,
    timeframe: '5m',
    fiat_display_currency: 'USD',
    dry_run: true,
    dry_run_wallet: 1000,
    cancel_open_orders_on_exit: false,
    process_only_new_candles: true,
    minimal_roi: {
      "60": 0.01,
      "30": 0.02,
      "0": 0.04
    },
    stoploss: -0.10,
    trailing_stop: false,
    trailing_stop_positive: 0.005,
    trailing_stop_positive_offset: 0.0051,
    trailing_only_offset_is_reached: false,
    use_exit_signal: true,
    exit_profit_only: false,
    exit_profit_offset: 0.0,
    ignore_roi_if_entry_signal: false,
    ignore_buying_expired_candle_after: 0,
    position_adjustment_enable: false,
    max_entry_position_adjustment: -1,
    order_types: {
      entry: "limit",
      exit: "limit",
      stoploss: "market",
      emergency_exit: "market",
      force_entry: "market",
      force_exit: "market",
      stoploss_on_exchange: false,
      stoploss_on_exchange_interval: 60
    },
    order_time_in_force: {
      entry: "gtc",
      exit: "gtc"
    },
    entry_pricing: {
      price_side: "bid",
      use_order_book: false,
      order_book_top: 1,
      price_last_balance: 0.0,
      check_depth_of_market: {
        enabled: false,
        bids_to_ask_delta: 1
      }
    },
    exit_pricing: {
      price_side: "ask",
      use_order_book: false,
      order_book_top: 1,
      price_last_balance: 0.0
    },
    unfilledtimeout: {
      entry: 10,
      exit: 30,
      unit: "minutes",
      exit_timeout_count: 0
    },
    pairlists: [
      {"method": "StaticPairList"},
      {"method": "VolumePairList", "number_assets": 20, "sort_key": "quoteVolume", "refresh_period": 1800},
      {"method": "AgeFilter", "min_days_listed": 10},
      {"method": "PrecisionFilter"},
      {"method": "PriceFilter", "low_price_ratio": 0.01, "min_price": 0.00000010},
      {"method": "SpreadFilter", "max_spread_ratio": 0.005},
      {"method": "RangeStabilityFilter", "lookback_days": 10, "min_rate_of_change": 0.01, "refresh_period": 1440}
    ],
    protections: [
      {"method": "StoplossGuard", "lookback_period_candles": 60, "trade_limit": 4, "stop_duration_candles": 60, "only_per_pair": false},
      {"method": "CooldownPeriod", "stop_duration_candles": 20},
      {"method": "MaxDrawdown", "lookback_period_candles": 200, "trade_limit": 20, "stop_duration_candles": 10, "max_allowed_drawdown": 0.2},
      {"method": "LowProfitPairs", "lookback_period_candles": 360, "trade_limit": 1, "stop_duration_candles": 2, "required_profit": 0.02}
    ],
    exchange: {
      name: "",
      sandbox: false,
      key: "",
      secret: "",
      password: "",
      uid: "",
      enable_ws: true,
      markets_refresh_interval: 60,
      skip_open_order_update: false,
      unknown_fee_rate: 0.0,
      log_responses: false,
      only_from_ccxt: false,
      pair_whitelist: [
        "AVAX/USDT",
        "DOT/USDT",
        "LINK/USDT",
        "UNI/USDT",
        "MATIC/USDT",
        "LTC/USDT",
        "ATOM/USDT",
        "NEAR/USDT",
        "FIL/USDT",
        "AAVE/USDT",
        "SAND/USDT",
        "GRT/USDT",
        "FTM/USDT",
        "ALGO/USDT",
        "ICP/USDT",
        "VETUSDT",
        "SOL/USDT"
      ],
      pair_blacklist: [
        "DOGE/USDT",
        "SHIB/USDT"
      ]
    },
    telegram: {
      enabled: false,
      token: "",
      chat_id: ""
    },
    api_server: {
      enabled: true,
      listen_ip_address: "127.0.0.1",
      listen_port: 8080,
      verbosity: "error",
      enable_openapi: false,
      jwt_secret_key: "CHANGE_ME_TO_RANDOM_SECRET",
      CORS_origins: "[]",
      username: "meghan",
      password: "SuperSecret1!",
      ws_token: "SOME_RANDOM_WS_TOKEN"
    },
    bot_name: "MeghanBot",
    initial_state: "stopped",
    force_entry_enable: true,
    internals: {
      process_throttle_secs: 5,
      heartbeat_interval: 60
    },
    disable_dataframe_checks: false,
    strategy_path: "user_data/strategies/",
    dataformat_ohlcv: "json",
    dataformat_trades: "jsongz",
    // Hidden defaults
    margin_mode: "cross"
  };

  const [config, setConfig] = useState(defaultConfig);
  const [pairWhitelist, setPairWhitelist] = useState<string>(defaultConfig.exchange.pair_whitelist.join('\n'));
  const [pairBlacklist, setPairBlacklist] = useState<string>(defaultConfig.exchange.pair_blacklist.join('\n'));
  const [minimalRoi, setMinimalRoi] = useState<string>(JSON.stringify(defaultConfig.minimal_roi, null, 2));
  const [pairlists, setPairlists] = useState<string>(JSON.stringify(defaultConfig.pairlists, null, 2));
  const [protections, setProtections] = useState<string>(JSON.stringify(defaultConfig.protections, null, 2));

  // Get the selected exchange object
  const selectedExchange = 
    exchangeType === 'DEX' ? DEX.find(x => x.id === exchangeId) :
    marketType === 'spot' ? CEX_SPOT.find(x => x.id === exchangeId) :
    CEX_FUTURES.find(x => x.id === exchangeId);

  // Fetch user's most recently used strategy on mount
  useEffect(() => {
    const fetchRecentStrategy = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('bot_configurations')
          .select('config')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        
        if (data && data.length > 0 && data[0].config?.strategy) {
          const recentStrat = data[0].config.strategy;
          setRecentStrategy(recentStrat);
          
          // Auto-select the most recent strategy
          setConfig(prev => ({
            ...prev,
            strategy: recentStrat,
            botName: recentStrat,
            configName: recentStrat
          }));
        }
      } catch (error) {
        console.error('Error fetching recent strategy:', error);
      }
    };

    fetchRecentStrategy();
  }, []);

  // Fetch available strategies
  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const { data, error } = await supabase
          .from('trading_scripts')
          .select('name, updated_at')
          .order('updated_at', { ascending: false });
        
        if (error) throw error;
        
        if (data) {
          const strategyNames = data.map(item => item.name);
          setStrategies(strategyNames);
        }
      } catch (error) {
        console.error('Error fetching strategies:', error);
        toast.error('Failed to load strategies');
      }
    };

    fetchStrategies();
  }, []);

  // Fetch existing config if editing
  useEffect(() => {
    if (!configId) return;

    const fetchConfig = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('bot_configurations')
          .select('*')
          .eq('id', configId)
          .single();
        
        if (error) throw error;
        
        if (data) {
          const botConfig = data.config || defaultConfig;
          setConfig(botConfig);
          
          // Set form fields from config
          if (data.config) {
            // Set exchange type and market type based on config
            if (data.config.exchange?.name) {
              // Check if it's a DEX
              if (DEX.some(x => x.id === data.config.exchange.name)) {
                setExchangeType('DEX');
                setExchangeId(data.config.exchange.name);
              } 
              // Check if it's a CEX
              else {
                setExchangeType('CEX');
                
                // Determine if it's spot or futures
                if (data.config.trading_mode === 'futures') {
                  setMarketType('futures');
                  // Find in CEX_FUTURES
                  const exchange = CEX_FUTURES.find(x => x.id === data.config.exchange.name);
                  if (exchange) setExchangeId(exchange.id);
                } else {
                  setMarketType('spot');
                  // Find in CEX_SPOT
                  const exchange = CEX_SPOT.find(x => x.id === data.config.exchange.name);
                  if (exchange) setExchangeId(exchange.id);
                }
              }
            }
            
            if (data.config.exchange?.pair_whitelist) {
              setPairWhitelist(data.config.exchange.pair_whitelist.join('\n'));
            }
            
            if (data.config.exchange?.pair_blacklist) {
              setPairBlacklist(data.config.exchange.pair_blacklist.join('\n'));
            }
            
            if (data.config.minimal_roi) {
              setMinimalRoi(JSON.stringify(data.config.minimal_roi, null, 2));
            }
            
            if (data.config.pairlists) {
              setPairlists(JSON.stringify(data.config.pairlists, null, 2));
            }
            
            if (data.config.protections) {
              setProtections(JSON.stringify(data.config.protections, null, 2));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching bot configuration:', error);
        toast.error('Failed to load bot configuration');
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [configId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setConfig(prev => ({
        ...prev,
        [name]: checked
      }));
    } else if (name === 'max_open_trades') {
      // Enforce max open trades limit based on plan
      const numValue = parseInt(value);
      const limitedValue = Math.min(numValue, maxOpenTrades);
      setConfig(prev => ({
        ...prev,
        [name]: limitedValue
      }));
    } else if (name === 'strategy') {
      // When strategy changes, update botName and configName too
      setConfig(prev => ({
        ...prev,
        [name]: value,
        botName: value,
        configName: value
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleNestedInputChange = (category: string, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const handleExchangeInputChange = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      exchange: {
        ...prev.exchange,
        [field]: value
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Check if user's subscription is expired
      if (isExpired && planName !== 'Free') {
        toast.error('Your subscription has expired. Please renew to continue using this feature.');
        setIsLoading(false);
        return;
      }
      
      // Validate API keys if not in dry run
      if (!config.dry_run && (!config.exchange.key || !config.exchange.secret)) {
        setShowApiKeyDialog(true);
        return;
      }
      
      // Process the configuration
      const processedConfig = { ...config };
      
      // Parse whitelist and blacklist
      processedConfig.exchange.pair_whitelist = pairWhitelist
        .split('\n')
        .map(pair => pair.trim())
        .filter(pair => pair.length > 0)
        .slice(0, maxSymbolsPerBot); // Limit to plan's max symbols
      
      processedConfig.exchange.pair_blacklist = pairBlacklist
        .split('\n')
        .map(pair => pair.trim())
        .filter(pair => pair.length > 0);
      
      // Parse JSON fields
      try {
        processedConfig.minimal_roi = JSON.parse(minimalRoi);
        processedConfig.pairlists = JSON.parse(pairlists);
        processedConfig.protections = JSON.parse(protections);
      } catch (error) {
        toast.error('Invalid JSON in advanced settings');
        setIsLoading(false);
        return;
      }
      
      // Set trading mode and margin mode for futures
      if (marketType === 'futures') {
        processedConfig.trading_mode = 'futures';
        processedConfig.margin_mode = selectedExchange?.marginMode || 'isolated';
      } else {
        processedConfig.trading_mode = 'spot';
        processedConfig.margin_mode = 'cross';
      }
      
      // Set hidden defaults
      processedConfig.initial_state = "stopped";
      processedConfig.force_entry_enable = true;
      processedConfig.enable_ws = true;
      processedConfig.markets_refresh_interval = 60;
      
      // Disable telegram for now
      processedConfig.telegram.enabled = false;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to save bot configuration');
        setIsLoading(false);
        return;
      }
      
      // Check bot limits based on subscription
      const { data: existingBots, error: countError } = await supabase
        .from('bot_configurations')
        .select('id, config')
        .eq('user_id', user.id);
      
      if (countError) {
        console.error('Error counting existing bots:', countError);
        toast.error('Failed to verify bot limits');
        setIsLoading(false);
        return;
      }
      
      // Count paper and live bots
      const paperBotCount = existingBots?.filter(bot => bot.config?.dry_run === true).length || 0;
      const liveBotCount = existingBots?.filter(bot => bot.config?.dry_run === false).length || 0;
      
      // Check against plan limits
      if (config.dry_run) {
        // Paper bot limits
        if (paperBotCount >= maxPaperBots && !configId) {
          toast.error(`Your ${planName} plan allows only ${maxPaperBots} paper bot${maxPaperBots !== 1 ? 's' : ''}. Please upgrade to create more bots.`);
          setIsLoading(false);
          return;
        }
      } else {
        // Live bot limits
        if (liveBotCount >= maxLiveBots && !configId) {
          toast.error(`Your ${planName} plan allows only ${maxLiveBots} live bot${maxLiveBots !== 1 ? 's' : ''}. Please upgrade to create more bots.`);
          setIsLoading(false);
          return;
        }
        
        // Free plan can't do live trading
        if (planName === 'Free') {
          toast.error('Free plan does not support live trading. Please upgrade to Pro or Elite plan.');
          setIsLoading(false);
          return;
        }
      }
      
      // Save to database
      const botData = {
        user_id: user.id,
        name: processedConfig.botName || processedConfig.strategy,
        config: processedConfig,
        is_active: false
      };
      
      let response;
      if (configId) {
        // Update existing config
        response = await supabase
          .from('bot_configurations')
          .update(botData)
          .eq('id', configId);
      } else {
        // Create new config
        response = await supabase
          .from('bot_configurations')
          .insert(botData)
          .select();
      }
      
      if (response.error) throw response.error;
      
      toast.success(`Bot configuration ${configId ? 'updated' : 'created'} successfully`);
      
      if (onSave) {
        onSave();
      } else {
        navigate('/bots');
      }
    } catch (error) {
      console.error('Error saving bot configuration:', error);
      toast.error('Failed to save bot configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApiKeyConfirm = (apiKey: string, apiSecret: string) => {
    setConfig(prev => ({
      ...prev,
      exchange: {
        ...prev.exchange,
        key: apiKey,
        secret: apiSecret
      }
    }));
    
    setShowApiKeyDialog(false);
    
    // Continue with form submission
    setTimeout(() => {
      handleSubmit({ preventDefault: () => {} } as React.FormEvent);
    }, 100);
  };

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg shadow-md overflow-hidden">
      <div className="p-6 border-b border-bolt-elements-borderColor">
        <h2 className="text-2xl font-bold text-bolt-elements-textPrimary">
          {configId ? 'Edit Bot Configuration' : 'Create New Bot Configuration'}
        </h2>
        <p className="mt-2 text-bolt-elements-textSecondary">
          Configure your trading bot parameters
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Strategy Selection */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Strategy Name
            </label>
            <select
              name="strategy"
              value={config.strategy}
              onChange={handleInputChange}
              className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
              required
            >
              <option value="">Select a Strategy</option>
              {strategies.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>
            {recentStrategy && !config.strategy && (
              <p className="mt-1 text-xs text-accent-500">
                Recent strategy: {recentStrategy}
              </p>
            )}
          </div>

          {/* Trading Mode */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Trading Mode
            </label>
            <div className="flex space-x-4">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="dry_run"
                  checked={config.dry_run === true}
                  onChange={() => setConfig(prev => ({ ...prev, dry_run: true }))}
                  className="form-radio h-4 w-4 text-bolt-elements-button-primary-background"
                />
                <span className="ml-2 text-bolt-elements-textPrimary">Paper Trading</span>
                {planName === 'Free' && (
                  <span className="ml-2 text-xs bg-accent-500 text-white px-2 py-0.5 rounded-full">
                    Free Plan
                  </span>
                )}
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="dry_run"
                  checked={config.dry_run === false}
                  onChange={() => setConfig(prev => ({ ...prev, dry_run: false }))}
                  className="form-radio h-4 w-4 text-bolt-elements-button-primary-background"
                  disabled={planName === 'Free' || isExpired}
                />
                <span className={classNames(
                  "ml-2",
                  (planName === 'Free' || isExpired) ? "text-bolt-elements-textTertiary" : "text-bolt-elements-textPrimary"
                )}>
                  Live Trading
                </span>
                {(planName === 'Free' || isExpired) && (
                  <span className="ml-2 text-xs bg-gray-500 text-white px-2 py-0.5 rounded-full">
                    Pro/Elite
                  </span>
                )}
              </label>
            </div>
            {planName === 'Free' && (
              <p className="mt-1 text-xs text-bolt-elements-textTertiary">
                Upgrade to Pro or Elite plan to enable live trading
              </p>
            )}
            {isExpired && planName !== 'Free' && (
              <p className="mt-1 text-xs text-red-500">
                Your subscription has expired. Please renew to access live trading.
              </p>
            )}
          </div>

          {/* Exchange Type */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Platform Type
            </label>
            <select
              value={exchangeType}
              onChange={(e) => {
                setExchangeType(e.target.value as ExchangeType);
                setMarketType(null);
                setExchangeId('');
                // Reset exchange name in config
                handleExchangeInputChange('name', '');
              }}
              className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
              required
            >
              <option value="">Select Type...</option>
              <option value="CEX">CEX</option>
              <option value="DEX" disabled={planName !== 'Elite' || isExpired}>DEX (Elite Plan Only)</option>
            </select>
            {exchangeType === 'DEX' && planName !== 'Elite' && (
              <p className="mt-1 text-xs text-red-500">
                DEX support requires Elite plan
              </p>
            )}
          </div>

          {/* Market Type (only for CEX) */}
          {exchangeType === 'CEX' && (
            <div className="col-span-1">
              <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                Market
              </label>
              <select
                value={marketType || ''}
                onChange={(e) => {
                  setMarketType(e.target.value as MarketType);
                  setExchangeId('');
                  // Reset exchange name in config
                  handleExchangeInputChange('name', '');
                }}
                className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                required
              >
                <option value="">Select Market...</option>
                <option value="spot">Spot</option>
                <option value="futures" disabled={planName === 'Free' || isExpired}>Futures {planName === 'Free' ? '(Pro/Elite Only)' : ''}</option>
              </select>
              {marketType === 'futures' && planName === 'Free' && (
                <p className="mt-1 text-xs text-red-500">
                  Futures trading requires Pro or Elite plan
                </p>
              )}
            </div>
          )}

          {/* Exchange Selection */}
          {exchangeType && (
            <div className="col-span-1">
              <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                Exchange
              </label>
              <select
                value={exchangeId}
                onChange={(e) => {
                  setExchangeId(e.target.value);
                  // Update exchange name in config
                  handleExchangeInputChange('name', e.target.value);
                }}
                className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                required
              >
                <option value="">Select Exchange...</option>
                {(() => {
                  const list = exchangeType === 'DEX' 
                    ? DEX 
                    : marketType === 'spot' 
                      ? CEX_SPOT 
                      : CEX_FUTURES;
                  return list.map(x => (
                    <option key={x.id} value={x.id}>{x.label}</option>
                  ));
                })()}
              </select>
            </div>
          )}

          {/* Timeframe */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Timeframe
            </label>
            <select
              name="timeframe"
              value={config.timeframe}
              onChange={handleInputChange}
              className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
              required
            >
              <option value="1m">1 minute</option>
              <option value="5m">5 minutes</option>
              <option value="15m">15 minutes</option>
              <option value="30m">30 minutes</option>
              <option value="1h">1 hour</option>
              <option value="4h">4 hours</option>
              <option value="1d">1 day</option>
            </select>
          </div>

          {/* Stake Currency */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Stake Currency
            </label>
            <select
              name="stake_currency"
              value={config.stake_currency}
              onChange={handleInputChange}
              className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
              required
            >
              <option value="USDT">USDT</option>
              <option value="BUSD">BUSD</option>
              <option value="USDC">USDC</option>
              <option value="BTC">BTC</option>
              <option value="ETH">ETH</option>
            </select>
          </div>

          {/* Max Open Trades */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Max Open Trades
              <span className="ml-2 text-xs text-bolt-elements-textTertiary">
                (Max: {maxOpenTrades} for {planName} plan)
              </span>
            </label>
            <input
              type="number"
              name="max_open_trades"
              value={config.max_open_trades}
              onChange={handleInputChange}
              min="1"
              max={maxOpenTrades}
              className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
              required
            />
          </div>

          {/* Stake Amount */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Stake Amount
            </label>
            <div className="flex space-x-4">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="stake_amount_type"
                  checked={config.stake_amount === 'unlimited'}
                  onChange={() => setConfig(prev => ({ ...prev, stake_amount: 'unlimited' }))}
                  className="form-radio h-4 w-4 text-bolt-elements-button-primary-background"
                />
                <span className="ml-2 text-bolt-elements-textPrimary">Unlimited</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="stake_amount_type"
                  checked={typeof config.stake_amount === 'number'}
                  onChange={() => setConfig(prev => ({ ...prev, stake_amount: 100 }))}
                  className="form-radio h-4 w-4 text-bolt-elements-button-primary-background"
                />
                <span className="ml-2 text-bolt-elements-textPrimary">Fixed</span>
              </label>
            </div>
            {typeof config.stake_amount === 'number' && (
              <input
                type="number"
                value={config.stake_amount}
                onChange={(e) => setConfig(prev => ({ ...prev, stake_amount: parseFloat(e.target.value) }))}
                className="mt-2 w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                min="0"
                step="0.01"
              />
            )}
          </div>

          {/* Paper Trading Wallet Size */}
          {config.dry_run && (
            <div className="col-span-1">
              <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                Paper Trading Wallet Size
              </label>
              <input
                type="number"
                name="dry_run_wallet"
                value={config.dry_run_wallet}
                onChange={handleInputChange}
                min="100"
                className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                required
              />
            </div>
          )}

          {/* Stoploss */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Stoploss (%)
            </label>
            <input
              type="number"
              name="stoploss"
              value={config.stoploss}
              onChange={handleInputChange}
              step="0.01"
              max="0"
              className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
              required
            />
            <p className="mt-1 text-xs text-bolt-elements-textTertiary">
              Negative value, e.g. -0.10 for 10% loss
            </p>
          </div>

          {/* Exchange Credentials */}
          {selectedExchange && (
            <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-bolt-elements-background-depth-3 rounded-lg">
              <div className="col-span-1 md:col-span-2">
                <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                  {selectedExchange.label} Credentials
                </h3>
              </div>
              
              {selectedExchange.creds.includes('key') && (
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    API Key
                  </label>
                  <input
                    type="text"
                    value={config.exchange.key || ''}
                    onChange={(e) => handleExchangeInputChange('key', e.target.value)}
                    className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                    placeholder="Enter API Key"
                  />
                </div>
              )}
              
              {selectedExchange.creds.includes('secret') && (
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    API Secret
                  </label>
                  <input
                    type="password"
                    value={config.exchange.secret || ''}
                    onChange={(e) => handleExchangeInputChange('secret', e.target.value)}
                    className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                    placeholder="Enter API Secret"
                  />
                </div>
              )}
              
              {selectedExchange.creds.includes('password') && (
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    API Passphrase
                  </label>
                  <input
                    type="password"
                    value={config.exchange.password || ''}
                    onChange={(e) => handleExchangeInputChange('password', e.target.value)}
                    className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                    placeholder="Enter API Passphrase"
                  />
                </div>
              )}
              
              {selectedExchange.creds.includes('uid') && (
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    API Memo / UID
                  </label>
                  <input
                    type="text"
                    value={config.exchange.uid || ''}
                    onChange={(e) => handleExchangeInputChange('uid', e.target.value)}
                    className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                    placeholder="Enter API Memo/UID"
                  />
                </div>
              )}
              
              {selectedExchange.creds.includes('walletAddress') && (
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    Wallet Address
                  </label>
                  <input
                    type="text"
                    value={config.exchange.walletAddress || ''}
                    onChange={(e) => handleExchangeInputChange('walletAddress', e.target.value)}
                    className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                    placeholder="Enter Wallet Address"
                  />
                </div>
              )}
              
              {selectedExchange.creds.includes('privateKey') && (
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    Wallet Private Key
                  </label>
                  <textarea
                    value={config.exchange.privateKey || ''}
                    onChange={(e) => handleExchangeInputChange('privateKey', e.target.value)}
                    className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                    placeholder="Enter Wallet Private Key"
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          {/* Trailing Stop */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center">
              <input
                type="checkbox"
                name="trailing_stop"
                checked={config.trailing_stop}
                onChange={(e) => setConfig(prev => ({ ...prev, trailing_stop: e.target.checked }))}
                className="h-4 w-4 text-bolt-elements-button-primary-background rounded border-bolt-elements-borderColor focus:ring-accent-500"
              />
              <label className="ml-2 block text-sm font-medium text-bolt-elements-textSecondary">
                Enable Trailing Stop
              </label>
            </div>
            
            {config.trailing_stop && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    Trailing Stop Positive (%)
                  </label>
                  <input
                    type="number"
                    name="trailing_stop_positive"
                    value={config.trailing_stop_positive}
                    onChange={handleInputChange}
                    step="0.001"
                    min="0.001"
                    max="0.5"
                    className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    Trailing Stop Positive Offset (%)
                  </label>
                  <input
                    type="number"
                    name="trailing_stop_positive_offset"
                    value={config.trailing_stop_positive_offset}
                    onChange={handleInputChange}
                    step="0.001"
                    min="0"
                    max="0.5"
                    className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="trailing_only_offset_is_reached"
                      checked={config.trailing_only_offset_is_reached}
                      onChange={(e) => setConfig(prev => ({ ...prev, trailing_only_offset_is_reached: e.target.checked }))}
                      className="h-4 w-4 text-bolt-elements-button-primary-background rounded border-bolt-elements-borderColor focus:ring-accent-500"
                    />
                    <label className="ml-2 block text-sm font-medium text-bolt-elements-textSecondary">
                      Only apply trailing stop after offset is reached
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Minimal ROI */}
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Minimal ROI
            </label>
            <textarea
              value={minimalRoi}
              onChange={(e) => setMinimalRoi(e.target.value)}
              rows={4}
              className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none font-mono text-sm"
              placeholder='{"60": 0.01, "30": 0.02, "0": 0.04}'
            />
            <p className="mt-1 text-xs text-bolt-elements-textTertiary">
              JSON format: {"{"}"minutes": profit_percentage{"}"}. Example: {"{"}"60": 0.01, "30": 0.02, "0": 0.04{"}"}
            </p>
          </div>

          {/* Pair Whitelist */}
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Pair Whitelist
              <span className="ml-2 text-xs text-bolt-elements-textTertiary">
                (Max: {maxSymbolsPerBot} for {planName} plan)
              </span>
            </label>
            <textarea
              value={pairWhitelist}
              onChange={(e) => {
                // Limit to max symbols per plan
                const lines = e.target.value.split('\n');
                if (lines.length <= maxSymbolsPerBot) {
                  setPairWhitelist(e.target.value);
                } else {
                  setPairWhitelist(lines.slice(0, maxSymbolsPerBot).join('\n'));
                  toast.warning(`Maximum ${maxSymbolsPerBot} trading pairs allowed on your plan`);
                }
              }}
              rows={5}
              className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none font-mono text-sm"
              placeholder="BTC/USDT
ETH/USDT
BNB/USDT
ADA/USDT
SOL/USDT"
            />
            <p className="mt-1 text-xs text-bolt-elements-textTertiary">
              One pair per line. Example: BTC/USDT
            </p>
          </div>

          {/* Pair Blacklist */}
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Pair Blacklist
            </label>
            <textarea
              value={pairBlacklist}
              onChange={(e) => setPairBlacklist(e.target.value)}
              rows={3}
              className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none font-mono text-sm"
              placeholder="DOGE/USDT
SHIB/USDT"
            />
            <p className="mt-1 text-xs text-bolt-elements-textTertiary">
              Pairs to exclude from trading. One pair per line.
            </p>
          </div>

          {/* Form Buttons */}
          <div className="col-span-1 md:col-span-2 flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={onCancel || (() => navigate('/bots'))}
              className="px-6 py-3 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded-md hover:bg-bolt-elements-button-secondary-backgroundHover transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={classNames(
                "px-6 py-3 rounded-md transition-colors",
                isLoading
                  ? "bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text opacity-70 cursor-not-allowed"
                  : "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
              )}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="i-svg-spinners:90-ring-with-bg animate-spin mr-2" />
                  {configId ? 'Updating...' : 'Creating...'}
                </div>
              ) : (
                <>{configId ? 'Update Configuration' : 'Create Configuration'}</>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* API Key Dialog */}
      <ApiKeyDialog
        isOpen={showApiKeyDialog}
        onClose={() => setShowApiKeyDialog(false)}
        onConfirm={handleApiKeyConfirm}
        platformId={config.exchange.name}
      />
    </div>
  );
}