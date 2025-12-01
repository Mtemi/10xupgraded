import { makeApiRequest } from "./helpers.js";
import { subscribeOnStream, unsubscribeFromStream } from "./streaming.js";

const lastBarsCache = new Map();

const configurationData = {
  supported_resolutions: ["1", "5", "15", "30", "60", "240", "1D", "1W", "1M"],
  exchanges: [{ value: "Binance", name: "Binance", desc: "Binance" }],
  symbols_types: [{ name: "crypto", value: "crypto" }],
};

async function getAllSymbols() {
  const API_URLS = [
    "https://api.binance.com/api/v3/exchangeInfo",
    "https://api1.binance.com/api/v3/exchangeInfo",
    "https://api2.binance.com/api/v3/exchangeInfo",
  ];

  for (const url of API_URLS) {
    try {
      console.log(`[getAllSymbols] Trying URL: ${url}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      
      const data = await response.json();
      if (!data.symbols) throw new Error("Invalid response format");
      
      return data.symbols.map((s) => ({
        symbol: s.symbol,
        full_name: `Binance:${s.baseAsset}/${s.quoteAsset}`,
        description: `${s.baseAsset}/${s.quoteAsset}`,
        exchange: "Binance",
        type: "crypto",
      }));
    } catch (error) {
      console.warn(`[getAllSymbols] Failed with URL ${url}:`, error);
    }
  }
  console.error("[getAllSymbols]: All Binance endpoints failed.");
  return [];
}

export default {
  onReady: (callback) => {
    console.log("[onReady]: TradingView DataFeed Ready");
    setTimeout(() => callback(configurationData), 0);
  },

  resolveSymbol: async (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
    console.log("[resolveSymbol]: Resolving", symbolName);
    const symbols = await getAllSymbols();
    const symbolItem = symbols.find(({ full_name, symbol }) => full_name === symbolName || symbol === symbolName);

    if (!symbolItem) {
      console.error("[resolveSymbol]: Symbol not found", symbolName);
      onResolveErrorCallback("Symbol not found");
      return;
    }

    const symbolInfo = {
      ticker: symbolItem.symbol,
      name: symbolItem.symbol,
      description: symbolItem.description,
      type: symbolItem.type,
      session: "24x7",
      timezone: "Etc/UTC",
      exchange: symbolItem.exchange,
      minmov: 1,
      pricescale: 100,
      has_intraday: true,
      has_no_volume: false,
      has_weekly_and_monthly: false,
      supported_resolutions: configurationData.supported_resolutions,
      volume_precision: 8,
      data_status: "streaming",
    };
    onSymbolResolvedCallback(symbolInfo);
  },

  getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
    const { from, to, firstDataRequest } = periodParams;
    console.log("[getBars]: Fetching data for", symbolInfo.name, resolution);

    const binanceIntervalMap = {
      "1": "1m",
      "5": "5m",
      "15": "15m",
      "30": "30m",
      "60": "1h",
      "240": "4h",
      "1D": "1d",
      "1W": "1w",
      "1M": "1M",
    };
    const binanceInterval = binanceIntervalMap[resolution] || resolution;

    const url = `https://api.binance.com/api/v3/klines?symbol=${symbolInfo.name}&interval=${binanceInterval}&startTime=${
      from * 1000
    }&endTime=${to * 1000}&limit=1000`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data || data.length === 0) {
        console.warn("[getBars]: No data from Binance API.");
        onHistoryCallback([], { noData: true });
        return;
      }

      const bars = data.map((d) => ({
        time: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));

      if (firstDataRequest) {
        lastBarsCache.set(symbolInfo.ticker, bars[bars.length - 1]);
      }

      console.log(`[getBars]: Returning ${bars.length} bars`);
      onHistoryCallback(bars, { noData: false });
    } catch (error) {
      console.error("[getBars]: Fetch error", error);
      onErrorCallback(error);
    }
  },

  subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) => {
    console.log("[subscribeBars]: Subscribing to", symbolInfo.name);
    try {
      subscribeOnStream(
        symbolInfo,
        resolution,
        onRealtimeCallback,
        subscriberUID,
        onResetCacheNeededCallback,
        lastBarsCache.get(symbolInfo.ticker)
      );
    } catch (error) {
      console.error("[subscribeBars]: Subscription error", error);
    }
  },

  unsubscribeBars: (subscriberUID) => {
    console.log("[unsubscribeBars]: Unsubscribing", subscriberUID);
    unsubscribeFromStream(subscriberUID);
  },
};
