import { supabase } from '~/lib/superbase/client';

/**
 * Function to check for expired subscriptions and convert them to free plans with zero tokens
 * This can be called from a scheduled function or manually
 */
export async function checkExpiredSubscriptions() {
  try {
    console.log('[Cron] Checking for expired subscriptions');
    
    // Call the RPC function to handle expired subscriptions
    const { data, error } = await supabase.rpc('handle_expired_subscriptions');
    
    if (error) {
      console.error('[Cron] Error handling expired subscriptions:', error);
      throw error;
    }
    
    console.log('[Cron] Successfully processed expired subscriptions');
    return { success: true, message: 'Expired subscriptions processed' };
  } catch (error) {
    console.error('[Cron] Failed to process expired subscriptions:', error);
    return { 
      success: false, 
      message: 'Failed to process expired subscriptions', 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

// This function can be called from a scheduled task or manually
// For example, it could be triggered by a Cloudflare Worker cron job
// or called from an admin panel