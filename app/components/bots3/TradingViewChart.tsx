import React, { useEffect, useRef } from "react";
import { supabase } from '~/lib/superbase/client';

// === Interval/Timeframe Mapping Helpers ===
const intervalToApiTimeframe = (interval: string): string => {
  // Maps TradingView widget intervals to your API's format
  if (interval === "1") return "1m";
  if (interval === "5") return "5m";
  if (interval === "15") return "15m";
  if (interval === "30") return "30m";
  if (interval === "60") return "1h";
  if (interval === "240") return "4h";
  if (interval === "D" || interval === "1D") return "1d";
  if (interval === "W" || interval === "1W") return "1w";
  if (interval === "M" || interval === "1M") return "1M";
  return interval;
};

const apiTimeframeToInterval = (tf: string): string => {
  // Maps API or config timeframes to TradingView widget intervals
  if (tf === "1m") return "1";
  if (tf === "5m") return "5";
  if (tf === "15m") return "15";
  if (tf === "30m") return "30";
  if (tf === "1h") return "60";
  if (tf === "4h") return "240";
  if (tf === "1d") return "D";
  if (tf === "1w") return "W";
  if (tf === "1M") return "M";
  return tf;
};

// === Trade Types ===
type Trade = {
  open_time: number; // ms or seconds, normalized below
  open_price: number;
  close_time?: number;
  close_price?: number;
  profit?: string | number;
  pair?: string;
};

type TradingViewChartProps = {
  strategyName: string;
  selectedPair: string;    // 'BTC/USDT'
  timeframe: string;       // '5m', '1h', etc. (from config, user, or dropdown)
  openTrades: Trade[];
  closedTrades: Trade[];
};

export function TradingViewChart({
  strategyName,
  selectedPair,
  timeframe,
  openTrades,
  closedTrades,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const tvWidgetRef = useRef<any>(null);
  const realtimeCbRef = useRef<((bar: any) => void) | null>(null);
  const scriptLoadedRef = useRef<boolean>(false);
  const currentTimeframeRef = useRef<string>(apiTimeframeToInterval(timeframe));
  const currentPairRef = useRef<string>(selectedPair);

  // ======== DEBUG LOGGING START ========
  // Log props and candle events
  useEffect(() => {
    console.log('[TradingViewChart] openTrades:', openTrades);
    console.log('[TradingViewChart] closedTrades:', closedTrades);
  }, [openTrades, closedTrades]);

  useEffect(() => {
    const candleListener = (e: any) => console.log('[TradingViewChart] new candle event:', e.detail);
    window.addEventListener('freqtrade:new_candle', candleListener);
    return () => window.removeEventListener('freqtrade:new_candle', candleListener);
  }, []);
  // ======== DEBUG LOGGING END =========

  // Util: Normalize for TradingView
  function getTradingViewSymbol(pair: string, exchange = "BINANCE") {
    return `${exchange}:${pair.replace("/", "").toUpperCase()}`;
  }

  // Combine trades for markers
  const allTrades = [...openTrades, ...closedTrades];

  // --- Datafeed implementation ---
  function createDatafeed(trades: Trade[]) {
    const supportedResolutions = ["1", "5", "15", "30", "60", "240", "D", "1W", "1M"];
    return {
      onReady: (cb: (meta: any) => void) => {
        setTimeout(() => cb({
          supports_search: false,
          supports_group_request: false,
          supported_resolutions: supportedResolutions,
          supports_marks: true,
          supports_timescale_marks: false,
          supports_time: true,
        }), 0);
      },
      searchSymbols: (_userInput: string, _exchange: string, _symbolType: string, onResult: any) => {
        onResult([]);
      },
      resolveSymbol: (symbolName: string, onResolve: any, onError: any) => {
        try {
          onResolve({
            name: symbolName,
            full_name: symbolName,
            ticker: symbolName,
            description: symbolName,
            type: "crypto",
            session: "24x7",
            timezone: "Etc/UTC",
            exchange: "BINANCE",
            minmov: 1,
            pricescale: 100000000,
            has_intraday: true,
            supported_resolutions: supportedResolutions,
            volume_precision: 8,
          });
        } catch (error) {
          onError("Symbol resolution error");
        }
      },
      getBars: async (
        symbolInfo: any, resolution: string, periodParams: any, onHistory: any, onError: any
      ) => {
        try {
          const { countBack } = periodParams;
          const apiTimeframe = intervalToApiTimeframe(resolution); // e.g. "5" => "5m"
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Authentication required");

          const url = `https://10xtraders.ai/user/${strategyName}/api/v1/pair_candles?pair=${selectedPair}&timeframe=${apiTimeframe}&limit=${countBack || 1000}`;
          const resp = await fetch(url, {
            headers: { 'Authorization': 'Basic ' + btoa(`meghan:${user.id}`) }
          });

          if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${errorText}`);
          }

          const text = await resp.text();
          if (!text || text.trim() === '') {
            onHistory([], { noData: true }); return;
          }

          let json;
          try { json = JSON.parse(text); } catch { onHistory([], { noData: true }); return; }
          if (!json.columns || !json.data || json.columns.length === 0 || json.data.length === 0) {
            onHistory([], { noData: true }); return;
          }
          const cols = json.columns;
          const iDate   = cols.indexOf('date');
          const iOpen   = cols.indexOf('open');
          const iHigh   = cols.indexOf('high');
          const iLow    = cols.indexOf('low');
          const iClose  = cols.indexOf('close');
          const iVolume = cols.indexOf('volume');
          if (iDate < 0 || iOpen < 0 || iHigh < 0 || iLow < 0 || iClose < 0) {
            throw new Error("Invalid data format");
          }

          const bars = json.data.map((row: any[]) => ({
            time: (row[11] && !isNaN(row[11])) ? Number(row[11]) : new Date(row[iDate]).getTime(),
            open: Number(row[iOpen]),
            high: Number(row[iHigh]),
            low: Number(row[iLow]),
            close: Number(row[iClose]),
            volume: iVolume >= 0 ? Number(row[iVolume]) : 0,
          }));

          onHistory(bars, { noData: bars.length === 0 });
        } catch (err) {
          onError(err);
          onHistory([], { noData: true });
        }
      },
      subscribeBars: (
        symbolInfo: any, resolution: string, onRealtimeCallback: (bar: any) => void, subscriberUID: string
      ) => {
        realtimeCbRef.current = onRealtimeCallback;
      },
      unsubscribeBars: (subscriberUID: string) => {
        realtimeCbRef.current = null;
      },
      getMarks: (
        symbolInfo: any, startTime: number, endTime: number, onDataCallback: (marks: any[]) => void, resolution: string
      ) => {
        const marks: any[] = [];
        let id = 1;
        for (const trade of trades) {
          if (trade.pair !== selectedPair) continue;
          const openTimeSec = Math.floor((trade.open_time > 1e12 ? trade.open_time / 1000 : trade.open_time));
          if (openTimeSec >= startTime && openTimeSec <= endTime) {
            marks.push({
              id: id++,
              time: openTimeSec,
              color: 'green',
              label: 'B',
              labelFontColor: '#fff',
              minSize: 8,
              text: [`Buy @ ${trade.open_price}`]
            });
          }
          if (trade.close_time) {
            const closeTimeSec = Math.floor((trade.close_time > 1e12 ? trade.close_time / 1000 : trade.close_time));
            if (closeTimeSec >= startTime && closeTimeSec <= endTime) {
              marks.push({
                id: id++,
                time: closeTimeSec,
                color: 'red',
                label: 'S',
                labelFontColor: '#fff',
                minSize: 8,
                text: [`Sell @ ${trade.close_price}`, trade.profit ? `P/L: ${trade.profit}` : '']
              });
            }
          }
        }
        onDataCallback(marks);
      }
    };
  }

  // --- Chart Drawing and Update Handlers ---
  const drawMarkers = () => {
    if (!tvWidgetRef.current) return;
    try {
      const chart = tvWidgetRef.current.activeChart();
      try { chart.removeAllShapes(); } catch {}
      openTrades.forEach((trade) => {
        if (trade.pair !== selectedPair) return;
        const time = typeof trade.open_time === 'number'
          ? (trade.open_time > 1e12 ? Math.floor(trade.open_time / 1000) : trade.open_time)
          : Math.floor(new Date(trade.open_time).getTime() / 1000);
        try {
          chart.createMultipointShape(
            [{ time, price: trade.open_price }],
            {
              shape: 'arrow_up',
              text: `Buy`,
              overrides: { backgroundColor: '#00FF00', textColor: '#FFFFFF', fontsize: 12, bold: true },
              disableSelection: true, disableSave: true, disableUndo: true,
            }
          );
        } catch {}
      });
      closedTrades.forEach((trade) => {
        if (trade.pair !== selectedPair || !trade.close_time) return;
        const openTime = typeof trade.open_time === 'number'
          ? (trade.open_time > 1e12 ? Math.floor(trade.open_time / 1000) : trade.open_time)
          : Math.floor(new Date(trade.open_time).getTime() / 1000);
        const closeTime = typeof trade.close_time === 'number'
          ? (trade.close_time > 1e12 ? Math.floor(trade.close_time / 1000) : trade.close_time)
          : Math.floor(new Date(trade.close_time).getTime() / 1000);
        try {
          chart.createMultipointShape(
            [{ time: openTime, price: trade.open_price }],
            {
              shape: 'arrow_up',
              text: `Buy`,
              overrides: { backgroundColor: '#00FF00', textColor: '#FFFFFF', fontsize: 12, bold: true },
              disableSelection: true, disableSave: true, disableUndo: true,
            }
          );
          chart.createMultipointShape(
            [{ time: closeTime, price: trade.close_price! }],
            {
              shape: 'arrow_down',
              text: `Sell`,
              overrides: {
                backgroundColor: typeof trade.profit === 'number'
                  ? (trade.profit > 0 ? '#00FF00' : '#FF0000')
                  : '#FF0000',
                textColor: '#FFFFFF', fontsize: 12, bold: true
              },
              disableSelection: true, disableSave: true, disableUndo: true,
            }
          );
        } catch {}
      });
    } catch {}
  };

  // --- TradingView Script Loading ---
  useEffect(() => {
    if (window.TradingView) {
      scriptLoadedRef.current = true;
      return;
    }
    const script = document.createElement('script');
    script.src = "/charting_library/charting_library.standalone.js";
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
      if (selectedPair && timeframe) {
        initTradingViewChart();
      }
    };
    document.head.appendChild(script);
    // Don't remove script on unmount (could be used by other charts)
  }, []);

  // --- Chart Init ---
  const initTradingViewChart = () => {
    if (!window.TradingView || !chartContainerRef.current) return;
    if (tvWidgetRef.current) {
      tvWidgetRef.current.remove();
      tvWidgetRef.current = null;
    }
    const tvInterval = apiTimeframeToInterval(timeframe); // e.g. "5m" -> "5"
    currentTimeframeRef.current = tvInterval;
    currentPairRef.current = selectedPair;

    const tvWidget = new window.TradingView.widget({
      symbol: getTradingViewSymbol(selectedPair, "BINANCE"),
      interval: tvInterval,
      container: chartContainerRef.current,
      library_path: "/charting_library/",
      locale: "en",
      theme: "Dark",
      autosize: true,
      datafeed: createDatafeed(allTrades),
      disabled_features: ["use_localstorage_for_settings", "header_symbol_search"],
      charts_storage_url: "https://saveload.tradingview.com",
      charts_storage_api_version: "1.1",
      client_id: "10xtraders.ai",
      user_id: "public_user_id",
      fullscreen: false,
      studies_overrides: {},
      overrides: {},
    });

    tvWidgetRef.current = tvWidget;

    tvWidget.onChartReady(() => {
      try {
        const chart = tvWidget.activeChart();
        chart.createStudy('Moving Average Exponential', false, true, { length: 20 });
        chart.createStudy('Relative Strength Index', false, false, { length: 14 });
        drawMarkers();
      } catch (error) {}
    });
  };

  // --- Re-initialize chart on prop changes ---
  useEffect(() => {
    if (!selectedPair || !timeframe) return;
    if (scriptLoadedRef.current) {
      initTradingViewChart();
    }
    return () => {
      if (tvWidgetRef.current) {
        tvWidgetRef.current.remove();
        tvWidgetRef.current = null;
      }
      realtimeCbRef.current = null;
    };
  }, [strategyName, selectedPair, timeframe, openTrades.length, closedTrades.length]);

  // --- Update chart when timeframe changes ---
  useEffect(() => {
    const tvInterval = apiTimeframeToInterval(timeframe);
    if (tvWidgetRef.current && currentTimeframeRef.current !== tvInterval) {
      tvWidgetRef.current.activeChart().setResolution(tvInterval, () => {
        currentTimeframeRef.current = tvInterval;
      });
    }
  }, [timeframe]);

  // --- Update chart when pair changes ---
  useEffect(() => {
    if (tvWidgetRef.current && currentPairRef.current !== selectedPair) {
      tvWidgetRef.current.activeChart().setSymbol(getTradingViewSymbol(selectedPair, "BINANCE"), () => {
        currentPairRef.current = selectedPair;
        drawMarkers();
      });
    }
  }, [selectedPair]);

  // --- WebSocket candle update ---
  useEffect(() => {
    const handleNewCandle = (event: CustomEvent) => {
      const data = event.detail;
      if (data.pair !== selectedPair || !realtimeCbRef.current) return;
      const bar = {
        time: new Date(data.candle.timestamp).getTime(),
        open: data.candle.open,
        high: data.candle.high,
        low: data.candle.low,
        close: data.candle.close,
        volume: data.candle.volume || 0
      };
      realtimeCbRef.current(bar);
      drawMarkers();
    };
    window.addEventListener('freqtrade:new_candle', handleNewCandle as EventListener);
    return () => window.removeEventListener('freqtrade:new_candle', handleNewCandle as EventListener);
  }, [selectedPair]);

  // --- Testing: Custom event dispatcher for live candle feed ---
  useEffect(() => {
    (window as any).dispatchTestCandle = (candle: any) => {
      const event = new CustomEvent('freqtrade:new_candle', {
        detail: { pair: selectedPair, candle }
      });
      window.dispatchEvent(event);
    };
    return () => { delete (window as any).dispatchTestCandle; };
  }, [selectedPair]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: "100%", height: "600px" }}
      className="tradingview-chart-container"
    />
  );
}
