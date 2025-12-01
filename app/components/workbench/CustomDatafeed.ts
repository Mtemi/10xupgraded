export class CustomDatafeed {
  constructor(updateCallback) {
    this.updateCallback = updateCallback;
    this.subscribers = {};
  }

  // Fetch historical market data (e.g., from Binance)
  async getBars(symbol, resolution, from, to, onHistoryCallback, onErrorCallback) {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${this.mapResolution(resolution)}&startTime=${from * 1000}&endTime=${to * 1000}&limit=1000`
      );
      const data = await response.json();

      if (data.length === 0) {
        onHistoryCallback([], { noData: true });
        return;
      }

      const bars = data.map((bar) => ({
        time: bar[0], // Open time
        open: parseFloat(bar[1]),
        high: parseFloat(bar[2]),
        low: parseFloat(bar[3]),
        close: parseFloat(bar[4]),
        volume: parseFloat(bar[5]),
      }));

      onHistoryCallback(bars, { noData: false });
    } catch (error) {
      onErrorCallback(error);
    }
  }

  // Subscribe to real-time Binance WebSocket updates
  subscribeBars(symbol, resolution, onRealtimeCallback, subscribeUID) {
    if (this.subscribers[subscribeUID]) return;

    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_1m`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const kline = data.k;
      
      const bar = {
        time: kline.t, 
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
      };

      onRealtimeCallback(bar);
    };

    this.subscribers[subscribeUID] = ws;
  }

  // Unsubscribe from real-time updates
  unsubscribeBars(subscribeUID) {
    if (this.subscribers[subscribeUID]) {
      this.subscribers[subscribeUID].close();
      delete this.subscribers[subscribeUID];
    }
  }

  // Convert TradingView resolution to Binance intervals
  mapResolution(resolution) {
    const mapping = {
      "1": "1m",
      "5": "5m",
      "15": "15m",
      "30": "30m",
      "60": "1h",
      "240": "4h",
      "D": "1d",
    };
    return mapping[resolution] || "1m";
  }
}
