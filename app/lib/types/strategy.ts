// Type definitions for trading bot strategies

// API response structure from bot performance endpoint
// URL format: https://eu.10xtraders.ai/user/{{bot_id}}/api/v1/performance
export interface BotPerformanceData {
  profit_ratio: number;
  profit_pct: number;
  profit_abs: number;
  count: number;
  pair: string;    // Trading pair, e.g., "DOT/USDT"
  profit: number;
}

export interface StrategyMetrics {
  best_pair: string;           // Most profitable trading pair (e.g., "DOT/USDT")
  profit_pct: number;          // Profit percentage (e.g., 7.09 for 7.09%)
  isPlaceholder?: boolean;     // True if using placeholder data (before API fetch)
}

export interface StrategyCard {
  id: string;
  name: string;
  description: string;
  icon?: string;               // Iconify class name (e.g., 'i-ph:chart-line-up')
  bot_id?: string;             // Bot ID for live API endpoint
  metrics: StrategyMetrics;
  status?: 'running' | 'stopped' | 'deploying';
  user_count?: number;
  prompt?: string;             // Full prompt text to auto-fill in chat
}

