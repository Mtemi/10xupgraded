export function detectApiKeyVariables(content: string): boolean {
  // Common patterns for API key variables in Python scripts
  const patterns = [
    // Match both assigned and unassigned variables
    /(?:BINANCE_API_KEY|API_KEY)\s*=\s*(?:["'].*["']|None|''|""|\{.*\}|\[.*\]|\(.*\))?/i,
    /(?:BINANCE_API_SECRET|API_SECRET|SECRET_KEY)\s*=\s*(?:["'].*["']|None|''|""|\{.*\}|\[.*\]|\(.*\))?/i,
    // Match commented variables too
    /^#.*(?:BINANCE_API_KEY|API_KEY|BINANCE_API_SECRET|API_SECRET|SECRET_KEY)\s*=/im,
    // Match environment variable references
    /os\.(?:getenv|environ\.get)\s*\(\s*["'](BINANCE_API_KEY|API_KEY|BINANCE_API_SECRET|API_SECRET|SECRET_KEY)["']/i
  ];

  return patterns.some(pattern => pattern.test(content));
}
