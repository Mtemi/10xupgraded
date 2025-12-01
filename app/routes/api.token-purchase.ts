import { json } from '@remix-run/cloudflare';
import Stripe from 'stripe';
import { supabase } from '~/lib/superbase/client';

const TOKENS_PER_PURCHASE = 40000;
const TOKEN_PURCHASE_PRICE = 1500; // $15.00 in cents

export async function action({ request, context }: { request: Request; context: any }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const stripe = new Stripe(context.cloudflare.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    const { userId } = await request.json();

    // Get origin for success/cancel URLs
    const origin = request.headers.get('origin') || request.headers.get('referer');
    if (!origin) {
      throw new Error('No origin found in request');
    }

    // Create Stripe checkout session for token purchase
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: '40,000 Tokens',
              description: 'Token reload for 10XTraders.AI',
            },
            unit_amount: TOKEN_PURCHASE_PRICE,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}&type=token`,
      cancel_url: `${origin}/subscription/plans`,
      client_reference_id: userId,
      metadata: {
        type: 'token_purchase',
        tokens: TOKENS_PER_PURCHASE.toString(),
      },
    });

    return json({ sessionUrl: session.url });
  } catch (error) {
    console.error('Error creating token purchase session:', error);
    return json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}