import { json, type LoaderFunction } from '@remix-run/cloudflare';
import { createClient } from '@supabase/supabase-js';

export const loader: LoaderFunction = async ({ request, context }) => {
  try {
    const env = context.cloudflare?.env as any;

    // Get the service role client (has admin access)
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

    // User is admin, fetch all users using service role
    const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      console.error('[API Admin Users] Error fetching users:', authError);
      return json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Return only safe user data (no sensitive fields)
    const safeUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      app_metadata: u.app_metadata,
      user_metadata: u.user_metadata
    }));

    return json({ users: safeUsers });
  } catch (error: any) {
    console.error('[API Admin Users] Unexpected error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
