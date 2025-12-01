// src/lib/tradingview/BinanceDatafeed.ts

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SubscribeCallback {
  (bar: Bar): void;
}

export class BinanceDatafeed {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, SubscribeCallback>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  public onReady(callback: (configuration: any) => void): void {
    setTimeout(() => callback({
      supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
      exchanges: [{ value: 'Binance', name: 'Binance', desc: 'Binance' }],
      symbols_types: [{ name: 'crypto', value: 'crypto' }],
    }), 0);
  }

  public resolveSymbol(symbolName: string, onSymbolResolvedCallback: (symbolInfo: any) => void, onResolveErrorCallback: (reason: string) => void): void {
    const symbolInfo = {
      name: symbolName.toUpperCase(),
      description: symbolName,
      type: 'crypto',
      session: '24x7',
      timezone: 'Etc/UTC',
      ticker: symbolName.toUpperCase(),
      minmov: 1,
      pricescale: 100,
      has_intraday: true,
      intraday_multipliers: ['1', '5', '15', '30', '60', '240'],
      supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
      volume_precision: 8,
      data_status: 'streaming',
    };
    setTimeout(() => onSymbolResolvedCallback(symbolInfo), 0);
  }

  public async getBars(symbolInfo: any, resolution: string, periodParams: any, onHistoryCallback: (bars: Bar[], meta: any) => void, onErrorCallback: (error: string) => void): Promise<void> {
    try {
      const interval = this.getInterval(resolution);
      const symbol = symbolInfo.name.toUpperCase();
      const endTime = periodParams.to * 1000;
      const startTime = periodParams.from * 1000;

      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000&startTime=${startTime}&endTime=${endTime}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const bars = data.map((d: any[]) => ({
        time: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5])
      }));

      onHistoryCallback(bars, { noData: bars.length === 0 });
    } catch (error) {
      console.error('Error fetching historical data:', error);
      onErrorCallback('Failed to load historical data');
    }
  }

  public subscribeBars(symbolInfo: any, resolution: string, onRealtimeCallback: (bar: Bar) => void, subscriberUID: string, onResetCacheNeededCallback: () => void): void {
    if (this.ws) {
      this.ws.close();
    }

    this.subscribers.set(subscriberUID, onRealtimeCallback);

    const interval = this.getInterval(resolution);
    const symbol = symbolInfo.name.toLowerCase(); // Binance WebSocket requires lowercase symbols
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.e === 'kline') {
        const kline = data.k;
        const bar: Bar = {
          time: kline.t,
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c),
          volume: parseFloat(kline.v)
        };

        this.subscribers.forEach(callback => callback(bar));
      }
    };

    this.ws.onclose = () => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.warn(`WebSocket closed, reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
        setTimeout(() => this.subscribeBars(symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback), 5000);
      } else {
        console.error('Max WebSocket reconnection attempts reached.');
      }
    };
  }

  public unsubscribeBars(subscriberUID: string): void {
    this.subscribers.delete(subscriberUID);
    if (this.subscribers.size === 0 && this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private getInterval(resolution: string): string {
    const resolutionsMap: { [key: string]: string } = {
      '1': '1m',
      '5': '5m',
      '15': '15m',
      '30': '30m',
      '60': '1h',
      '240': '4h',
      '1D': '1d',
      '1W': '1w',
      '1M': '1M',
    };
    return resolutionsMap[resolution] || '15m';
  }
}
