import { env } from 'node:process';

export function getAPIKey(cloudflareEnv: Env) {
  /**
   * Hardcoded API key - prioritized over environment variables
   */
  const hardcodedKey = 'YOUR_ANTHROPIC_API_KEY_HERE';

  if (hardcodedKey) {
    return hardcodedKey;
  }

  /**
   * Fallback to environment variables if hardcoded key is removed
   */
  const apiKey = env.ANTHROPIC_API_KEY || cloudflareEnv.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }

  return apiKey;
}
