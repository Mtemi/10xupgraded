import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';

// Minimum token thresholds
const MIN_TOKENS_REQUIRED = 2000; // Minimum tokens required for any operation
const LOW_TOKENS_WARNING = 3000; // Threshold for showing low tokens warning

// Estimate tokens for input content
export async function estimateTokens(content: string): Promise<number> {
  // Rough estimate: 1 token per 4 characters
  return Math.ceil(content.length / 4);
}

// Check if user has enough tokens
export async function checkTokenAvailability(userId: string, estimatedTokens: number): Promise<boolean> {
  console.log('[Token Check] Starting availability check', { userId, estimatedTokens });
  
  try {
    // Get remaining tokens using RPC function
    const { data: remainingTokens, error: tokenError } = await supabase.rpc('get_remaining_tokens', {
      user_uuid: userId
    });

    if (tokenError) {
      console.error('[Token Check] Error fetching remaining tokens:', tokenError);
      // Use a more specific toast ID and add error handling
      if (typeof window !== 'undefined' && window.document) {
        toast.error('Error checking token availability', { 
          toastId: 'token-availability-error',
          position: 'bottom-right'
        });
      }
      return false;
    }

    // Estimate total tokens needed (input + output)
    const totalEstimatedTokens = estimatedTokens * 2;

    // Check if remaining tokens are below minimum threshold
    if (remainingTokens < MIN_TOKENS_REQUIRED) {
      console.log('[Token Check] Below minimum token threshold', { remainingTokens, MIN_TOKENS_REQUIRED });
      if (typeof window !== 'undefined' && window.document) {
        toast.error(
          `You need at least ${MIN_TOKENS_REQUIRED.toLocaleString()} tokens to continue. ` +
          `Click to upgrade your plan.`, 
          { 
            onClick: () => window.location.href = '/subscription/plans',
            toastId: 'min-tokens-required',
            containerId: 'main-toast-container',
            position: 'bottom-right'
          }
        );
      }
      return false;
    }

    // Check if enough tokens for operation
    if (remainingTokens < totalEstimatedTokens) {
      console.log('[Token Check] Insufficient tokens', { remainingTokens, totalEstimatedTokens });
      if (typeof window !== 'undefined' && window.document) {
        toast.error(
          `Insufficient tokens. You need approximately ${totalEstimatedTokens.toLocaleString()} tokens ` +
          `but have ${remainingTokens.toLocaleString()} remaining. Click to upgrade.`, 
          { 
            onClick: () => window.location.href = '/subscription/plans',
            toastId: 'insufficient-tokens',
            containerId: 'main-toast-container',
            position: 'bottom-right'
          }
        );
      }
      return false;
    }

    // Show warning if tokens will be low after operation
    if ((remainingTokens - totalEstimatedTokens) < LOW_TOKENS_WARNING) {
      if (typeof window !== 'undefined' && window.document) {
        toast.warning(
          `Your token balance will be low after this operation. Consider upgrading.`,
          { 
            onClick: () => window.location.href = '/subscription/plans',
            toastId: 'low-tokens-warning',
            containerId: 'main-toast-container',
            position: 'bottom-right'
          }
        );
      }
    }

    console.log('[Token Check] Sufficient tokens available', { remainingTokens, totalEstimatedTokens });
    return true;
  } catch (error) {
    console.error('[Token Check] Error checking availability:', error);
    if (typeof window !== 'undefined' && window.document) {
      toast.error('Error checking token availability', { 
        toastId: 'token-availability-error',
        containerId: 'main-toast-container',
        position: 'bottom-right'
      });
    }
    return false;
  }
}

// New function for immediate token validation without UI blocking
export async function validateTokensAsync(userId: string, estimatedTokens: number): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    console.log('[Token Validation] Starting async validation for', estimatedTokens, 'tokens');
    
    const { data: remainingTokens, error: tokenError } = await supabase.rpc('get_remaining_tokens', {
      user_uuid: userId
    });

    if (tokenError) {
      console.error('[Token Validation] Error fetching tokens:', tokenError);
      return { valid: false, error: 'Failed to check token balance' };
    }

    const totalEstimatedTokens = estimatedTokens * 2;

    if (remainingTokens < MIN_TOKENS_REQUIRED) {
      return { valid: false, error: 'Minimum token threshold not met' };
    }

    if (remainingTokens < totalEstimatedTokens) {
      return { valid: false, error: 'Insufficient tokens for operation' };
    }

    console.log('[Token Validation] Validation successful');
    return { valid: true };
  } catch (error) {
    console.error('[Token Validation] Validation error:', error);
    return { valid: false, error: 'Token validation failed' };
  }
}

// Track token usage
export async function trackTokenUsage(
  userId: string, 
  tokensUsed: number, 
  operationType: 'script_generation' | 'bot_execution'
): Promise<void> {
  console.log('[Token Usage] Starting token usage tracking', { userId, tokensUsed, operationType });
  
  try {
    // Use RPC function to update token usage
    const { error: updateError } = await supabase.rpc('update_token_usage', {
      user_uuid: userId,
      tokens: Math.max(1, Math.abs(Math.round(tokensUsed))),
      operation: operationType
    });

    if (updateError) {
      console.error('[Token Usage] Error updating usage:', updateError);
      throw updateError;
    }

    // Get updated balance
    const { data: newBalance, error: balanceError } = await supabase.rpc('get_remaining_tokens', {
      user_uuid: userId
    });

    if (balanceError) {
      console.error('[Token Usage] Error fetching new balance:', balanceError);
      throw balanceError;
    }

    // Show warning if tokens are running low
    if (newBalance < LOW_TOKENS_WARNING) {
      if (typeof window !== 'undefined' && window.document) {
        toast.warning(
          `You have ${newBalance.toLocaleString()} tokens remaining. Click to upgrade.`, 
          {
            onClick: () => window.location.href = '/subscription/plans',
            toastId: 'low-tokens',
            containerId: 'main-toast-container',
            position: 'bottom-right'
          }
        );
      }
    }

    // Emit event to update UI
    window.dispatchEvent(new CustomEvent('tokenBalanceUpdate', {
      detail: { remainingTokens: newBalance }
    }));

  } catch (error) {
    console.error('[Token Usage] Error tracking usage:', error);
    
    // Log error but don't show toast since this is background tracking
    console.error('[Token Usage] Background token tracking failed:', error);
    
    // Don't throw error to avoid breaking the user experience
  }
}

// Function to add tokens to balance
export async function addTokensToBalance(userId: string, tokensToAdd: number): Promise<void> {
  console.log('[Token Balance] Adding tokens:', { userId, tokensToAdd });
  try {
    // Call RPC function to add tokens
    const { data: newBalance, error } = await supabase.rpc('add_tokens_to_balance', {
      user_uuid: userId,
      tokens_to_add: tokensToAdd
    });

    if (error) {
      console.error('[Token Balance] Error adding tokens:', error);
      throw error;
    }

    // Dispatch event to update UI
    window.dispatchEvent(new CustomEvent('tokenBalanceUpdate', {
      detail: { remainingTokens: newBalance }
    }));

    if (typeof window !== 'undefined' && window.document) {
      toast.success(`Added ${tokensToAdd.toLocaleString()} tokens to your account!`, {
        toastId: 'tokens-added',
        position: 'bottom-right'
      });
    }

  } catch (error) {
    console.error('[Token Balance] Error in addTokensToBalance:', error);
    if (typeof window !== 'undefined' && window.document) {
      toast.error('Failed to add tokens to your account', {
        toastId: 'add-tokens-error',
        position: 'bottom-right'
      });
    }
    throw error;
  }
}

// For backward compatibility
export { estimateTokens as estimateInputTokens };