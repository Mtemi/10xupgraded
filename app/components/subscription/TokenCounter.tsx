import { useEffect, useState } from 'react';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';

export function TokenCounter() {
  const [tokens, setTokens] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;

  const fetchTokens = async () => {
    try {
      console.log('[TokenCounter] Starting token fetch');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('[TokenCounter] Auth error:', authError);
        return;
      }
      
      if (!user) {
        console.log('[TokenCounter] No authenticated user');
        return;
      }

      // Get remaining tokens using RPC function
      const { data: remainingTokens, error: tokenError } = await supabase.rpc('get_remaining_tokens', {
        user_uuid: user.id
      });

      if (tokenError) {
        console.error('[TokenCounter] Error fetching tokens:', tokenError);
        throw tokenError;
      }

      if (remainingTokens === null && retryCount < MAX_RETRIES) {
        console.log('[TokenCounter] No tokens found, retrying...');
        setRetryCount(prev => prev + 1);
        setTimeout(fetchTokens, RETRY_DELAY);
        return;
      }

      console.log('[TokenCounter] Token balance:', remainingTokens);
      setTokens(remainingTokens || 0);
      setRetryCount(0);

    } catch (error) {
      console.error('[TokenCounter] Error in fetchTokens:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
    
    // Listen for token balance updates
    const handleTokenUpdate = (event: CustomEvent<{ remainingTokens: number }>) => {
      console.log('[TokenCounter] Received token update:', event.detail);
      setTokens(event.detail.remainingTokens);
    };

    window.addEventListener('tokenBalanceUpdate', handleTokenUpdate as EventListener);
    
    // Subscribe to token_usage changes
    const channel = supabase
      .channel('token_usage_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'token_usage'
        },
        (payload) => {
          console.log('[TokenCounter] Token usage changed:', payload);
          fetchTokens();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('tokenBalanceUpdate', handleTokenUpdate as EventListener);
      channel.unsubscribe();
    };
  }, [retryCount]);

  if (loading || tokens === null) return null;

  return (
    <div className="w-full bg-bolt-elements-background-depth-1 border-b border-bolt-elements-borderColor">
      <div className="flex items-center justify-between h-[22px] px-4 max-w-[800px] mx-auto">
        <div className="flex items-center gap-1.5">
          <div className="i-ph:tokens text-[10px] text-bolt-elements-textSecondary" />
          <span className="text-[10px] font-medium text-bolt-elements-textSecondary tracking-wide">
            {tokens.toLocaleString()} tokens available
          </span>
        </div>
        {tokens < 10000 && (
          <a 
            className="text-[10px] text-accent-500 hover:text-accent-400 transition-colors"
            href="/subscription/plans"
          >
            Upgrade
          </a>
        )}
      </div>
    </div>
  );
}
