// datafeed.js
import { makeApiRequest, parseFullSymbol } from './helpers.js';
import { subscribeOnStream, unsubscribeFromStream } from './streaming.js';

const lastBarsCache = new Map();

const configurationData = {
  supports_search: true,
  supports_group_request: false,
  supports_marks: true,
  supports_timescale_marks: true,
  supports_time: true,
  supported_resolutions: ['1', '5', '15', '30', '60', '120', '240', '1D', '1W', '1M'],
  exchanges: [{ value: 'Binance', name: 'Binance', desc: 'Binance' }],
  symbols_types: [{ name: 'crypto', value: 'crypto' }],
};

async function getAllSymbols() {
  const data = await makeApiRequest('/api/v3/exchangeInfo');
//   console.log('[getAllSymbols] response:', data);
  return data.symbols.map((symbol) => ({
    symbol: symbol.symbol, 
    full_name: `Binance:${symbol.symbol}`,
    description: `${symbol.baseAsset}/${symbol.quoteAsset}`,
    exchange: 'Binance',
    type: 'crypto',
  }));
}

export default {
  onReady: (callback) => {
    console.log('[onReady] Method called');
    setTimeout(() => callback(configurationData));
  },

  searchSymbols: async (userInput, exchange, symbolType, onResultReadyCallback) => {
    console.log('[searchSymbols] Called with input:', userInput);
    const symbols = await getAllSymbols();

    const newSymbols = symbols.filter(symbol => symbol.full_name.toLowerCase().includes(userInput.toLowerCase()));
    onResultReadyCallback(newSymbols);
  },

  resolveSymbol: async (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
    console.log('[resolveSymbol] Resolving:', symbolName);
    const symbols = await getAllSymbols();
	console.log('[getAllSymbols]:', symbols);

    const formattedSymbolName = symbolName.replace('Binance:', '').replace('/', '');
    const symbolItem = symbols.find(({ symbol }) => symbol.toUpperCase() === formattedSymbolName.toUpperCase());;

    if (!symbolItem) {
      console.log('[resolveSymbol] Cannot resolve:', symbolName);
      onResolveErrorCallback('unknown_symbol');
      return;
    }

    const symbolInfo = {
      ticker: symbolItem.full_name,
      name: symbolItem.symbol,
      description: symbolItem.description,
      type: symbolItem.type,
      session: '24x7',
      timezone: 'Etc/UTC',
      exchange: symbolItem.exchange,
      minmov: 1,
      pricescale: 100,
      has_intraday: true,
      visible_plots_set: 'ohlc',
      supported_resolutions: configurationData.supported_resolutions,
      volume_precision: 2,
      data_status: 'streaming',
    };
    console.log('[resolveSymbol] Resolved symbol info:', symbolInfo);
    onSymbolResolvedCallback(symbolInfo);
  },

  getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
    const { from, to, firstDataRequest } = periodParams;
    console.log('[getBars] Requesting bars for:', symbolInfo.full_name, 'Resolution:', resolution);
    const intervalMap = {
      '1': '1m', '5': '5m', '15': '15m', '30': '30m',
      '60': '1h', '120': '2h', '240': '4h', '1D': '1d', '1W': '1w', '1M': '1M'
    };
    const interval = intervalMap[resolution] || '1d';
    const symbolWithoutSlash = symbolInfo.ticker.replace('Binance:', '').replace('/', '');
    const query = `symbol=${symbolWithoutSlash}&interval=${interval}&startTime=${from * 1000}&endTime=${to * 1000}&limit=1000`;

    try {
      const data = await makeApiRequest(`/api/v3/klines?${query}`);
      console.log('[getBars] response:', data);

      if (!data.length) {
        console.log('[getBars] No bars found');
        onHistoryCallback([], { noData: true });
        return;
      }

      const bars = data.map(bar => ({
        time: bar[0],
        open: parseFloat(bar[1]),
        high: parseFloat(bar[2]),
        low: parseFloat(bar[3]),
        close: parseFloat(bar[4]),
      }));
      console.log('[getBars] Parsed bars:', bars);

      if (firstDataRequest) {
        lastBarsCache.set(symbolInfo.full_name, bars[bars.length - 1]);
      }

      onHistoryCallback(bars, { noData: false });
    } catch (error) {
      console.error('[getBars] Error fetching bars:', error);
      onErrorCallback(error);
    }
  },


  subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) => {
    console.log('[subscribeBars] Subscribing to:', symbolInfo.full_name);
    subscribeOnStream(
      symbolInfo,
      resolution,
      onRealtimeCallback,
      subscriberUID,
      onResetCacheNeededCallback,
      lastBarsCache.get(symbolInfo.full_name)
    );
  },

  unsubscribeBars: (subscriberUID) => {
    console.log('[unsubscribeBars] Unsubscribing:', subscriberUID);
    unsubscribeFromStream(subscriberUID);
  },
};
