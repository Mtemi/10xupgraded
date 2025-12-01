// app/components/auth/AuthDialog.tsx
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '~/lib/superbase/client';
import { cubicEasingFn } from '~/utils/easings';
import { toast } from 'react-toastify';
import { useState } from 'react';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'signin' | 'signup';
  closeOnOverlayClick?: boolean;
}

export function AuthDialog({
  isOpen,
  onClose,
  mode = 'signin',
  closeOnOverlayClick = true,
}: AuthDialogProps) {
  const [forgotPassword, setForgotPassword] = useState(false);

  const handleAuthStateChange = async (event: any, session: any) => {
    console.log('Auth state change event:', event);
    console.log('Session data:', session);
    
    if (event === 'SIGNED_IN') {
      try {
        // Check if user already has a subscription
        const { data: existingSub, error: subError } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', session.user.id)
          .single();

        if (subError && subError.code !== 'PGRST116') {
          // PGRST116 is "no rows returned"
          console.error('Error checking subscription:', subError);
          toast.error('Error checking subscription status');
          return;
        }

        // If no subscription exists, the trigger will handle creating one
        if (!existingSub) {
          // Wait briefly to allow the trigger to complete
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Verify subscription was created
          const { data: newSub, error: verifyError } = await supabase
            .from('subscriptions')
            .select('id, subscription_plans(name)')
            .eq('user_id', session.user.id)
            .single();

          if (verifyError) {
            console.error('Error verifying subscription:', verifyError);
            toast.error('Error setting up initial subscription');
            return;
          }

          if (newSub) {
            toast.success(
              `Welcome! You're on the ${newSub.subscription_plans.name} plan`
            );
          }
        }

        onClose();
      } catch (error) {
        console.error('Error in auth state change:', error);
        toast.error('An error occurred during sign in');
      }
    } else if (event === 'SIGNED_UP') {
      console.log('User signed up successfully');
      toast.success('Account created successfully! Please check your email for verification.');
    } else if (event === 'PASSWORD_RECOVERY') {
      console.log('Password recovery initiated');
      toast.info('Password recovery email sent. Please check your inbox.');
      setForgotPassword(false);
    } else if (event === 'USER_UPDATED') {
      console.log('User updated');
      toast.success('Your account has been updated successfully');
    } else if (event === 'SIGNED_OUT') {
      console.log('User signed out');
    } else if (event.startsWith('ERROR')) {
      console.error('Auth error:', event);
      const errorMessage = session?.error?.message || 'Authentication error occurred';
      toast.error(errorMessage);
    }
    
    // Call onClose after successful sign in to close the dialog
    if (event === 'SIGNED_IN') {
      setTimeout(() => {
        onClose();
      }, 1000); // Small delay to show success message
    }
  };

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 w-full bg-black/50 z-[9999] flex items-center justify-center"
          onClick={(e) => {
            if (closeOnOverlayClick && e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <Dialog.Content asChild>
            <motion.div
              className="fixed w-[90vw] max-w-[400px] bg-bolt-elements-background-depth-2 rounded-lg p-6 z-[10000] border border-bolt-elements-borderColor shadow-xl"
              initial="closed"
              animate="open"
              exit="closed"
              variants={{
                closed: {
                  opacity: 0,
                  scale: 0.95,
                  transition: {
                    duration: 0.2,
                    ease: cubicEasingFn,
                  },
                },
                open: {
                  opacity: 1,
                  scale: 1,
                  transition: {
                    duration: 0.2,
                    ease: cubicEasingFn,
                  },
                },
              }}
            >
              <Dialog.Title className="text-xl font-semibold mb-4 text-bolt-elements-textPrimary">
                {forgotPassword 
                  ? 'Reset Password'
                  : mode === 'signin' ? 'Sign In' : 'Get Started'}
              </Dialog.Title>
              <Dialog.Description className="text-bolt-elements-textSecondary mb-6">
                {forgotPassword
                  ? 'Enter your email address and we\'ll send you a link to reset your password.'
                  : mode === 'signin'
                    ? 'Sign in to continue generating trading strategies with AI'
                    : 'Create an account to start building trading strategies with AI'}
              </Dialog.Description>

              {forgotPassword ? (
                <div className="space-y-4">
                  <Auth
                    supabaseClient={supabase}
                    appearance={{
                      theme: ThemeSupa,
                      variables: {
                        default: {
                          colors: {
                            brand: 'var(--bolt-elements-button-primary-background)',
                            brandAccent:
                              'var(--bolt-elements-button-primary-backgroundHover)',
                          },
                        },
                      },
                    }}
                    view="forgotten_password"
                    theme="dark"
                    onAuthStateChange={handleAuthStateChange}
                    showLinks={false}
                  />
                  <button
                    onClick={() => setForgotPassword(false)}
                    className="text-sm text-accent-500 hover:text-accent-600 hover:underline mt-2 flex items-center gap-1 transition-colors"
                  >
                    <div className="i-ph:arrow-left text-base"></div>
                    Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  <Auth
                    supabaseClient={supabase}
                    appearance={{
                      theme: ThemeSupa,
                      variables: {
                        default: {
                          colors: {
                            brand: 'var(--bolt-elements-button-primary-background)',
                            brandAccent:
                              'var(--bolt-elements-button-primary-backgroundHover)',
                          },
                        },
                      },
                    }}
                    view={mode === 'signin' ? 'sign_in' : 'sign_up'}
                    providers={['google', 'github']} // Google and GitHub
                    theme="dark"
                    onAuthStateChange={handleAuthStateChange}
                    showLinks={false}
                  />
                  {mode === 'signin' && (
                    <div className="flex justify-center mt-4">
                      <button
                        onClick={() => setForgotPassword(true)}
                        className="text-sm text-accent-500 hover:text-accent-600 hover:underline px-3 py-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-opacity-50"
                      >
                        Forgot your password?
                      </button>
                    </div>
                  )}
                </>
              )}
              <button
                onClick={onClose}
                className="w-full mt-4 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text p-3 rounded-lg hover:bg-bolt-elements-button-secondary-backgroundHover transition-colors"
                aria-label="Cancel"
              >
                Cancel
              </button>
            </motion.div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}