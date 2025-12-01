import { useEffect, useState } from 'react';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';

interface SubscriptionDetails {
  planName: string;
  status: string;
  currentPeriodEnd: string;
  tokensIncluded: number;
  tokensRemaining: number;
}

export function SubscriptionSettings() {
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch subscription details
        const { data: subData } = await supabase
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

        if (subData) {
          // Fetch remaining tokens
          const { data: tokens } = await supabase.rpc('get_remaining_tokens', {
            user_uuid: user.id
          });

          setSubscription({
            planName: subData.subscription_plans.name,
            status: subData.status,
            currentPeriodEnd: new Date(subData.current_period_end).toLocaleDateString(),
            tokensIncluded: subData.subscription_plans.tokens_included,
            tokensRemaining: tokens
          });
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, []);

  if (loading) {
    return <div>Loading subscription details...</div>;
  }

  if (!subscription) {
    return (
      <div className="text-center">
        <p className="text-bolt-elements-textSecondary">No active subscription</p>
        <button
          onClick={() => window.location.href = '/subscription/plans'}
          className="mt-4 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text px-4 py-2 rounded-md hover:bg-bolt-elements-button-primary-backgroundHover"
        >
          View Plans
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 bg-bolt-elements-background-depth-2 rounded-lg">
      <h2 className="text-2xl font-bold text-bolt-elements-textPrimary mb-6">
        Subscription Details
      </h2>

      <div className="space-y-4">
        <div className="flex justify-between items-center py-3 border-b border-bolt-elements-borderColor">
          <span className="text-bolt-elements-textSecondary">Plan</span>
          <span className="text-bolt-elements-textPrimary font-medium">
            {subscription.planName}
          </span>
        </div>

        <div className="flex justify-between items-center py-3 border-b border-bolt-elements-borderColor">
          <span className="text-bolt-elements-textSecondary">Status</span>
          <span className="text-bolt-elements-textPrimary font-medium">
            {subscription.status}
          </span>
        </div>

        <div className="flex justify-between items-center py-3 border-b border-bolt-elements-borderColor">
          <span className="text-bolt-elements-textSecondary">Current Period Ends</span>
          <span className="text-bolt-elements-textPrimary font-medium">
            {subscription.currentPeriodEnd}
          </span>
        </div>

        <div className="flex justify-between items-center py-3 border-b border-bolt-elements-borderColor">
          <span className="text-bolt-elements-textSecondary">Tokens Included</span>
          <span className="text-bolt-elements-textPrimary font-medium">
            {subscription.tokensIncluded.toLocaleString()}
          </span>
        </div>

        <div className="flex justify-between items-center py-3">
          <span className="text-bolt-elements-textSecondary">Tokens Remaining</span>
          <span className="text-bolt-elements-textPrimary font-medium">
            {subscription.tokensRemaining.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-8 flex gap-4">
        <button
          onClick={() => window.location.href = '/subscription/plans'}
          className="flex-1 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text px-4 py-2 rounded-md hover:bg-bolt-elements-button-primary-backgroundHover"
        >
          Change Plan
        </button>
        <button
          onClick={() => window.location.href = '/subscription/buy-tokens'}
          className="flex-1 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text px-4 py-2 rounded-md hover:bg-bolt-elements-button-secondary-backgroundHover"
        >
          Buy More Tokens
        </button>
      </div>
    </div>
  );
}