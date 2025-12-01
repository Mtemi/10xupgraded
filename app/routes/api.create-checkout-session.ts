import { json } from '@remix-run/cloudflare';
import type { Stripe } from 'stripe';
import { supabase } from '~/lib/superbase/client';

export async function action({ request, context }: { request: Request; context: any }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Import Stripe dynamically to avoid bundling issues
    const { default: StripeConstructor } = await import('stripe');
    const stripe = new StripeConstructor(context.cloudflare.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: StripeConstructor.createFetchHttpClient(),
      typescript: true
    });

    const { priceId, userId, isTokenPurchase, isSubscription = true, isAnnual = false } = await request.json();

    if (!userId) {
      throw new Error('User ID is required');
    }

    console.log('Checkout session request:', { priceId, userId, isTokenPurchase, isAnnual });

    // Get origin for success/cancel URLs
    const origin = request.headers.get('origin') || request.headers.get('referer');
    if (!origin) {
      throw new Error('No origin found in request');
    }

    // Get plan details for metadata
    let metadata: Record<string, string> = {};
    
    if (isTokenPurchase) {
      metadata = {
        type: 'token_purchase',
        tokens: '40000', // Fixed token amount for direct purchases
        user_id: userId
      };
    } else {
      // Query for plan based on either monthly or annual price ID
      let query = supabase
        .from('subscription_plans')
        .select('id, name, tokens_included, tokens_annual');
      
      if (isAnnual) {
        query = query.eq('stripe_annual_price_id', priceId);
      } else {
        query = query.eq('stripe_price_id', priceId);
      }
      
      const { data: plan, error: planError } = await query.single();

      if (planError) {
        console.error('Error fetching plan:', planError, { priceId, isAnnual });
        throw new Error(`Failed to fetch plan details for price ID: ${priceId}`);
      }

      if (!plan) {
        throw new Error(`Plan not found for price ID: ${priceId}`);
      }

      const tokenAmount = isAnnual ? plan.tokens_annual : plan.tokens_included;

      metadata = {
        type: 'subscription',
        plan_name: plan.name,
        tokens_included: tokenAmount.toString(),
        user_id: userId,
        billing_cycle: isAnnual ? 'annual' : 'monthly'
      };
    }

    console.log('Creating checkout session with metadata:', metadata);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: isTokenPurchase ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}&type=${isTokenPurchase ? 'token' : 'subscription'}&price_id=${priceId}&is_annual=${isAnnual}`,
      cancel_url: `${origin}/subscription/plans`,
      client_reference_id: userId,
      metadata
    });

    if (!session.url) {
      throw new Error('Failed to create checkout session URL');
    }

    console.log('Checkout session created:', { sessionId: session.id, url: session.url });
    return json({ sessionUrl: session.url });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return json({ 
      error: error instanceof Error ? error.message : 'Failed to create checkout session' 
    }, { status: 500 });
  }
}
