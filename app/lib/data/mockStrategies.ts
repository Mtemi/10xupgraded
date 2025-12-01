import type { StrategyCard } from '~/lib/types/strategy';

// Live Trading Bot Strategy Cards - Ordered from Simple to Complex
// These display real-time performance data from deployed bots
// API endpoint format: https://eu.10xtraders.ai/user/{{bot_id}}/api/v1/performance
export const mockStrategies: StrategyCard[] = [
  {
    id: 'smart-dca-v1',
    name: 'DCA System',
    description: 'Scales into positions using structure-based accumulation rules.',
    icon: 'i-ph:chart-line-up',
    bot_id: 'PLACEHOLDER_BOT_ID_1', // Replace with actual bot_id
    metrics: {
      best_pair: 'DOT/USDT',
      profit_pct: 7.09,
      isPlaceholder: true, // Will be updated with live data
    },
    status: 'running',
    user_count: 2847,
    prompt: `Create a DCA System trading strategy that scales into positions using structure-based accumulation rules.

The strategy should:
- Implement dollar-cost averaging with structure-based entry rules
- Scale into positions at key support levels and accumulation zones
- Use dynamic position sizing based on market structure
- Include risk management with stop-loss and take-profit levels
- Support multiple trading pairs and timeframes (5m-1h)
- Output a Freqtrade-ready strategy with DCA logic, ROI table, and position management.`,
  },
  {
    id: 'adaptive-grid-v1',
    name: 'Grid System',
    description: 'Runs a controlled buy/sell framework within confirmed price ranges.',
    icon: 'i-ph:grid-four',
    bot_id: 'PLACEHOLDER_BOT_ID_2', // Replace with actual bot_id
    metrics: {
      best_pair: 'AVAX/USDT',
      profit_pct: 5.27,
      isPlaceholder: true,
    },
    status: 'running',
    user_count: 1923,
    prompt: `Create a Grid System trading strategy that runs a controlled buy/sell framework within confirmed price ranges.

The strategy should:
- Implement automated grid trading within confirmed price ranges
- Place buy and sell orders at optimal intervals based on range analysis
- Use range detection to identify suitable trading zones
- Include profit-taking and position management logic
- Handle range breakouts and trend changes
- Support multiple trading pairs and timeframes (5m-1h)
- Output a Freqtrade-ready strategy with grid parameters and range detection.`,
  },
  {
    id: 'trend-follower-v1',
    name: 'Trend System',
    description: 'Enters continuation moves only in clearly structured trends.',
    icon: 'i-ph:arrows-clockwise',
    bot_id: 'PLACEHOLDER_BOT_ID_4', // Replace with actual bot_id
    metrics: {
      best_pair: 'NEAR/USDT',
      profit_pct: 4.10,
      isPlaceholder: true,
    },
    status: 'running',
    user_count: 1432,
    prompt: `Create a Trend System trading strategy that enters continuation moves only in clearly structured trends.

The strategy should:
- Identify clearly structured trends using multiple indicators
- Enter positions only on trend continuation setups
- Use trend strength filters to avoid choppy markets
- Include pullback entry logic within strong trends
- Exit when trend structure breaks or reverses
- Support multiple trading pairs and timeframes (15m-4h)
- Output a Freqtrade-ready strategy with trend detection and continuation logic.`,
  },
  {
    id: 'breakout-hunter-v1',
    name: 'Breakout System',
    description: 'Activates on structurally validated moves out of consolidation.',
    icon: 'i-ph:trend-up',
    bot_id: 'PLACEHOLDER_BOT_ID_3', // Replace with actual bot_id
    metrics: {
      best_pair: 'SAND/USDT',
      profit_pct: 5.13,
      isPlaceholder: true,
    },
    status: 'running',
    user_count: 1654,
    prompt: `Create a Breakout System trading strategy that activates on structurally validated moves out of consolidation.

The strategy should:
- Detect consolidation patterns and structural breakout levels
- Validate breakouts using volume and price action confirmation
- Enter positions on structurally validated breakout moves
- Use tight stop-loss management below breakout levels
- Include false breakout filters and confirmation logic
- Support various trading pairs and timeframes (5m-1h)
- Output a Freqtrade-ready strategy with breakout detection and validation.`,
  },
  {
    id: 'volatility-compression-v1',
    name: 'Squeeze System',
    description: 'Engages when volatility shifts from compression to expansion.',
    icon: 'i-ph:waveform',
    bot_id: 'PLACEHOLDER_BOT_ID_6', // Replace with actual bot_id
    metrics: {
      best_pair: 'ALGO/USDT',
      profit_pct: 3.35,
      isPlaceholder: true,
    },
    status: 'running',
    user_count: 967,
    prompt: `Create a Squeeze System trading strategy that engages when volatility shifts from compression to expansion.

The strategy should:
- Monitor volatility compression periods using Bollinger Bands and ATR
- Detect the shift from compression to expansion phases
- Enter positions when volatility begins expanding from squeeze conditions
- Use volatility-based position sizing and risk management
- Include filters to avoid false expansion signals
- Support multiple trading pairs and timeframes (5m-1h)
- Output a Freqtrade-ready strategy with volatility analysis and squeeze detection.`,
  },
  {
    id: 'wyckoff-v1',
    name: 'Wyckoff System',
    description: 'Identifies accumulation/distribution shifts to enter structural reversals.',
    icon: 'i-ph:chart-line-up',
    bot_id: 'PLACEHOLDER_BOT_ID_5', // Replace with actual bot_id
    metrics: {
      best_pair: 'AAVE/USDT',
      profit_pct: 3.50,
      isPlaceholder: true,
    },
    status: 'running',
    user_count: 1089,
    prompt: `Create a Wyckoff System trading strategy that identifies accumulation/distribution shifts to enter structural reversals.

The strategy should:
- Implement Wyckoff methodology to identify accumulation/distribution phases
- Detect structural shifts in market behavior and smart money activity
- Identify key support/resistance levels where institutions accumulate
- Use volume analysis to confirm accumulation/distribution phases
- Enter positions when accumulation completes and markup begins
- Exit when distribution signals appear or structure breaks
- Support multiple trading pairs and timeframes (1h-4h)
- Output a Freqtrade-ready strategy with Wyckoff phase detection and reversal signals.`,
  },
];

