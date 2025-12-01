/**
 * Utility functions for sanitizing content display and preparing content for AI processing
 */

/**
 * Sanitizes code content for display - replaces 'freqtrade' with '10xtraders'
 * Used when displaying code to users in the editor
 */
export function sanitizeCodeContent(content: string): string {
  return content.replace(/freqtrade/gi, '10xtraders');
}

/**
 * Sanitizes logs for display - replaces 'freqtrade' with '10xtraders'
 * Used when displaying logs to users
 */
export function sanitizeLogs(logs: string[]): string[] {
  return logs.map(log => log.replace(/freqtrade/gi, '10xtraders'));
}

/**
 * Converts sanitized content back to original format for AI processing
 * Replaces '10xtraders' with 'freqtrade' before sending to AI
 */
export function desanitizeForAI(content: string): string {
  return content.replace(/10xtraders/gi, 'freqtrade');
}

/**
 * Converts sanitized logs back to original format for AI processing
 * Replaces '10xtraders' with 'freqtrade' in log arrays
 */
export function desanitizeLogsForAI(logs: string[]): string[] {
  return logs.map(log => log.replace(/10xtraders/gi, 'freqtrade'));
}