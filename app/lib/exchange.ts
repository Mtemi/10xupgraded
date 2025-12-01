export type ExchangeType = 'CEX' | 'DEX';
export type MarketType = 'spot' | 'futures' | null;

// 1️⃣ CEX spot
export const CEX_SPOT = [
  { id: 'bitget',             label: 'Bitget',             creds: ['key','secret','password'] },
  { id: 'binance',            label: 'Binance',            creds: ['key','secret'] },
  { id: 'binanceus',          label: 'Binance US',         creds: ['key','secret'] },
  { id: 'bingx',              label: 'BingX',              creds: ['key','secret'] },
  { id: 'bybit',              label: 'Bybit',              creds: ['key','secret'] },
  { id: 'kraken',             label: 'Kraken',             creds: ['key','secret'] },
  { id: 'kucoin',             label: 'KuCoin',             creds: ['key','secret','password'] },
  { id: 'htx',                label: 'HTX (Huobi)',        creds: ['key','secret'] },
  { id: 'okx',                label: 'OKX (Global)',       creds: ['key','secret','password'] },
  { id: 'myokx',              label: 'MyOKX (EEA)',        creds: ['key','secret','password'] },
  { id: 'gateio',             label: 'Gate.io',            creds: ['key','secret'] },
  { id: 'bitmart',            label: 'BitMart',            creds: ['key','secret','uid'] },
];

// 2️⃣ CEX futures
export const CEX_FUTURES = [
  { id: 'bitget',             label: 'Bitget Futures',     creds: ['key','secret','password'], marginMode: 'isolated' },
  { id: 'binance',            label: 'Binance Futures',    creds: ['key','secret'],            marginMode: 'isolated' },
  { id: 'gateio',             label: 'Gate.io Futures',    creds: ['key','secret'],            marginMode: 'isolated' },
  { id: 'okx',                label: 'OKX Futures',        creds: ['key','secret','password'], marginMode: 'isolated' },
  { id: 'bybit',              label: 'Bybit Perpetual',    creds: ['key','secret'],            marginMode: 'isolated' },
];

// 3️⃣ DEX (only Hyperliquid)
export const DEX = [
  { id: 'hyperliquid',        label: 'Hyperliquid (DEX)',  creds: ['walletAddress','privateKey'] }
];