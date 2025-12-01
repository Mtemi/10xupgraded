import { useGoogleAuth } from '~/lib/hooks/useGoogleAuth';
import { classNames } from '~/utils/classNames';

interface GoogleAuthButtonProps {
  variant?: 'primary' | 'secondary';
  label?: string;
}

export function GoogleAuthButton({ 
  variant = 'primary',
  label = 'Sign In'
}: GoogleAuthButtonProps) {
  const { isLoading, signIn } = useGoogleAuth();

  return (
    <button
      onClick={signIn}
      disabled={isLoading}
      className={classNames(
        "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
        {
          'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover': variant === 'primary',
          'bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover': variant === 'secondary'
        },
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      {isLoading ? 'Signing in...' : label}
    </button>
  );
}