import { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { setAuthenticated } from '~/lib/stores/auth';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useGoogleAuth');

declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (callback: (notification: any) => void) => void;
          renderButton: (element: HTMLElement, options: any) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

export function useGoogleAuth() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const initializeGoogleAuth = useCallback(async () => {
    if (isInitialized) return;

    try {
      await loadGoogleScript();
      
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response.credential) {
            setAuthenticated(true);
            toast.success('Successfully signed in!');
          }
        },
      });

      setIsInitialized(true);
      logger.info('Google Auth initialized');
    } catch (error) {
      logger.error('Failed to initialize Google Auth:', error);
      toast.error('Failed to initialize authentication');
    }
  }, [isInitialized]);

  useEffect(() => {
    initializeGoogleAuth();
  }, [initializeGoogleAuth]);

  const signIn = async () => {
    if (!isInitialized) {
      await initializeGoogleAuth();
    }

    setIsLoading(true);
    try {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          logger.error('Google Sign In prompt not displayed:', notification);
          toast.error('Unable to display sign in prompt');
        }
      });
    } catch (error) {
      logger.error('Sign in failed:', error);
      toast.error('Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = useCallback(() => {
    try {
      window.google.accounts.id.disableAutoSelect();
      setAuthenticated(false);
      toast.success('Successfully signed out');
    } catch (error) {
      logger.error('Sign out failed:', error);
      toast.error('Failed to sign out');
    }
  }, []);

  return {
    isInitialized,
    isLoading,
    signIn,
    signOut
  };
}

async function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google script'));
    document.head.appendChild(script);
  });
}