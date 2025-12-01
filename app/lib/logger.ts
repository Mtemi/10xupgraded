// Custom logger to filter out noisy WebContainer messages
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

// Filter out noisy messages in development
const noisyPatterns = [
  /WebContainer.*booting/i,
  /Module.*has been externalized/i,
  /legacy-js-api.*deprecated/i,
  /failed to load icon/i,
];

function shouldFilter(message: string): boolean {
  if (import.meta.env.PROD) return false; // Don't filter in production
  return noisyPatterns.some(pattern => pattern.test(message));
}

// Override console methods to filter noisy messages
console.log = (...args: any[]) => {
  const message = args.join(' ');
  if (!shouldFilter(message)) {
    originalConsoleLog(...args);
  }
};

console.warn = (...args: any[]) => {
  const message = args.join(' ');
  if (!shouldFilter(message)) {
    originalConsoleWarn(...args);
  }
};

console.info = (...args: any[]) => {
  const message = args.join(' ');
  if (!shouldFilter(message)) {
    originalConsoleInfo(...args);
  }
};

export { originalConsoleLog, originalConsoleWarn, originalConsoleInfo };
