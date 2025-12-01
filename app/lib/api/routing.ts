export const APA_DOMAIN = 'https://10xtraders.ai';

export function userApiDomainFromContext(contextOrExchange?: string) {
  // If you already know the cluster context string from deploy response, prefer that.
  // Otherwise default by exchange: "binance" -> EU, everything else -> US (your current convention).
  const v = (contextOrExchange || '').toLowerCase();
  if (v.includes('freqtrade-cluster-eu') || v === 'binance') return 'https://eu.10xtraders.ai';
  return 'https://10xtraders.ai';
}