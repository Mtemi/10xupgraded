import { useEffect, useRef } from 'react';
import { useGoogleAuth } from '~/lib/hooks/useGoogleAuth';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GoogleSignInButton');

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const { isInitialized, renderButton } = useGoogleAuth();

  useEffect(() => {
    if (isInitialized && buttonRef.current) {
      logger.info('Initializing Google sign-in button');
      try {
        renderButton(buttonRef.current);
      } catch (error) {
        logger.error('Failed to initialize Google sign-in button:', error);
        onError?.(error instanceof Error ? error : new Error('Failed to initialize sign-in button'));
      }
    }
  }, [isInitialized, renderButton]);

  useEffect(() => {
    const handleSuccess = (event: CustomEvent<any>) => {
      logger.info('Google sign-in successful');
      onSuccess?.();
    };

    const handleError = (event: CustomEvent<Error>) => {
      logger.error('Google sign-in failed:', event.detail);
      onError?.(event.detail);
    };

    window.addEventListener('googleSignInSuccess', handleSuccess as EventListener);
    window.addEventListener('googleSignInError', handleError as EventListener);

    return () => {
      window.removeEventListener('googleSignInSuccess', handleSuccess as EventListener);
      window.removeEventListener('googleSignInError', handleError as EventListener);
    };
  }, [onSuccess, onError]);

  return (
    <div 
      ref={buttonRef}
      className="w-full min-h-[40px] flex items-center justify-center"
      aria-label="Google sign-in button"
    />
  );
}