// const BASE_URL = 'https://api.binance.com';
const BASE_URL = 'https://10xtraders.ai/proxy/binance';  // ✅ Using Nginx Proxy

// Binance API request
export async function makeApiRequest(path) {
  try {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url);
    return response.json();
  } catch (error) {
    throw new Error(`Binance request error: ${error.message}`);
  }
}

// Generate symbol format
export function generateSymbol(exchange, fromSymbol, toSymbol) {
  const short = `${fromSymbol}/${toSymbol}`;
  return {
    short,
    full: `${exchange}:${short}`,
  };
}

// Parse symbol into exchange and symbol pair
export function parseFullSymbol(fullSymbol) {
  const match = fullSymbol.match(/^(\w+):(\w+)\/(\w+)$/);
  if (!match) return null;

  return {
    exchange: match[1],
    fromSymbol: match[2],
    toSymbol: match[3],
  };
}
