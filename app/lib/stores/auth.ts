// app/lib/stores/auth.ts
import { atom } from 'nanostores';
import { supabase } from '~/lib/superbase/client';

export interface AuthState {
  isAuthenticated: boolean;
  freePromptUsed: boolean;
}

export const authStore = atom<AuthState>({
  isAuthenticated: false,
  freePromptUsed: false,
});

// Helper function to check if we should bypass auth in development
export const isDevelopmentMode = () => {
  // Authentication bypass disabled - require authentication
  return false;
};

// Helper function to check if user has access (authenticated only)
export const hasAccess = (isAuthenticated: boolean) => {
  return isAuthenticated;
};

export function setFreePromptUsed() {
  authStore.set({
    ...authStore.get(),
    freePromptUsed: true,
  });
}

export async function setAuthenticated(value: boolean) {
  authStore.set({
    ...authStore.get(),
    isAuthenticated: value,
  });

  // Only attempt to assign free plan if user just got authenticated
  if (value) {
    try {
      // Get the user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No user found');

      // Get the free plan ID
      const { data: freePlan, error: planError } = await supabase
        .from('subscription_plans')
        .select('id')
        .eq('name', 'Free')
        .single();

      if (planError) throw planError;
      if (!freePlan) throw new Error('Free plan not found');

      // Check if user already has a subscription
      const { data: existingSub, error: subError } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subError && subError.code !== 'PGRST116') { // PGRST116 means no rows found
        throw subError;
      }

      // Only create subscription if user doesn't have one
      if (!existingSub) {
        const { error: subscriptionError } = await supabase
          .from('subscriptions')
          .insert({
            user_id: user.id,
            plan_id: freePlan.id,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            token_balance: 10000 // Initial token balance for free plan
          });

        if (subscriptionError) {
          console.error('Error creating subscription:', subscriptionError);
          throw subscriptionError;
        }

        // Wait a moment for the subscription to be fully processed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify the subscription was created successfully
        const { data: verifyData, error: verifyError } = await supabase
          .from('subscriptions')
          .select(`
            *,
            subscription_plans (
              name,
              tokens_included
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single();

        if (verifyError) {
          console.error('Error verifying subscription:', verifyError);
          throw verifyError;
        }

        // Dispatch event to update token display
        window.dispatchEvent(new CustomEvent('tokenBalanceUpdate', {
          detail: { remainingTokens: verifyData.subscription_plans.tokens_included }
        }));

        console.log('Free plan assigned successfully');
      }
    } catch (error) {
      console.error('Error assigning free plan:', error);
    }
  }
}