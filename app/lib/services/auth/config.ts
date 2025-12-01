// app/lib/services/auth/config.ts
export const GOOGLE_AUTH_CONFIG = {
  REDIRECT_URI: 'https://10xtraders.ai',
  API_URL: 'https://accounts.google.com/gsi/client',
  SCOPES: 'openid email profile',
  BUTTON_CONFIG: {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'center',
    width: '100%',
  },
};


// CSP configuration
export const CSP_CONFIG = {
  scriptSrc: [
    "'self'",
    'https://accounts.google.com',
    'https://apis.google.com'
  ],
  frameSrc: [
    'https://accounts.google.com'
  ],
  connectSrc: [
    'https://accounts.google.com'
  ]
};