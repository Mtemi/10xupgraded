import { redirect } from '@remix-run/cloudflare';
import { supabase } from '~/lib/superbase/client';

export async function loader({ request }: { request: Request }) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const redirectTo = searchParams.get('redirectTo') || '/';

    console.log(`[INFO ${new Date().toISOString()}] Callback URL: ${request.url}`);
    console.log(`[INFO ${new Date().toISOString()}] OAuth State (returned): ${state}`);
    console.log(`[INFO ${new Date().toISOString()}] Authorization Code: ${code}`);

    if (!code || !state) {
      console.error('[ERROR] Missing code or state in callback.');
      return redirect('/error?reason=missing_code_or_state');
    }

    // Exchange the auth code for a session using Supabase
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[ERROR] Failed to exchange code for session:', error.message);
      return redirect(`/error?reason=${encodeURIComponent(error.message)}`);
    }

    console.log(`[INFO ${new Date().toISOString()}] Successfully authenticated.`);
    return redirect(redirectTo);
  } catch (error) {
    console.error('[ERROR] Unexpected error in callback:', error);
    return redirect('/error?reason=unexpected_error');
  }
}
