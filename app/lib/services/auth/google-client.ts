import { createScopedLogger } from '~/utils/logger';
import { GOOGLE_AUTH_CONFIG } from './config';

const logger = createScopedLogger('GoogleClient');

export class GoogleClient {
  private static instance: GoogleClient;
  private initialized = false;

  private constructor() {}

  static getInstance(): GoogleClient {
    if (!GoogleClient.instance) {
      GoogleClient.instance = new GoogleClient();
    }
    return GoogleClient.instance;
  }

  async loadGoogleScript(): Promise<void> {
    if (this.initialized) {
      logger.info('Google client already initialized');
      return;
    }

    return new Promise((resolve, reject) => {
      logger.info('Loading Google client script');
      
      const script = document.createElement('script');
      script.src = GOOGLE_AUTH_CONFIG.API_URL;
      script.async = true;
      script.defer = true;
      
      const nonce = document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content');
      if (nonce) {
        script.nonce = nonce;
      }

      script.onload = () => {
        logger.info('Google client script loaded successfully');
        this.initialized = true;
        resolve();
      };

      script.onerror = (error) => {
        logger.error('Failed to load Google client script:', error);
        reject(new Error('Failed to load Google client script'));
      };

      document.head.appendChild(script);
    });
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
