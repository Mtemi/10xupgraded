import { useEffect, useState } from 'react';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';
import { toast } from 'react-toastify';
import { TokenCounter } from '../subscription/TokenCounter';

interface Plan {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_annual: number | null;
  tokens_included: number;
  tokens_annual: number | null;
  features: string[];
  stripe_price_id: string;
  stripe_annual_price_id: string | null;
  max_paper_bots?: number;
  max_live_bots?: number;
  notification_channels?: string[];
  support_level?: string;
}

export function SubscriptionPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [nextReset, setNextReset] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [currentBillingCycle, setCurrentBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        const { data: plansData, error: plansError } = await supabase
          .from('subscription_plans')
          .select(`
            id,
            name,
            description,
            price_monthly,
            price_annual,
            tokens_included,
            tokens_annual,
            features,
            stripe_price_id,
            stripe_annual_price_id,
            max_paper_bots,
            max_live_bots,
            notification_channels,
            support_level
          `)
          .order('price_monthly', { ascending: true });

        if (plansError) throw plansError;

        const mappedPlans = plansData
          .filter(plan => plan.name !== 'Token Bundle')
          .map(plan => {
            return {
              ...plan,
              features: Array.isArray(plan.features) ? plan.features : []
            };
          });

        setPlans(mappedPlans);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

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
          setCurrentPlan(subData.plan_id);
          setTokenBalance(subData.token_balance || 0);
          setNextReset(new Date(subData.current_period_end).toLocaleDateString());
          
          // Check if this is an annual subscription
          if (subData.current_period_end) {
            const periodLength = new Date(subData.current_period_end).getTime() - 
                              new Date(subData.current_period_start).getTime();
            // If period is longer than 45 days, assume it's annual
            if (periodLength > 45 * 24 * 60 * 60 * 1000) {
              setBillingCycle('annual');
            }
          }
        }
      } catch (error) {
        console.error('Error fetching plans:', error);
        toast.error('Failed to load subscription plans');
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const handleSubscribe = async (plan: Plan) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to subscribe');
        return;
      }

      const priceId = billingCycle === 'annual'
        ? plan.stripe_annual_price_id || plan.stripe_price_id
        : plan.stripe_price_id;

      if (!priceId) {
        toast.error('Invalid plan configuration');
        return;
      }

      console.log(`Subscribing to plan: ${plan.name}, cycle: ${billingCycle}, priceId: ${priceId}`);

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: priceId,
          userId: user.id,
          isSubscription: true,
          isAnnual: billingCycle === 'annual'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }
      
      const { sessionUrl } = await response.json();
      window.location.href = sessionUrl;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error(`Failed to process subscription: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleTokenPurchase = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to purchase tokens');
        return;
      }
      const response = await fetch('/api/token-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create checkout session');
      }
      const { sessionUrl } = await response.json();
      window.location.href = sessionUrl;
    } catch (error) {
      console.error('[Token Purchase] Error creating token purchase session:', error);
      toast.error('Failed to process token purchase');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading plans...</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 overflow-auto">
      <div className="
        relative 
        w-full max-w-6xl 
        bg-bolt-elements-background-depth-2 
        rounded-xl shadow-xl overflow-visible
        flex flex-col
        items-center
        py-0
      ">
        {/* Close Button */}
        <button
          onClick={() => navigate('/')}
          className="absolute top-4 right-4 z-10 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary p-2 rounded-full transition-colors"
        >
          <div className="i-ph:x-circle text-xl" />
        </button>

        {/* Header */}
        <div className="text-center p-6 pb-2">
          <h2 className="text-2xl font-bold text-bolt-elements-textPrimary mb-2">
            Choose Your Plan
          </h2>
          <p className="text-bolt-elements-textSecondary text-sm max-w-2xl mx-auto">
            Start with a free account to create, execute, and monitor trading scripts in real time—enhance your trading automation with live execution tracking.
          </p>
        </div>

        {/* Billing Cycle Toggle */}
        <div className="flex justify-center mb-5">
          <div className="flex items-center bg-bolt-elements-background-depth-3 p-1 rounded-full">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={classNames(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                billingCycle === 'monthly'
                  ? "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text"
                  : "text-bolt-elements-textSecondary"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={classNames(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                billingCycle === 'annual'
                  ? "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text"
                  : "text-bolt-elements-textSecondary"
              )}
            >
              Annual <span className="text-xs text-green-500 ml-1">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Token Balance & Purchase Section */}
        <div className="w-full bg-bolt-elements-background-depth-3/50 p-4 border-y border-bolt-elements-borderColor flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
            <div className="i-ph:tokens text-base" />
            <span><TokenCounter /></span>
          </div>
          <div className="text-sm">
            <span className="text-bolt-elements-textSecondary">
              Select a plan below or{' '}
              <a
                href="#"
                onClick={e => {
                  e.preventDefault();
                  handleTokenPurchase();
                }}
                className="text-accent-500 hover:text-accent-600 hover:underline inline-block"
              >
                buy on-the-go tokens
              </a>
            </span>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="
          flex justify-center w-full
          px-6 pt-8 pb-10
        ">
          <div className="w-full grid grid-cols-1 md:grid-cols-4 gap-6">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={classNames(
                  'flex flex-col h-full rounded-lg p-5 bg-bolt-elements-background-depth-3 border transition-all duration-200',
                  currentPlan === plan.id
                    ? 'border-accent-500 shadow-lg shadow-accent-500/10'
                    : 'border-bolt-elements-borderColor hover:border-accent-500/50'
                )}
                style={{ minHeight: 390, justifyContent: 'flex-start' }}
              >
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-bolt-elements-textPrimary mb-2">{plan.name}</h3>
                  <p className="text-bolt-elements-textSecondary text-sm mb-3">{plan.description}</p>
                  <div className="flex items-baseline mb-2">
                    <span className="text-2xl font-bold text-bolt-elements-textPrimary">
                      ${billingCycle === 'annual' 
                        ? (plan.price_annual || Math.round(plan.price_monthly * 10))
                        : plan.price_monthly}
                    </span>
                    <span className="text-bolt-elements-textSecondary ml-1 text-sm">
                      /{billingCycle === 'annual' ? 'year' : 'month'}
                    </span>
                  </div>
                  <div className="text-sm text-bolt-elements-textSecondary">
                    {billingCycle === 'annual'
                      ? `${(plan.tokens_annual || Math.round(plan.tokens_included * 12 * 1.2)).toLocaleString()} tokens/year`
                      : `${plan.tokens_included.toLocaleString()} tokens/month`}
                  </div>
                </div>

                {/* Features */}
                <div className="flex-grow">
                  <ul className="space-y-2 mb-4">
                    {Array.isArray(plan.features) && plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="i-ph:check text-accent-500 mt-1 flex-shrink-0" />
                        <span className="text-xs text-bolt-elements-textSecondary">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Subscribe Button */}
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={(!plan.stripe_price_id && billingCycle === 'monthly') || 
                           (!plan.stripe_annual_price_id && billingCycle === 'annual') || 
                           (currentPlan === plan.id && currentBillingCycle === billingCycle)}
                  className={classNames(
                    'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors',
                    currentPlan === plan.id && currentBillingCycle === billingCycle
                      ? 'bg-accent-500 text-white cursor-default'
                      : 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover',
                    ((!plan.stripe_price_id && billingCycle === 'monthly') || 
                     (!plan.stripe_annual_price_id && billingCycle === 'annual') || 
                     (currentPlan === plan.id && currentBillingCycle === billingCycle)) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {currentPlan === plan.id && currentBillingCycle === billingCycle ? 'Current Plan' : 'Subscribe'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}