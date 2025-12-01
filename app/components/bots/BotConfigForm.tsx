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
  const [loadingStrategies, setLoadingStrategies] = useState(true);
  const { maxPaperBots, maxLiveBots, planName, isExpired } = useSubscriptionFeatures();
  const [limitsChecked, setLimitsChecked] = useState(false);
  const [canCreateBot, setCanCreateBot] = useState(true);

  // Exchange selection state
  const [exchangeType, setExchangeType] = useState<ExchangeType | ''>('');
  const [marketType, setMarketType] = useState<MarketType>(null);
  const [exchangeId, setExchangeId] = useState<string>('');

  // Determine max symbols per bot based on plan
  const getMaxSymbolsPerBot = () => {
    if (isExpired) return 1; // Expired subscriptions get basic limits

    switch (planName) {
      case 'Elite': return 40;
      case 'Pro': return 5;
      case 'Free': default: return 3;
    }
  };

  // Determine max open trades based on plan
  const getMaxOpenTrades = () => {
    if (isExpired) return 1; // Expired subscriptions get basic limits

    switch (planName) {
      case 'Elite': return 40;
      case 'Pro': return 5;
      case 'Free':
      default: return 3;
    }
  };

  const maxSymbolsPerBot = getMaxSymbolsPerBot();
  const maxOpenTrades = getMaxOpenTrades();

  // 🔧 Helper function to check if a bot configuration is properly configured
  const isProperlyConfiguredBot = useCallback((bot: any): boolean => {
    // A bot is considered properly configured if it has:
    // 1. A strategy name
    // 2. An exchange name
    // 3. At least one trading pair in the whitelist

    if (!bot || !bot.config) return false;

    const hasStrategy = bot.config.strategy && bot.config.strategy.trim().length > 0;
    const hasExchange = bot.config.exchange &&
                        ((typeof bot.config.exchange === 'string' && bot.config.exchange.trim().length > 0) ||
                         (typeof bot.config.exchange === 'object' && bot.config.exchange.name && bot.config.exchange.name.trim().length > 0));
    const hasTradingPairs = bot.config.exchange &&
                           bot.config.exchange.pair_whitelist &&
                           Array.isArray(bot.config.exchange.pair_whitelist) &&
                           bot.config.exchange.pair_whitelist.length > 0;

    // Log for debugging
    console.log('[BotConfigForm] Checking bot configuration:', {
      botId: bot.id,
      hasStrategy,
      hasExchange,
      hasTradingPairs,
      isProperlyConfigured: hasStrategy && hasExchange && hasTradingPairs
    });

    return hasStrategy && hasExchange && hasTradingPairs;
  }, []);

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

  // Check bot limits on mount (only when creating new bot, not editing)
  useEffect(() => {
    if (configId || limitsChecked) return; // Skip if editing or already checked

    const checkLimits = async () => {
      try {
        console.log('[BotConfigForm] Checking bot limits on mount');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLimitsChecked(true);
          return;
        }

        // Check if subscription is expired
        if (isExpired && planName !== 'Free') {
          toast.error(`Your ${planName} subscription has expired. Please renew your subscription to create new bots.`);
          setCanCreateBot(false);
          setLimitsChecked(true);
          return;
        }

        // Fetch existing bots to check limits
        const { data: existingBots, error: countError } = await supabase
          .from('bot_configurations')
          .select('id, config')
          .eq('user_id', user.id);

        if (countError) {
          console.error('[BotConfigForm] Error checking limits:', countError);
          setLimitsChecked(true);
          return;
        }

        // Filter to only count properly configured bots
        const properlyConfiguredBots = (existingBots || []).filter(isProperlyConfiguredBot);
        const paperBotCount = properlyConfiguredBots.filter(bot => bot.config?.dry_run === true).length || 0;
        const liveBotCount = properlyConfiguredBots.filter(bot => bot.config?.dry_run === false).length || 0;

        console.log('[BotConfigForm] Current bot counts:', {
          paperBots: paperBotCount,
          maxPaperBots,
          liveBots: liveBotCount,
          maxLiveBots,
          planName
        });

        // Check paper bot limit
        if (paperBotCount >= maxPaperBots) {
          toast.warning(`You have ${paperBotCount}/${maxPaperBots} paper bots on your ${planName} plan. Upgrade to create more.`, { containerId: 'main-toast-container' });
          console.log('[BotConfigForm] Paper bot limit notification shown');
        }

        // Check live bot limit
        if (liveBotCount >= maxLiveBots && planName !== 'Free') {
          toast.warning(`You have ${liveBotCount}/${maxLiveBots} live bots on your ${planName} plan. Upgrade to create more.`, { containerId: 'main-toast-container' });
          console.log('[BotConfigForm] Live bot limit notification shown');
        }

        // Notify about Free plan limitations
        if (planName === 'Free') {
          toast.info(`Free Plan: Paper trading only, max ${maxPaperBots} bot(s), ${maxOpenTrades} trades, ${maxSymbolsPerBot} pairs. Upgrade for more features!`, { containerId: 'main-toast-container' });
        }

        setLimitsChecked(true);
      } catch (error) {
        console.error('[BotConfigForm] Error in checkLimits:', error);
        setLimitsChecked(true);
      }
    };

    checkLimits();
  }, [configId, limitsChecked, isExpired, planName, maxPaperBots, maxLiveBots, maxOpenTrades, maxSymbolsPerBot]);

  // Fetch available strategies (max 15, most recent first)
  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        setLoadingStrategies(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('trading_scripts')
          .select('name, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(15);

        if (error) throw error;

        if (data && data.length > 0) {
          const strategyNames = data.map(item => item.name);
          setStrategies(strategyNames);

          // Auto-select the most recent strategy ONLY if creating a new bot (not editing)
          if (!configId) {
            const mostRecentStrategy = strategyNames[0];
            setConfig(prev => ({
              ...prev,
              strategy: mostRecentStrategy,
              botName: mostRecentStrategy,
              configName: mostRecentStrategy
            }));
          }
        } else {
          // No strategies found
          setStrategies([]);
          if (!configId) {
            toast.info('No trading strategies found. Please create a strategy first by chatting with the AI on the home page.', { containerId: 'main-toast-container' });
          }
        }
      } catch (error) {
        console.error('Error fetching strategies:', error);
        toast.error('Failed to load strategies. Please refresh the page.', { containerId: 'main-toast-container' });
        setStrategies([]);
      } finally {
        setLoadingStrategies(false);
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
      const numValue = parseInt(value) || 1;
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
      console.log('[BotConfigForm] Starting form submission');
      console.log('[BotConfigForm] Current config state:', {
        strategy: config.strategy,
        exchangeType,
        marketType,
        exchangeId,
        selectedExchange: selectedExchange?.label
      });

      // Check if user's subscription is expired
      if (isExpired && planName !== 'Free') {
        toast.error('Your subscription has expired. Please renew to continue using this feature.', {
          containerId: 'main-toast-container'
        });
        setIsLoading(false);
        return;
      }

      // Validate required fields
      if (!config.strategy) {
        toast.error('Please select a strategy', { containerId: 'main-toast-container' });
        setIsLoading(false);
        return;
      }

      if (!exchangeType) {
        toast.error('Please select a platform type', { containerId: 'main-toast-container' });
        setIsLoading(false);
        return;
      }

      if (!exchangeId) {
        toast.error('Please select an exchange', { containerId: 'main-toast-container' });
        setIsLoading(false);
        return;
      }

      // Validate API keys if not in dry run
      if (!config.dry_run && (!config.exchange.key || !config.exchange.secret)) {
        console.log('[BotConfigForm] API keys required for live trading, showing dialog');
        setShowApiKeyDialog(true);
        setIsLoading(false);
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
        console.error('[BotConfigForm] JSON parsing error:', error);
        toast.error('Invalid JSON in advanced settings', { containerId: 'main-toast-container' });
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

      // Ensure exchange name is set correctly
      if (!processedConfig.exchange.name && exchangeId) {
        processedConfig.exchange.name = exchangeId;
        console.log('[BotConfigForm] Set exchange name to:', exchangeId);
      }

      // Set hidden defaults
      processedConfig.initial_state = "stopped";
      processedConfig.force_entry_enable = true;
      processedConfig.enable_ws = true;
      processedConfig.markets_refresh_interval = 60;

      // Disable telegram for now
      processedConfig.telegram.enabled = false;

      console.log('[BotConfigForm] Getting authenticated user');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[BotConfigForm] No authenticated user found');
        toast.error('Please sign in to save bot configuration', { containerId: 'main-toast-container' });
        setIsLoading(false);
        return;
      }

      console.log('[BotConfigForm] Checking bot limits for user:', user.id);
      // 🔧 FIX: Check bot limits based on subscription - ONLY count properly configured bots
      const { data: existingBots, error: countError } = await supabase
        .from('bot_configurations')
        .select('id, config')
        .eq('user_id', user.id);

      if (countError) {
        console.error('[BotConfigForm] Error counting existing bots:', countError);
        toast.error('Failed to verify bot limits', { containerId: 'main-toast-container' });
        setIsLoading(false);
        return;
      }

      // 🔧 FIX: Filter to only count properly configured bots (exclude placeholder/incomplete configs)
      const properlyConfiguredBots = (existingBots || []).filter(isProperlyConfiguredBot);

      // Count paper and live bots - ONLY from properly configured bots
      const paperBotCount = properlyConfiguredBots.filter(bot => bot.config?.dry_run === true).length || 0;
      const liveBotCount = properlyConfiguredBots.filter(bot => bot.config?.dry_run === false).length || 0;

      console.log('[BotConfigForm] Bot counts (properly configured only):', {
        totalBots: existingBots?.length || 0,
        properlyConfiguredCount: properlyConfiguredBots.length,
        paperBotCount,
        liveBotCount,
        maxPaperBots,
        maxLiveBots
      });

      // Check against plan limits
      if (config.dry_run) {
        // Paper bot limits
        if (paperBotCount >= maxPaperBots && !configId) {
          console.log('[BotConfigForm] Paper bot limit exceeded');
          toast.error(`Paper bot limit reached: ${paperBotCount}/${maxPaperBots} on ${planName} plan. Upgrade to create more.`, { containerId: 'main-toast-container' });
          setIsLoading(false);
          return;
        }
      } else {
        // Live bot limits
        if (liveBotCount >= maxLiveBots && !configId) {
          console.log('[BotConfigForm] Live bot limit exceeded');
          toast.error(`Live bot limit reached: ${liveBotCount}/${maxLiveBots} on ${planName} plan. Upgrade to create more.`, { containerId: 'main-toast-container' });
          setIsLoading(false);
          return;
        }

        // Free plan can't do live trading
        if (planName === 'Free') {
          console.log('[BotConfigForm] Free plan cannot do live trading');
          toast.error('Free plan only supports paper trading. Upgrade to Pro or Elite for live trading.', { containerId: 'main-toast-container' });
          setIsLoading(false);
          return;
        }
      }

      console.log('[BotConfigForm] Preparing bot data for database');
      // Save to database
      const botData = {
        user_id: user.id,
        name: processedConfig.botName || processedConfig.strategy,
        config: processedConfig,
        is_active: false
      };

      console.log('[BotConfigForm] Bot data prepared:', {
        name: botData.name,
        strategy: processedConfig.strategy,
        exchange: processedConfig.exchange.name,
        dry_run: processedConfig.dry_run
      });

      // 🔧 FIXED: use .select().single() so we get a single payload back
      let response:
        | { data: any; error: any }
        | undefined;

      if (configId) {
        console.log('[BotConfigForm] Updating existing config:', configId);
        response = await supabase
          .from('bot_configurations')
          .update(botData)
          .eq('id', configId)
          .select()
          .single();
      } else {
        console.log('[BotConfigForm] Creating new config');
        response = await supabase
          .from('bot_configurations')
          .insert(botData)
          .select()
          .single();
      }

      console.log('[BotConfigForm] Database response:', response);

      if (!response || response.error) {
        const msg = response?.error?.message || 'Failed to save bot configuration';
        throw new Error(msg);
      }
      if (!response.data) {
        throw new Error('No data returned from database');
      }

      console.log('[BotConfigForm] Bot configuration saved successfully');
      toast.success(`Bot configuration ${configId ? 'updated' : 'created'} successfully`, { containerId: 'main-toast-container' });

      // 🚀 Auto-deploy bot after update if it was previously deployed
      if (configId && processedConfig.strategy) {
        try {
          console.log('[BotConfigForm] Checking if bot needs auto-deployment after update');

          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const strategyName = processedConfig.strategy;
            const deploymentUrl = `https://10xtraders.ai/apa/user/kubecheck/${user.id}/${strategyName}`;

            console.log('[BotConfigForm] Auto-deploying updated bot:', strategyName);
            toast.info('Redeploying bot with updated configuration...', { containerId: 'main-toast-container' });

            const deployResponse = await fetch(deploymentUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify(processedConfig),
            });

            if (!deployResponse.ok) {
              const errorText = await deployResponse.text();
              console.error('[BotConfigForm] Auto-deployment failed:', errorText);
              toast.warning('Configuration updated but auto-deployment failed. Please deploy manually.', { containerId: 'main-toast-container' });
            } else {
              console.log('[BotConfigForm] Auto-deployment successful');
              toast.success('Bot configuration updated and redeployed successfully!', { containerId: 'main-toast-container' });
            }
          }
        } catch (deployError) {
          console.error('[BotConfigForm] Error during auto-deployment:', deployError);
          toast.warning('Configuration updated but auto-deployment failed. Please deploy manually.', { containerId: 'main-toast-container' });
        }
      }

      if (onSave) {
        console.log('[BotConfigForm] Calling onSave callback');
        onSave();
        setIsLoading(false); // ✅ reset only if staying on the page
      } else {
        console.log('[BotConfigForm] Navigating to /bots');
        navigate('/bots');   // ✅ keep spinner active until redirect completes
      }
    } catch (error) {
      console.error('[BotConfigForm] Error in handleSubmit:', error);
      console.error('[BotConfigForm] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      toast.error(`Failed to save bot configuration: ${error instanceof Error ? error.message : String(error)}`, { containerId: 'main-toast-container' });
      setIsLoading(false); // ✅ reset on error
    }
  };

  const handleApiKeyConfirm = (apiKey: string, apiSecret: string) => {
    console.log('[BotConfigForm] API keys confirmed, updating config');
    setConfig(prev => ({
      ...prev,
      exchange: {
        ...prev.exchange,
        key: apiKey,
        secret: apiSecret
      }
    }));

    setShowApiKeyDialog(false);

    // ✅ Keep loading spinner active until DB + navigation completes
    setIsLoading(true);

    // Continue with form submission
    setTimeout(() => {
      console.log('[BotConfigForm] Continuing with form submission after API key confirmation');
      handleSubmit({ preventDefault: () => {} } as React.FormEvent);
    }, 100);
  };


  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg shadow-md overflow-hidden">
      <form onSubmit={handleSubmit} className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Strategy Selection */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
              Strategy Name
            </label>
            {loadingStrategies ? (
              <div className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textSecondary flex items-center gap-2">
                <div className="i-svg-spinners:90-ring-with-bg animate-spin text-sm" />
                Loading strategies...
              </div>
            ) : strategies.length > 0 ? (
              <select
                name="strategy"
                value={config.strategy}
                onChange={handleInputChange}
                className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
                required
              >
                {strategies.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {strategy}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full p-3 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md">
                <div className="text-bolt-elements-textSecondary text-center">
                  No strategies found
                </div>
                <button
                  type="button"
                  onClick={() => window.location.href = '/'}
                  className="w-full mt-2 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
                >
                  Generate Strategy
                </button>
              </div>
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
                 onChange={(e) => {
                   if (e.target.checked) {
                     console.log('Setting Paper Trading mode');
                     setConfig(prev => ({ ...prev, dry_run: true }));
                   }
                 }}
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
                 onChange={(e) => {
                   if (e.target.checked) {
                     console.log('Setting Live Trading mode');
                     setConfig(prev => ({ ...prev, dry_run: false }));
                   }
                 }}
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
              value={config.max_open_trades || 1}
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
              value={config.stoploss || -0.10}
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
          {selectedExchange && config.dry_run === false && (
            <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-bolt-elements-background-depth-3 rounded-lg">
              <div className="col-span-1 md:col-span-2">
                <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                  {selectedExchange.label} Credentials
                  <span className="ml-2 text-xs text-bolt-elements-textTertiary">
                    (Required for Live Trading only)
                  </span>
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
                    value={config.trailing_stop_positive || 0.005}
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
                    value={config.trailing_stop_positive_offset || 0.0051}
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
                  toast.warning(`Maximum ${maxSymbolsPerBot} trading pairs allowed on your plan`, { containerId: 'main-toast-container' });
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
                <>{configId ? 'Update Bot' : 'Create Bot'}</>
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
