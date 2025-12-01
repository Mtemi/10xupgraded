import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { authStore } from '~/lib/stores/auth';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { AuthDialog } from '../auth/AuthDialog';

interface AuthButtonsProps {
  vertical?: boolean;
}

export function AuthButtons({ vertical = false }: AuthButtonsProps) {
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const { isAuthenticated } = useStore(authStore);
  

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success('Successfully signed out');
    } catch (error) {
      console.error('Sign out failed:', error);
      toast.error('Failed to sign out');
    }
  };

  const openAuth = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setShowAuthDialog(true);
  };

  return (
    <div className={classNames('flex', vertical ? 'flex-col gap-2 w-full' : 'items-center gap-4')}>
      {!isAuthenticated ? (
        <>
          <button
            onClick={() => openAuth('signin')}
            className={classNames(
              "px-5 py-2.5 sm:px-6 sm:py-3 text-base sm:text-lg font-medium rounded-lg transition-colors",
              "bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text",
              "hover:bg-bolt-elements-button-secondary-backgroundHover",
              vertical ? "w-full text-left" : ""
            )}
          >
            Sign In
          </button>
          <button
            onClick={() => openAuth('signup')}
            className={classNames(
              "px-5 py-2.5 sm:px-6 sm:py-3 text-base sm:text-lg font-medium rounded-lg transition-colors",
              "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text",
              "hover:bg-bolt-elements-button-primary-backgroundHover",
              vertical ? "w-full text-left" : ""
            )}
          >
            Sign Up
          </button>
          <AuthDialog 
            isOpen={showAuthDialog} 
            onClose={() => setShowAuthDialog(false)}
            mode={authMode}
          />
        </>
      ) : (
        <button
          onClick={handleSignOut}
          className={classNames(
            "px-5 py-2.5 sm:px-6 sm:py-3 text-base sm:text-lg font-medium rounded-lg transition-colors",
            "bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text",
            "hover:bg-bolt-elements-button-secondary-backgroundHover"
          )}
        >
          Sign Out
        </button>
      )}
    </div>
  );
}