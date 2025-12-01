import { createScopedLogger } from '~/utils/logger';
import { setAuthenticated } from '~/lib/stores/auth';

const logger = createScopedLogger('GoogleAuthService');

export class GoogleAuthService {
  private static instance: GoogleAuthService;
  private initialized = false;
  private clientId: string;

  private constructor() {
    this.clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!this.clientId) {
      throw new Error('Google Client ID not configured');
    }
  }

  static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('Google Auth already initialized');
      return;
    }

    try {
      logger.info('Initializing Google Auth...');
      await this.loadGoogleScript();
      
      google.accounts.id.initialize({
        client_id: this.clientId,
        callback: this.handleCredentialResponse.bind(this),
        auto_select: false,
        cancel_on_tap_outside: true,
        ux_mode: 'popup'
      });

      this.initialized = true;
      logger.info('Google Auth initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Google Auth:', error);
      throw error;
    }
  }

  private async loadGoogleScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        logger.info('Google API script loaded successfully');
        resolve();
      };
      
      script.onerror = (error) => {
        logger.error('Failed to load Google API script:', error);
        reject(error);
      };

      document.head.appendChild(script);
    });
  }

  private handleCredentialResponse(response: any) {
    logger.info('Received Google credential response');
    try {
      const userInfo = this.parseJwt(response.credential);
      setAuthenticated(true);
      logger.info('Google sign-in successful');
    } catch (error) {
      logger.error('Error processing Google credential:', error);
      throw error;
    }
  }

  private parseJwt(token: string) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      logger.error('Failed to parse JWT token:', error);
      throw new Error('Invalid authentication token');
    }
  }

  renderButton(element: HTMLElement): void {
    if (!this.initialized) {
      logger.error('Cannot render button - Google Auth not initialized');
      return;
    }

    try {
      logger.info('Rendering Google sign-in button');
      google.accounts.id.renderButton(element, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: element.offsetWidth,
        logo_alignment: 'center'
      });
      logger.info('Google sign-in button rendered successfully');
    } catch (error) {
      logger.error('Failed to render Google sign-in button:', error);
      throw error;
    }
  }

  signOut(): void {
    if (!this.initialized) {
      logger.warn('Cannot sign out - Google Auth not initialized');
      return;
    }

    try {
      logger.info('Signing out from Google');
      google.accounts.id.disableAutoSelect();
      logger.info('Google sign-out successful');
    } catch (error) {
      logger.error('Failed to sign out:', error);
      throw error;
    }
  }
}