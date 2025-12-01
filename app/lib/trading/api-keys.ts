// app/lib/scripts/storage.ts
import { supabase } from '~/lib/superbase/client';

// app/lib/trading/api-keys.ts
export async function saveApiKeys(userId: string, platformId: string, apiKey: string, apiSecret: string) {
  return await supabase
    .from('user_api_keys')
    .upsert({
      user_id: userId,
      platform_id: platformId, 
      api_key: apiKey,
      api_secret: apiSecret
    });
}

export async function getApiKeys(userId: string, platformId: string) {
  return await supabase
    .from('user_api_keys')
    .select()
    .match({ 
      user_id: userId,
      platform_id: platformId 
    })
    .single();
}
