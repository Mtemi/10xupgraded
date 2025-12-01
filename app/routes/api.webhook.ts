import { json } from '@remix-run/cloudflare';
import Stripe from 'stripe';
import { supabase } from '~/lib/superbase/client';

export async function action({ request, context }: { request: Request; context: any }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const stripe = new Stripe(context.cloudflare.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
    typescript: true
  });

  const endpointSecret = context.cloudflare.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get('stripe-signature');
  const payload = await request.text();

  try {
    // Log the incoming webhook for debugging
    console.log('Received webhook:', {
      signature: sig?.substring(0, 20) + '...',
      payloadPreview: payload.substring(0, 100) + '...'
    });

    const event = stripe.webhooks.constructEvent(payload, sig!, endpointSecret);
    console.log('Webhook event:', {
      type: event.type,
      mode: event.livemode ? 'live' : 'test',
      id: event.id
    });

    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id!;

        console.log('[Webhook] Processing completed checkout session:', {
          userId,
          sessionId: session.id,
          mode: session.mode,
          metadata: session.metadata
        });

        try {
          if (session.metadata?.type === 'token_purchase') {
            console.log('[Webhook] Processing token purchase');
            const tokensToAdd = parseInt(session.metadata.tokens);

            // Get current token balance
            const { data: currentBalance, error: balanceError } = await supabase.rpc('get_remaining_tokens', {
              user_uuid: userId
            });

            if (balanceError) {
              console.error('[Webhook] Error fetching current token balance:', balanceError);
              throw balanceError;
            }

            console.log('[Webhook] Current token balance:', currentBalance);

            // Update token balance using RPC function
            const { data: updateResult, error: updateError } = await supabase.rpc('add_tokens_to_balance', {
              user_uuid: userId,
              tokens_to_add: tokensToAdd
            });

            if (updateError) {
              console.error('[Webhook] Error updating token balance:', updateError);
              throw updateError;
            }

            console.log('[Webhook] Token balance updated:', {
              userId,
              tokensAdded: tokensToAdd,
              updateResult
            });

            // Record the token purchase in token_usage table
            const { error: usageError } = await supabase
              .from('token_usage')
              .insert({
                user_id: userId,
                tokens_used: -tokensToAdd, // Negative indicates addition
                operation_type: 'token_purchase'
              });

            if (usageError) {
              console.error('[Webhook] Error recording token usage:', usageError);
              throw usageError;
            }

            // Get final balance after update
            const { data: newBalance, error: newBalanceError } = await supabase.rpc('get_remaining_tokens', {
              user_uuid: userId
            });

            if (newBalanceError) {
              console.error('[Webhook] Error fetching new token balance:', newBalanceError);
              throw newBalanceError;
            }

            console.log('[Webhook] New token balance:', newBalance);
          } else {
            // Handle regular subscription
            console.log('[Webhook] Processing subscription purchase');
            
            // Only process if this is a subscription mode
            if (session.mode !== 'subscription') {
              console.log('[Webhook] Not a subscription mode, skipping subscription processing');
              return json({ received: true });
            }
            
            // Get subscription details
            const subscriptionId = session.subscription as string;
            if (!subscriptionId) {
              console.log('[Webhook] No subscription ID found, skipping');
              return json({ received: true });
            }
            
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const priceId = subscription.items.data[0].price.id;
            // Determine if this is an annual subscription
            const isAnnual = session.metadata?.billing_cycle === 'annual' || 
                            subscription.items.data[0].plan.interval === 'year';

            // Get plan from Supabase
            const { data: plan, error: planError } = await supabase
              .from('subscription_plans')
              .select('id, tokens_included, tokens_annual')
              .or(`stripe_price_id.eq.${priceId},stripe_annual_price_id.eq.${priceId}`)
              .single();

            if (planError) {
              console.error('[Webhook] Error fetching plan:', planError);
              throw planError;
            }

            if (!plan) {
              throw new Error('[Webhook] Plan not found');
            }
            
            // Determine token amount based on billing cycle
            const tokenAmount = isAnnual ? plan.tokens_annual : plan.tokens_included;
            console.log('[Webhook] Plan details:', { 
              planId: plan.id, 
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
              .eq('user_id', userId)
              .eq('status', 'active');

            if (updateError) {
              console.error('[Webhook] Error cancelling old subscription:', updateError);
            }

            // Create/Update subscription in Supabase
            const { error: subscriptionError } = await supabase
              .from('subscriptions')
              .upsert({
                user_id: userId,
                plan_id: plan.id,
                status: 'active',
                stripe_subscription_id: subscriptionId,
                current_period_start: new Date(subscription.current_period_start * 1000),
                current_period_end: new Date(subscription.current_period_end * 1000),
                is_annual: isAnnual,
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'stripe_subscription_id',
                ignoreDuplicates: false
              });

            if (subscriptionError) {
              console.error('[Webhook] Error updating subscription:', subscriptionError);
              throw subscriptionError;
            }

            console.log('[Webhook] Successfully processed subscription purchase:', {
              userId,
              planId: plan.id,
              tokensIncluded: tokenAmount,
              isAnnual
            });
          }
        } catch (error) {
          console.error('[Webhook] Failed to process checkout session:', error);
          throw error;
        }
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Processing subscription update:', subscription.id);
        
        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000),
            current_period_end: new Date(subscription.current_period_end * 1000),
            cancel_at_period_end: subscription.cancel_at_period_end,
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('Error updating subscription:', error);
          throw error;
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Processing subscription deletion:', subscription.id);
        
        const { error } = await supabase
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('Error canceling subscription:', error);
          throw error;
        }
        break;
      }
    }

    return json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return json({ error: 'Webhook error' }, { status: 400 });
  }
}