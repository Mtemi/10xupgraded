// app/routes/auth.reset-password.tsx
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from '@remix-run/react';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';
import { PageLayout } from '~/components/layout/PageLayout';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Get the token from the URL
  const code = searchParams.get('code');

  useEffect(() => {
    if (!code) {
      setError('Invalid or missing reset code. Please request a new password reset link.');
    }
  }, [code]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use Supabase's updateUser method to set the new password
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      toast.success('Password has been reset successfully');
      
      // Redirect to home after a short delay
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (error) {
      console.error('Error resetting password:', error);
      setError(error instanceof Error ? error.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout>
      <div className="max-w-md mx-auto mt-10 p-6 bg-bolt-elements-background-depth-2 rounded-lg shadow-md border border-bolt-elements-borderColor">
        <h1 className="text-2xl font-bold text-bolt-elements-textPrimary mb-6">Reset Your Password</h1>
        
        {error && (
          <div className="bg-red-500/20 text-red-500 p-3 rounded-md mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
              required
            />
          </div>
          
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:border-accent-500 focus:outline-none"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={loading || !code}
            className="w-full bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text p-2 rounded-md hover:bg-bolt-elements-button-primary-backgroundHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
        
        <div className="mt-4 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-accent-500 hover:text-accent-600 hover:underline transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    </PageLayout>
  );
}