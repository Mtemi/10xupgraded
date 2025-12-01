// src/components/bots/TradingViewChart.tsx
import React, { useEffect, useRef } from "react";
import { supabase } from '~/lib/superbase/client';

// === Interval/Timeframe Mapping Helpers ===
const intervalToApiTimeframe = (interval: string): string => {
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

// timeframe -> ms (preserves monthly 'M')
const timeframeToMs = (tf: string): number => {
  const m = tf.match(/^(\d+)([mhdwM])$/);
  if (m) {
    const n = Number(m[1]);
    const u = m[2];
    if (u === 'm') return n * 60 * 1000;
    if (u === 'h') return n * 60 * 60 * 1000;
    if (u === 'd') return n * 24 * 60 * 60 * 1000;
    if (u === 'w') return n * 7 * 24 * 60 * 60 * 1000;
    if (u === 'M') return n * 30 * 24 * 60 * 60 * 1000; // rough month
  }
  if (tf === 'D' || tf === '1D') return 24 * 60 * 60 * 1000;
  if (tf === 'W' || tf === '1W') return 7 * 24 * 60 * 60 * 1000;
  if (tf === '1M' || tf === 'M') return 30 * 24 * 60 * 60 * 1000;
  return 5 * 60 * 1000; // default
};

// === Trade Types ===
type Trade = {
  open_time: number;
  open_price: number;
  close_time?: number;
  close_price?: number;
  profit?: string | number;
  pair?: string;
};

type TradingViewChartProps = {
  strategyName: string;
  selectedPair: string;    // 'BTC/USDT'
  timeframe: string;       // '5m', '1h', etc.
  openTrades: Trade[];
  closedTrades: Trade[];
  exchangeName?: string;   // e.g. "binance"
};

export function TradingViewChart({
  strategyName,
  selectedPair,
  timeframe,
  openTrades,
  closedTrades,
  exchangeName,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const tvWidgetRef = useRef<any>(null);
  const realtimeCbRef = useRef<((bar: any) => void) | null>(null);
  const scriptLoadedRef = useRef<boolean>(false);
  const currentTimeframeRef = useRef<string>(apiTimeframeToInterval(timeframe));
  const currentPairRef = useRef<string>(selectedPair);

  // realtime helpers
  const tfMsRef = useRef<number>(timeframeToMs(timeframe));
  const lastRealtimeBarRef = useRef<any | null>(null);

  const apiBase =
    (exchangeName || "").toLowerCase() === "binance"
      ? "https://eu.10xtraders.ai"
      : "https://10xtraders.ai";

  // ======== DEBUG LOGGING START ========
  useEffect(() => {
    console.log('[TradingViewChart] openTrades:', openTrades);
    console.log('[TradingViewChart] closedTrades:', closedTrades);
  }, [openTrades, closedTrades]);

  useEffect(() => {
    const candleListener = (e: any) =>
      console.log('[TradingViewChart] new candle event:', e.detail);
    window.addEventListener('freqtrade:new_candle', candleListener);
    return () => window.removeEventListener('freqtrade:new_candle', candleListener);
  }, []);
  // ======== DEBUG LOGGING END =========

  function getTradingViewSymbol(pair: string, exchange = "BINANCE") {
    return `${exchange}:${pair.replace("/", "").toUpperCase()}`;
  }

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
          setTimeout(() => {
            onResolve({
              name: symbolName,
              full_name: symbolName,
              ticker: symbolName,
              description: symbolName,
              type: "crypto",
              session: "24x7",
              timezone: "Etc/UTC",
              exchange: "BINANCE",
              format: "price",
              has_intraday: true,
              has_no_volume: false,         // <- tell TV we DO have volume
              supported_resolutions: supportedResolutions,
              volume_precision: 8,
              pricescale: 100000,           // saner default; fine to tweak
              data_status: "streaming",
              minmov: 1,
            });
          }, 0);
        } catch (error) {
          setTimeout(() => onError("Symbol resolution error"), 0);
        }
      },

      // Help TV know "now" (improves study readiness)
      getServerTime: (cb: (unixTimeSec: number) => void) => {
        cb(Math.floor(Date.now() / 1000));
      },

      getBars: async (_symbolInfo: any, resolution: string, periodParams: any, onHistory: any, _onError: any) => {
        try {
          const { from, to, countBack } = periodParams; // from/to are in SECONDS
          const apiTimeframe = intervalToApiTimeframe(resolution);
          const tfMs = timeframeToMs(apiTimeframe);
          const wantFromMs = (from ? from * 1000 : 0);
          const wantToMs = (to ? to * 1000 : Date.now());

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            onHistory([], { noData: true });
            return;
          }

          // How many bars would cover requested range (+buffer for studies)
          const estBars = Math.max(
            countBack || 0,
            Math.ceil((wantToMs - wantFromMs) / Math.max(tfMs, 1)) + 200
          );

          // Fetch a generous batch then FILTER to the requested range
          const limit = Math.min(Math.max(estBars, 1000), 5000);
          const url = `${apiBase}/user/${strategyName}/api/v1/pair_candles?pair=${encodeURIComponent(selectedPair)}&timeframe=${encodeURIComponent(apiTimeframe)}&limit=${limit}`;
          const resp = await fetch(url, {
            headers: { 'Authorization': 'Basic ' + btoa(`meghan:${user.id}`) }
          });

          if (!resp.ok) {
            console.error('[TradingViewChart] getBars HTTP', resp.status);
            onHistory([], { noData: true });
            return;
          }

          const text = await resp.text();
          if (!text || text.trim() === '') {
            onHistory([], { noData: true }); return;
          }

          let json: any;
          try { json = JSON.parse(text); } catch { onHistory([], { noData: true }); return; }
          if (!json.columns || !json.data || !json.data.length) {
            onHistory([], { noData: true }); return;
          }

          const cols: string[] = json.columns;
          const iDate   = cols.indexOf('date');
          const iOpen   = cols.indexOf('open');
          const iHigh   = cols.indexOf('high');
          const iLow    = cols.indexOf('low');
          const iClose  = cols.indexOf('close');
          const iVolume = cols.indexOf('volume');
          if (iDate < 0 || iOpen < 0 || iHigh < 0 || iLow < 0 || iClose < 0) {
            onHistory([], { noData: true }); return;
          }

          // Map -> bars (ms), sort ASC, filter to range [from, to)
          const mapped = (json.data as any[]).map((row: any[]) => ({
            time: (row[11] && !isNaN(row[11])) ? Number(row[11]) : new Date(row[iDate]).getTime(),
            open: Number(row[iOpen]),
            high: Number(row[iHigh]),
            low:  Number(row[iLow]),
            close: Number(row[iClose]),
            volume: iVolume >= 0 ? Number(row[iVolume]) : 0,
          }));

          mapped.sort((a, b) => a.time - b.time);

          const inRange = (from && to)
            ? mapped.filter(b => b.time >= wantFromMs && b.time < wantToMs)
            : mapped;

          onHistory(inRange, { noData: inRange.length === 0 });
        } catch (err) {
          console.error('[TradingViewChart] getBars error:', err);
          onHistory([], { noData: true });
        }
      },

      subscribeBars: (_symbolInfo: any, _resolution: string, onRealtimeCallback: (bar: any) => void, _subscriberUID: string) => {
        realtimeCbRef.current = onRealtimeCallback;
        lastRealtimeBarRef.current = null;
      },

      unsubscribeBars: (_subscriberUID: string) => {
        realtimeCbRef.current = null;
        lastRealtimeBarRef.current = null;
      },

      getMarks: (_symbolInfo: any, startTime: number, endTime: number, onDataCallback: (marks: any[]) => void) => {
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
                text: [`Sell @ ${trade.close_price}`, trade.profit ? `P/L: ${trade.profit}` : '`' ]
              });
            }
          }
        }
        onDataCallback(marks);
      }
    };
  }

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
  }, []);

  // --- Chart Init ---
  const initTradingViewChart = () => {
    if (!window.TradingView || !chartContainerRef.current) return;
    if (tvWidgetRef.current) {
      tvWidgetRef.current.remove();
      tvWidgetRef.current = null;
    }
    const tvInterval = apiTimeframeToInterval(timeframe);
    currentTimeframeRef.current = tvInterval;
    currentPairRef.current = selectedPair;
    tfMsRef.current = timeframeToMs(timeframe);
    lastRealtimeBarRef.current = null;

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
        chart.createStudy('Volume', false, true); // <- ensure Volume draws
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
      lastRealtimeBarRef.current = null;
    };
  }, [strategyName, selectedPair, timeframe, openTrades.length, closedTrades.length]);

  // --- Update chart when timeframe changes ---
  useEffect(() => {
    const tvInterval = apiTimeframeToInterval(timeframe);
    tfMsRef.current = timeframeToMs(timeframe);
    if (tvWidgetRef.current && currentTimeframeRef.current !== tvInterval) {
      tvWidgetRef.current.activeChart().setResolution(tvInterval, () => {
        currentTimeframeRef.current = tvInterval;
        lastRealtimeBarRef.current = null;
      });
    }
  }, [timeframe]);

  // --- Update chart when pair changes ---
  useEffect(() => {
    if (tvWidgetRef.current && currentPairRef.current !== selectedPair) {
      tvWidgetRef.current.activeChart().setSymbol(getTradingViewSymbol(selectedPair, "BINANCE"), () => {
        currentPairRef.current = selectedPair;
        lastRealtimeBarRef.current = null;
        drawMarkers();
      });
    }
  }, [selectedPair]);

  // --- WebSocket (LIVE) bridge (unchanged logic) ---
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let keepAliveTimer: number | null = null;
    let backoffMs = 1000;
    let destroyed = false;

    const normalizePair = (p: string | undefined | null) =>
      String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    const safeSend = (socket: WebSocket | null, data: any) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      try { socket.send(typeof data === 'string' ? data : JSON.stringify(data)); return true; }
      catch { return false; }
    };

    const buildWsUrl = async (): Promise<string | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return null;
      const u = new URL(apiBase);
      u.protocol = (u.protocol === 'https:') ? 'wss:' : 'ws:';
      u.pathname = `/user/${encodeURIComponent(strategyName)}/api/v1/message/ws`;
      u.search = `?token=${encodeURIComponent(user.id)}`;
      return u.toString();
    };

    const sendSubscribe = () => {
      if (!ws) return;
      const ok = safeSend(ws, { type: 'subscribe', data: ['analyzed_df'] });
      if (ok) console.log('[TradingViewChart] WS subscribe sent:', ['analyzed_df'], 'pair:', selectedPair || '(none yet)', 'tf:', timeframe);
      else console.warn('[TradingViewChart] WS subscribe skipped (socket not open)');
    };

    const scheduleReconnect = () => {
      if (destroyed) return;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        backoffMs = Math.min(backoffMs * 2, 30000);
        connect();
      }, backoffMs);
    };

    const startKeepAlive = () => {
      if (keepAliveTimer) window.clearTimeout(keepAliveTimer);
      keepAliveTimer = window.setInterval(() => {
        safeSend(ws, { type: 'ping', t: Date.now() });
      }, 25000);
    };

    const stopKeepAlive = () => {
      if (keepAliveTimer) window.clearTimeout(keepAliveTimer);
      keepAliveTimer = null;
    };

    const connect = async () => {
      const wsUrl = await buildWsUrl();
      if (!wsUrl) {
        console.warn('[TradingViewChart] WS disabled (no user id)');
        return;
      }

      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        console.error('[TradingViewChart] WS constructor error:', e);
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        console.log('[TradingViewChart] WS connected:', wsUrl);
        backoffMs = 1000;
        sendSubscribe();
        startKeepAlive();
      };

      ws.onmessage = (evt) => {
        try {
          console.log('[WS RX raw]', typeof evt.data === 'string' ? (evt.data as string).slice(0, 500) : evt.data);
        } catch {}
        try {
          const msg = JSON.parse(evt.data as string);
          console.log('[WS RX parsed]', msg);

          const payload = msg?.data ?? msg;
          if (msg?.type && msg.type !== 'analyzed_df') return;

          const key = payload?.key ?? msg?.key;
          if (Array.isArray(key)) {
            const [msgPair, msgTf] = key;
            const wanted = normalizePair(selectedPair);
            if (msgPair && normalizePair(String(msgPair)) !== wanted) return;
            if (msgTf && String(msgTf) !== String(timeframe)) return;
          } else {
            const pairRaw: string | undefined = payload?.pair || msg?.pair;
            if (pairRaw && normalizePair(pairRaw) !== normalizePair(selectedPair)) return;
          }

          let candle = payload?.candle;

          const df = payload?.df;
          if (!candle && df?.__type__ === 'dataframe' && typeof df.__value__ === 'string') {
            try {
              console.log('[WS RX df.__value__ preview]', df.__value__.slice(0, 300));
              const obj = JSON.parse(df.__value__);
              const cols: string[] = obj?.columns || [];
              const last = Array.isArray(obj?.data) ? obj.data[obj.data.length - 1] : null;
              if (last && cols.length) {
                const iDate = cols.indexOf('date');
                const iO = cols.indexOf('open');
                const iH = cols.indexOf('high');
                const iL = cols.indexOf('low');
                const iC = cols.indexOf('close');
                const iV = cols.indexOf('volume');
                if (iDate>=0 && iO>=0 && iH>=0 && iL>=0 && iC>=0) {
                  const ts = Number(last[iDate]);
                  const tsMs = ts > 1e12 ? ts : ts * 1000;
                  candle = {
                    timestamp: tsMs,
                    open:  Number(last[iO]),
                    high:  Number(last[iH]),
                    low:   Number(last[iL]),
                    close: Number(last[iC]),
                    volume: iV >= 0 ? Number(last[iV]) : 0
                  };
                }
              }
            } catch (err) {
              console.warn('[WS RX] df.__value__ parse error', err);
            }
          }

          if (!candle && Array.isArray(payload?.columns) && Array.isArray(payload?.data) && payload.data.length) {
            const cols: string[] = payload.columns;
            const last = payload.data[payload.data.length - 1];
            const idx = (n: string) => cols.indexOf(n);
            const iDate = idx('date'), iO = idx('open'), iH = idx('high'), iL = idx('low'), iC = idx('close'), iV = idx('volume');
            const ts = Number(last?.[iDate] ?? last?.[11]);
            const tsMs = ts > 1e12 ? ts : ts * 1000;

            candle = {
              timestamp: tsMs,
              open: Number(last?.[iO]),
              high: Number(last?.[iH]),
              low:  Number(last?.[iL]),
              close: Number(last?.[iC]),
              volume: (iV >= 0) ? Number(last?.[iV]) : 0
            };
          }

          if (!candle && payload?.kline) {
            const k = payload.kline;
            const ts = Number(k.t ?? k.start_time ?? k.ts ?? k.timestamp);
            const tsMs = ts > 1e12 ? ts : ts * 1000;
            candle = {
              timestamp: tsMs,
              open: Number(k.o ?? k.open),
              high: Number(k.h ?? k.high),
              low:  Number(k.l ?? k.low),
              close: Number(k.c ?? k.close),
              volume: Number(k.v ?? k.volume ?? 0)
            };
          }

          if (!candle || candle.timestamp == null) return;

          window.dispatchEvent(new CustomEvent('freqtrade:new_candle', {
            detail: { strategy: strategyName, pair: selectedPair, candle }
          }));
        } catch (e) {
          console.warn('[TradingViewChart] WS message parse error', e);
        }
      };

      ws.onerror = (e) => {
        console.error('[TradingViewChart] WS error:', e);
      };

      ws.onclose = (ev) => {
        console.log('[TradingViewChart] WS closed.', ev.code, ev.reason || '');
        stopKeepAlive();
        if (destroyed) return;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (keepAliveTimer) window.clearTimeout(keepAliveTimer);
      reconnectTimer = null;
      keepAliveTimer = null;
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'unsubscribe', data: ['analyzed_df'] })); } catch {}
          ws.close();
        }
      } catch {}
      ws = null;
    };
  }, [apiBase, strategyName, selectedPair, timeframe]);

  // --- Bridge WS event to TradingView realtime callback ---
  useEffect(() => {
    const eventListener = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (!d?.candle) return;
      if (d.strategy !== strategyName || d.pair !== selectedPair || !realtimeCbRef.current) return;

      const tfMs = tfMsRef.current || timeframeToMs(timeframe);
      const tsMsRaw = Number(d.candle.timestamp);
      const tsMs = tsMsRaw > 1e12 ? tsMsRaw : tsMsRaw * 1000;
      const alignedTime = Math.floor(tsMs / tfMs) * tfMs;

      const incomingBar = {
        time: alignedTime,
        open: Number(d.candle.open),
        high: Number(d.candle.high),
        low:  Number(d.candle.low),
        close: Number(d.candle.close),
        volume: Number(d.candle.volume || 0),
      };

      const cb = realtimeCbRef.current;
      const last = lastRealtimeBarRef.current as (typeof incomingBar | null);

      if (last && typeof last.time === 'number') {
        if (incomingBar.time === last.time) {
          lastRealtimeBarRef.current = incomingBar;
          cb(incomingBar);
          return;
        }
        if (incomingBar.time > last.time) {
          cb(last);
          lastRealtimeBarRef.current = incomingBar;
          cb(incomingBar);
          return;
        }
        return; // older frame -> ignore
      }

      lastRealtimeBarRef.current = incomingBar;
      cb(incomingBar);
      drawMarkers();
    };

    window.addEventListener('freqtrade:new_candle', eventListener);
    return () => window.removeEventListener('freqtrade:new_candle', eventListener);
  }, [strategyName, selectedPair, timeframe]);

  // --- Testing helper ---
  useEffect(() => {
    (window as any).dispatchTestCandle = (candle: any) => {
      const event = new CustomEvent('freqtrade:new_candle', {
        detail: { strategy: strategyName, pair: selectedPair, candle }
      });
      window.dispatchEvent(event);
    };
    return () => { delete (window as any).dispatchTestCandle; };
  }, [strategyName, selectedPair]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: "100%", height: "600px" }}
      className="tradingview-chart-container"
    />
  );
}
