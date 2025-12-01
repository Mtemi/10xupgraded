import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from '@remix-run/react';
import { PageLayout } from '~/components/layout/PageLayout';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';

export default function SubscriptionSuccessPage() {
  const [searchParams] = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const processSuccess = async () => {
      try {
        const sessionId = searchParams.get('session_id');
        const type = searchParams.get('type');
        const priceId = searchParams.get('price_id');
        const isAnnual = searchParams.get('is_annual') === 'true';
        
        console.log('[Success] Processing purchase success:', { sessionId, type, priceId, isAnnual });

        if (!sessionId) {
          throw new Error('Invalid session');
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          throw new Error('Please sign in to continue');
        }

        // Wait briefly for webhook to process
        await new Promise(resolve => setTimeout(resolve, 2000));

        if (type === 'token') {
          // For token purchases, initialize token balance
          const TOKENS_PER_PURCHASE = 40000;
          const { error: tokenError } = await supabase.rpc('initialize_token_balance', {
            user_uuid: user.id,
            token_amount: TOKENS_PER_PURCHASE
          });

          if (tokenError) {
            console.error('[Success] Token initialization error:', tokenError);
            throw new Error('Failed to initialize tokens');
          }

          if (mounted) {
            toast.success('Token purchase successful!');
            await new Promise(resolve => setTimeout(resolve, 1000));
            navigate('/', { replace: true });
          }
        } else {
          // For subscriptions, get the plan details
          const { data: plan, error: planError } = await supabase
            .from('subscription_plans')
            .select('id, name, tokens_included, tokens_annual')
            .or(`stripe_price_id.eq.${priceId},stripe_annual_price_id.eq.${priceId}`)
            .single();

          if (planError || !plan) {
            throw new Error('Failed to fetch plan details');
          }

          // Determine token amount based on billing cycle
          const tokenAmount = isAnnual ? plan.tokens_annual : plan.tokens_included;
          console.log('[Success] Plan details:', { 
            planName: plan.name, 
            tokenAmount, 
            isAnnual 
          });

          // First cancel any existing active subscriptions
          const { error: updateError } = await supabase
            .from('subscriptions')
            .update({ 
              status: 'cancelled',
              updated_at: new Date().toISOString() 
            })
            .eq('user_id', user.id)
            .eq('status', 'active');

          if (updateError) {
            console.error('[Success] Error cancelling old subscription:', updateError);
          }

          // Then insert new subscription - use insert instead of upsert to avoid conflicts
          const { error: insertError } = await supabase
            .from('subscriptions')
            .upsert({
              user_id: user.id,
              plan_id: plan.id,
              status: 'active',
              is_annual: isAnnual,
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,plan_id,is_annual',
              ignoreDuplicates: false
            });

          if (insertError) {
            console.error('[Success] Error creating new subscription:', insertError);
            throw new Error('Failed to update subscription');
          }

          // Initialize token balance for new plan
          const { error: tokenError } = await supabase.rpc('initialize_token_balance', {
            user_uuid: user.id,
            token_amount: tokenAmount
          });

          if (tokenError) {
            console.error('[Success] Plan token initialization error:', tokenError);
            throw new Error('Failed to initialize plan tokens');
          }

          if (mounted) {
            toast.success(`Successfully upgraded to ${plan.name}!`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            navigate('/', { replace: true });
          }
        }

      } catch (error) {
        console.error('[Success] Error processing success:', error);
        if (mounted) {
          setError(error instanceof Error ? error.message : 'Failed to process your purchase');
          setIsProcessing(false);
        }
      }
    };

    processSuccess();

    return () => {
      mounted = false;
    };
  }, [searchParams, navigate]);

  if (error) {
    return (
      <PageLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <h1 className="text-3xl font-bold text-bolt-elements-textPrimary mb-4">
            Error Processing Purchase
          </h1>
          <p className="text-bolt-elements-textSecondary mb-8">
            {error}
          </p>
          <button
            onClick={() => navigate('/subscription/plans')}
            className="inline-block bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text px-6 py-3 rounded-md hover:bg-bolt-elements-button-primary-backgroundHover"
          >
            Return to Plans
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 text-bolt-elements-loader-progress">
            <div className="i-svg-spinners:90-ring-with-bg w-full h-full" />
          </div>
          <h1 className="text-3xl font-bold text-bolt-elements-textPrimary">
            Processing Your Purchase
          </h1>
          <p className="text-bolt-elements-textSecondary">
            Please wait while we set up your account...
          </p>
        </div>
      </div>
    </PageLayout>
  );
}