// Ensure the path matches your public directory structure
export const CHARTING_LIBRARY_PATH = '/charting_library/';

// Add additional configuration options
export const TRADINGVIEW_CONFIG = {
  client_id: '10xtraders.ai',
  charts_storage_url: 'https://saveload.tradingview.com',
  disabled_features: ['use_localstorage_for_settings'],
  enabled_features: ['study_templates', 'allow_saving_charts_locally'],
  custom_css_url: '/tradingview.css',
  default_theme: 'Dark'
};