// API helper for fetching bot performance data
import type { BotPerformanceData, StrategyMetrics } from '~/lib/types/strategy';

const API_BASE_URL = 'https://eu.10xtraders.ai/user';

/**
 * Fetches performance data for a specific bot
 * @param botId - The unique identifier for the bot
 * @returns Promise with array of performance data for all pairs
 */
export async function fetchBotPerformance(botId: string): Promise<BotPerformanceData[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/${botId}/api/v1/performance`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch bot performance: ${response.status} ${response.statusText}`);
    }
    
    const data: BotPerformanceData[] = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching performance for bot ${botId}:`, error);
    throw error;
  }
}

/**
 * Gets the best performing pair from the performance data
 * @param performanceData - Array of performance data for all pairs
 * @returns The pair with the highest profit_pct
 */
export function getBestPerformingPair(performanceData: BotPerformanceData[]): BotPerformanceData | null {
  if (!performanceData || performanceData.length === 0) {
    return null;
  }
  
  // Sort by profit_pct descending and return the top performer
  const sorted = [...performanceData].sort((a, b) => b.profit_pct - a.profit_pct);
  return sorted[0];
}

/**
 * Converts bot performance data to strategy metrics format
 * @param bestPair - The best performing pair data
 * @returns Strategy metrics object
 */
export function convertToStrategyMetrics(bestPair: BotPerformanceData | null): StrategyMetrics {
  if (!bestPair) {
    return {
      best_pair: 'N/A',
      profit_pct: 0,
      isPlaceholder: true,
    };
  }
  
  return {
    best_pair: bestPair.pair,
    profit_pct: bestPair.profit_pct,
    isPlaceholder: false,
  };
}

/**
 * Fetches and processes bot performance to get strategy metrics
 * @param botId - The unique identifier for the bot
 * @returns Strategy metrics for the best performing pair
 */
export async function fetchStrategyMetrics(botId: string): Promise<StrategyMetrics> {
  try {
    const performanceData = await fetchBotPerformance(botId);
    const bestPair = getBestPerformingPair(performanceData);
    return convertToStrategyMetrics(bestPair);
  } catch (error) {
    console.error(`Error processing strategy metrics for bot ${botId}:`, error);
    return {
      best_pair: 'Error',
      profit_pct: 0,
      isPlaceholder: true,
    };
  }
}

