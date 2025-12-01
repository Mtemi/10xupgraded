import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';

declare global {
  interface Window {
    tvWidget: any;
    TradingView: {
      widget: any;
    };
  }
}

export function Preview() {
  useEffect(() => {
    const initWidget = () => {
      const datafeedUrl = "https://demo-feed-data.tradingview.com";

      window.tvWidget = new window.TradingView.widget({
        fullscreen: true,
        symbol: 'BTCUSDT',
        interval: '1D',
        container: "tv_chart_container",
        datafeed: new (window as any).Datafeeds.UDFCompatibleDatafeed(datafeedUrl, undefined, {
          maxResponseLength: 1000,
          expectedOrder: 'latestFirst',
        }),
        library_path: "charting_library/",
        locale: "en",
        disabled_features: ["use_localstorage_for_settings"],
        enabled_features: ["study_templates"],
        charts_storage_url: 'https://saveload.tradingview.com',
        charts_storage_api_version: "1.1",
        client_id: 'tradingview.com',
        user_id: 'public_user_id'
      });
    };

    // Load TradingView library if not already loaded
    if (!window.TradingView) {
      const script = document.createElement('script');
      script.src = "charting_library/charting_library.standalone.js";
      script.type = 'text/javascript';
      script.async = true;
      script.onload = () => {
        // Load UDF bundle after main library
        const udfScript = document.createElement('script');
        udfScript.src = "datafeeds/udf/dist/bundle.js";
        udfScript.type = 'text/javascript';
        udfScript.async = true;
        udfScript.onload = initWidget;
        document.head.appendChild(udfScript);
      };
      document.head.appendChild(script);
    } else {
      initWidget();
    }

    return () => {
      if (window.tvWidget) {
        window.tvWidget.remove();
        window.tvWidget = null;
      }
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-bolt-elements-background-depth-1">
      <div id="tv_chart_container" className="flex-1" />
    </div>
  );
}