import { json } from '@remix-run/cloudflare';
import { supabase } from '~/lib/superbase/client';

export async function loader({ request }: { request: Request }) {
  try {
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return json({
        error: 'Not authenticated',
        features: {
          maxPaperBots: 1,
          maxLiveBots: 0,
          notificationChannels: ['Email'],
          supportLevel: 'Community',
          planName: 'Free',
          tokensIncluded: 5000
        }
      }, { status: 401 });
    }

    // Get user's subscription features using RPC function
    const { data: features, error: featuresError } = await supabase.rpc(
      'get_user_subscription_features',
      { user_uuid: user.id }
    );

    if (featuresError) {
      console.error('Error fetching subscription features:', featuresError);
      throw featuresError;
    }

    // Format the response
    return json({
      features: {
        maxPaperBots: features.max_paper_bots,
        maxLiveBots: features.max_live_bots,
        notificationChannels: features.notification_channels,
        supportLevel: features.support_level,
        planName: features.plan_name,
        tokensIncluded: features.tokens_included
      }
    });
  } catch (error) {
    console.error('Error in subscription features API:', error);
    return json({
      error: 'Failed to fetch subscription features',
      features: {
        maxPaperBots: 1,
        maxLiveBots: 0,
        notificationChannels: ['Email'],
        supportLevel: 'Community',
        planName: 'Free',
        tokensIncluded: 5000
      }
    }, { status: 500 });
  }
}