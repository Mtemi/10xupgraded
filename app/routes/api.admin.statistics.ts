import { json, type LoaderFunction } from '@remix-run/cloudflare';
import { createClient } from '@supabase/supabase-js';

interface BotInfo {
  id: string;
  name: string;
  exchange: string;
  status: string;
  open_trades: number;
  created_at: string;
}

interface UserStatistics {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  bot_count: number;
  bots: BotInfo[];
  subscription_plan: string;
  subscription_status: string;
  subscription_expiry: string | null;
  token_balance: number;
  is_admin: boolean;
}

interface SystemStats {
  total_users: number;
  active_users_today: number;
  total_bots: number;
  running_bots: number;
  total_open_trades: number;
  total_subscriptions: number;
  active_subscriptions: number;
}

export const loader: LoaderFunction = async ({ request, context }) => {
  try {
    const env = context.cloudflare?.env as any;

    // Verify the requesting user is an admin
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create regular client to verify the user's auth
    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const isAdmin = user.app_metadata?.is_admin === true ||
                   user.email === '10xtraders.ai@gmail.com' ||
                   user.email === 'bmutua350@gmail.com';

    if (!isAdmin) {
      return json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get the service role client (bypasses RLS to fetch all data)
    const supabaseAdmin = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log('[API Admin Statistics] Fetching all data using service role...');

    // Fetch all users from auth
    const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      console.error('[API Admin Statistics] Error fetching users:', authError);
      return json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    console.log('[API Admin Statistics] Found', users.length, 'users');

    // Fetch ALL bot configurations (bypasses RLS with service role)
    const { data: allBots, error: botsError } = await supabaseAdmin
      .from('bot_configurations')
      .select('*')
      .order('created_at', { ascending: false });

    if (botsError) {
      console.error('[API Admin Statistics] Error fetching bots:', botsError);
      return json({ error: 'Failed to fetch bot configurations' }, { status: 500 });
    }

    console.log('[API Admin Statistics] Found', allBots?.length || 0, 'total bots');

    // Fetch ALL subscriptions (bypasses RLS with service role)
    const { data: allSubscriptions, error: subsError } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        subscription_plans (
          name,
          tokens_included
        )
      `);

    if (subsError) {
      console.error('[API Admin Statistics] Error fetching subscriptions:', subsError);
    }

    console.log('[API Admin Statistics] Found', allSubscriptions?.length || 0, 'subscriptions');

    // Process user statistics
    const userStats: UserStatistics[] = await Promise.all(
      users.map(async (u) => {
        // Get user's bots
        const userBots = (allBots || []).filter(bot => bot.user_id === u.id);

        // Get user's subscription
        const userSub = (allSubscriptions || []).find(sub => sub.user_id === u.id);

        // Get token balance (you may need to adjust this based on your schema)
        let tokenBalance = 0;
        try {
          const { data: tokenData } = await supabaseAdmin.rpc('get_remaining_tokens', {
            user_uuid: u.id
          });
          tokenBalance = tokenData || 0;
        } catch (err) {
          console.warn('[API Admin Statistics] Could not fetch tokens for user:', u.id);
        }

        // Determine subscription details
        const subscriptionPlan = userSub?.subscription_plans?.name || 'free';
        const subscriptionStatus = userSub?.status || 'inactive';
        const subscriptionExpiry = userSub?.current_period_end || null;

        // Check if user is admin
        const userIsAdmin = u.app_metadata?.is_admin === true ||
                          u.email === '10xtraders.ai@gmail.com' ||
                          u.email === 'bmutua350@gmail.com';

        // Map bots with basic info
        const botInfos: BotInfo[] = userBots.map(bot => ({
          id: bot.id,
          name: bot.name || 'Unnamed Bot',
          exchange: getExchangeFromConfig(bot.config),
          status: bot.status || 'Not Deployed',
          open_trades: bot.open_trades || 0,
          created_at: bot.created_at
        }));

        return {
          id: u.id,
          email: u.email || 'unknown',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          bot_count: userBots.length,
          bots: botInfos,
          subscription_plan: subscriptionPlan,
          subscription_status: subscriptionStatus,
          subscription_expiry: subscriptionExpiry,
          token_balance: tokenBalance,
          is_admin: userIsAdmin
        };
      })
    );

    // Calculate system statistics
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Count deployed bots: all bots where status is NOT "NotFound" and NOT "Not Deployed"
    // This includes: Running, Deploying, Pending, Check Logs, etc.
    const deployedBots = (allBots || []).filter(bot => {
      const status = bot.status || '';
      return status !== 'NotFound' && status !== 'Not Deployed' && status !== '';
    });

    // Calculate total open trades from all bots
    const totalOpenTrades = (allBots || []).reduce((sum, bot) => {
      const trades = bot.open_trades || 0;
      return sum + trades;
    }, 0);

    console.log('[API Admin Statistics] Bot status breakdown:', {
      total: allBots?.length || 0,
      deployed: deployedBots.length,
      notFound: (allBots || []).filter(b => b.status === 'NotFound').length,
      notDeployed: (allBots || []).filter(b => b.status === 'Not Deployed' || !b.status).length,
      deployedStatuses: Array.from(new Set(deployedBots.map(b => b.status)))
    });

    const systemStats: SystemStats = {
      total_users: users.length,
      active_users_today: users.filter(u =>
        u.last_sign_in_at && new Date(u.last_sign_in_at) >= todayStart
      ).length,
      total_bots: allBots?.length || 0,
      running_bots: deployedBots.length, // This is the correct count of deployed bots
      total_open_trades: totalOpenTrades,
      total_subscriptions: allSubscriptions?.length || 0,
      active_subscriptions: (allSubscriptions || []).filter(sub => sub.status === 'active').length
    };

    // Get unique plan names
    const availablePlans = Array.from(
      new Set(
        (allSubscriptions || [])
          .map(sub => sub.subscription_plans?.name)
          .filter(Boolean)
          .concat(['free'])
      )
    ).sort();

    console.log('[API Admin Statistics] Returning stats:', {
      userCount: userStats.length,
      systemStats,
      availablePlans
    });

    return json({
      users: userStats,
      systemStats,
      availablePlans
    });

  } catch (error: any) {
    console.error('[API Admin Statistics] Unexpected error:', error);
    return json({ error: 'Internal server error: ' + error.message }, { status: 500 });
  }
};

// Helper function to extract exchange name from bot config
function getExchangeFromConfig(config: any): string {
  if (!config) return 'unknown';

  if (typeof config.exchange === 'string') {
    return config.exchange;
  }

  if (typeof config.exchange === 'object' && config.exchange?.name) {
    return config.exchange.name;
  }

  return 'unknown';
}
