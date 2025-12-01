declare module '@tradingview/charting_library' {
  export interface ChartingLibraryWidgetOptions {
    symbol?: string;
    interval?: string;
    libraryPath?: string;
    chartsStorageUrl?: string;
    chartsStorageApiVersion?: '1.1' | '1.0' | '2.0';
    clientId?: string;
    userId?: string;
    fullscreen?: boolean;
    autosize?: boolean;
    studiesOverrides?: Record<string, any>;
    container?: HTMLElement;
    theme?: 'Light' | 'Dark';
    locale?: string;
    disabled_features?: string[];
    enabled_features?: string[];
    overrides?: Record<string, string | number | boolean>;
    custom_css_url?: string;
    loading_screen?: { backgroundColor: string };
  }

  export class widget {
    constructor(options: ChartingLibraryWidgetOptions);
    setSymbol(symbol: string, interval: string): void;
    changeTheme(theme: 'Light' | 'Dark'): void;
    activeChart(): any;
    remove(): void;
  }
}