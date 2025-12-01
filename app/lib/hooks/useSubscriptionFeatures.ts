import { useState, useEffect } from 'react';
import { supabase } from '~/lib/superbase/client';

export interface SubscriptionFeatures {
  maxPaperBots: number;
  maxLiveBots: number;
  notificationChannels: string[];
  supportLevel: string;
  planName: string;
  tokensIncluded: number;
  canAccessFeature: (feature: string) => boolean;
  isLoading: boolean;
  error: string | null;
  isExpired: boolean;
}

export function useSubscriptionFeatures(): SubscriptionFeatures {
  const [maxPaperBots, setMaxPaperBots] = useState<number>(3); // Default to Free plan
  const [maxLiveBots, setMaxLiveBots] = useState<number>(1); // Default to Free plan
  const [notificationChannels, setNotificationChannels] = useState<string[]>(['Email']);
  const [supportLevel, setSupportLevel] = useState<string>('');
  const [planName, setPlanName] = useState<string>('Free');
  const [tokensIncluded, setTokensIncluded] = useState<number>(20000);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  useEffect(() => {
    const fetchSubscriptionFeatures = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          setIsLoading(false);
          return; // Use default values for non-authenticated users
        }

        // Try to use the RPC function first
        const { data: features, error: rpcError } = await supabase.rpc(
          'get_user_subscription_features',
          { user_uuid: user.id }
        );

        if (!rpcError && features) {
          setMaxPaperBots(features.max_paper_bots);
          setMaxLiveBots(features.max_live_bots);
          setNotificationChannels(features.notification_channels);
          setSupportLevel(features.support_level);
          setPlanName(features.plan_name);
          setTokensIncluded(features.tokens_included);
        } else {
          // Fallback to direct query if RPC fails
          const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select(`
              *,
              subscription_plans(*)
            `)
            .eq('user_id', user.id)
            .eq('status', 'active')
            .single();

          if (subError && subError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
            throw subError;
          }

          if (subscription) {
            const plan = subscription.subscription_plans;
            setPlanName(plan.name);
            setTokensIncluded(plan.tokens_included);

            // Check if subscription is expired
            const currentDate = new Date();
            const endDate = new Date(subscription.current_period_end);
            setIsExpired(currentDate > endDate);
            
            // Set features based on plan name
            if (plan.name === 'Pro') {
              setMaxPaperBots(-1); // Unlimited
              setMaxLiveBots(10);
              setNotificationChannels(['Telegram']);
              setSupportLevel('');
            } else if (plan.name === 'Elite') {
              setMaxPaperBots(-1); // Unlimited
              setMaxLiveBots(50);
              setNotificationChannels(['Telegram']);
              setSupportLevel('Priority');
            } else {
              // Free plan or default
              setMaxPaperBots(3);
              setMaxLiveBots(1);
              setNotificationChannels(['Email']);
              setSupportLevel('');
            }
          }
        }
      } catch (err) {
        console.error('Error fetching subscription features:', err);
        setError(err instanceof Error ? err.message : 'Failed to load subscription features');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscriptionFeatures();
  }, []);

  // Function to check if user can access a specific feature
  const canAccessFeature = (feature: string): boolean => {
    switch (feature) {
      case 'paper_trading':
        return true; // All plans have access to paper trading (with limits)
      case 'live_trading':
        return true; // All plans have access to live trading (with limits)
      case 'telegram_notifications':
        return notificationChannels.includes('Telegram');
      case 'priority_support':
        return supportLevel === 'Priority';
      case 'advanced_risk_management':
        return planName === 'Pro' || planName === 'Elite';
      case 'edge_positioning':
        return planName === 'Elite';
      default:
        return false;
    }
  };

  return {
    maxPaperBots,
    maxLiveBots,
    notificationChannels,
    supportLevel,
    planName,
    tokensIncluded,
    canAccessFeature,
    isLoading,
    error,
    isExpired
  };
}