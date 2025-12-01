import { useEffect, useRef } from 'react';
import Datafeed from '~/lib/tradingview/datafeed';
import { useStore } from '@nanostores/react';
import { themeStore } from '~/lib/stores/theme';

export const Preview = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const theme = useStore(themeStore);
  const widgetRef = useRef<any>(null);


  useEffect(() => {
    const initWidget = () => {
      if (!chartContainerRef.current || !window.TradingView) return;
      console.log('[TradingView] Initializing widget...');

      widgetRef.current = new window.TradingView.widget({
        symbol: 'Binance:BTC/USDT',
        interval: '1D',
        fullscreen: false,
        autosize: true,
        theme: theme === 'dark' ? 'Dark' : 'Light',
        container: chartContainerRef.current,
        datafeed: Datafeed,
        library_path: '/charting_library/',
        locale: 'en',
        disabled_features: ['use_localstorage_for_settings'],
        enabled_features: [],
        custom_indicators_getter: (PineJS: any) => {
          return Promise.resolve([
            {
              name: 'Custom Moving Average',
              metainfo: {
                _metainfoVersion: 52,
                id: 'Custom Moving Average@tv-basicstudies-1',
                description: 'Custom Moving Average',
                shortDescription: 'Custom MA',
                format: { type: 'inherit' },
                linkedToSeries: true,
                is_price_study: true,
                plots: [
                  { id: 'plot_0', type: 'line' },
                  { id: 'smoothedMA', type: 'line' },
                ],
                defaults: {
                  styles: {
                    plot_0: { linestyle: 0, linewidth: 1, plottype: 0, trackPrice: false, transparency: 0, visible: true, color: '#2196F3' },
                    smoothedMA: { linestyle: 0, linewidth: 1, plottype: 0, trackPrice: false, transparency: 0, visible: true, color: '#9621F3' },
                  },
                  inputs: {
                    length: 9,
                    source: 'close',
                    offset: 0,
                    smoothingLine: 'SMA',
                    smoothingLength: 9,
                  },
                },
                inputs: [
                  { id: 'length', name: 'Length', defval: 9, type: 'integer', min: 1, max: 10000 },
                  { id: 'source', name: 'Source', defval: 'close', type: 'source', options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'] },
                  { id: 'offset', name: 'Offset', defval: 0, type: 'integer', min: -10000, max: 10000 },
                  { id: 'smoothingLine', name: 'Smoothing Line', defval: 'SMA', type: 'text', options: ['SMA', 'EMA', 'WMA'] },
                  { id: 'smoothingLength', name: 'Smoothing Length', defval: 9, type: 'integer', min: 1, max: 10000 },
                ],
              },
              constructor: function () {
                this.init = function (context: any, input: any) {
                  this._context = context;
                };
                this.main = function (ctx: any, inputCallback: any) {
                  this._context = ctx;
                  this._input = inputCallback;

                  const source = PineJS.Std[this._input(1)](this._context);
                  const length = this._input(0);
                  const offset = this._input(2);
                  const smoothingLine = this._input(3);
                  const smoothingLength = this._input(4);

                  this._context.setMinimumAdditionalDepth(length + smoothingLength);

                  const series = this._context.new_var(source);
                  const sma = PineJS.Std.sma(series, length, this._context);
                  const sma_series = this._context.new_var(sma);

                  let smoothedMA;
                  if (smoothingLine === 'EMA') {
                    smoothedMA = PineJS.Std.ema(sma_series, smoothingLength, this._context);
                    smoothedMA = PineJS.Std.ema(sma_series, smoothingLength, this._context);
                  } else if (smoothingLine === 'WMA') {
                    smoothedMA = PineJS.Std.wma(sma_series, smoothingLength, this._context);
                  } else {
                    smoothedMA = PineJS.Std.sma(sma_series, smoothingLength, this._context);
                  }

                  return [
                    { value: sma, offset: offset },
                    { value: smoothedMA, offset: offset },
                  ];
                };
              },
            },
          ]);
        },
      });

      widgetRef.current.onChartReady(() => {
        widgetRef.current.chart().createStudy('Custom Moving Average', false, false, undefined, {});
      });
    };

    if (!window.TradingView) {
      const script = document.createElement('script');
      script.src = '/charting_library/charting_library.js';
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    } else {
      initWidget();
    }

    return () => {
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }
    };
  }, [theme]);


  return (
    <div
      ref={chartContainerRef}
      id="tv_chart_container"
      className="w-full h-full overflow-hidden"
      style={{ height: 'calc(100vh - 2rem)' }}
    />
  );
};
