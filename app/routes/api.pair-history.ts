import { json } from '@remix-run/cloudflare';
import { supabase } from '~/lib/superbase/client';

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pair = url.searchParams.get('pair');
  const timeframe = url.searchParams.get('timeframe');
  const strategy = url.searchParams.get('strategy');
  const timerange = url.searchParams.get('timerange');
  
  if (!pair || !timeframe || !strategy) {
    return json({ 
      error: 'Missing required parameters: pair, timeframe, and strategy are required' 
    }, { status: 400 });
  }
  
  try {
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    // Build the authorization header
    const authHeader = 'Basic ' + btoa(`meghan:${user.id}`);
    
    // Construct the API URL for pair history
    const apiUrl = new URL(`https://10xtraders.ai/user/${strategy}/api/v1/pair_history`);
    apiUrl.searchParams.set('pair', pair);
    apiUrl.searchParams.set('timeframe', timeframe);
    apiUrl.searchParams.set('strategy', strategy);
    
    if (timerange) {
      apiUrl.searchParams.set('timerange', timerange);
    }
    
    console.log('[PairHistory] Fetching from:', apiUrl.toString());
    
    // Forward the request to the Freqtrade API
    const response = await fetch(apiUrl.toString(), {
      headers: { 
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PairHistory] API Error:', response.status, errorText);
      
      try {
        const errorData = JSON.parse(errorText);
        return json(errorData, { status: response.status });
      } catch {
        return json({ 
          error: `API request failed: ${response.status} ${response.statusText}`,
          details: errorText 
        }, { status: response.status });
      }
    }
    
    const data = await response.json();
    console.log('[PairHistory] Success, received', Array.isArray(data) ? data.length : 'non-array', 'records');
    
    return json(data);
  } catch (error) {
    console.error('[PairHistory] Error:', error);
    return json({ 
      error: 'Failed to fetch pair history', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}