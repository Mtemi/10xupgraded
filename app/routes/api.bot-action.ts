import { json } from '@remix-run/cloudflare';
import { supabase } from '~/lib/superbase/client';

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { botId, action, strategyName } = await request.json();
    
    if (!botId || !action || !strategyName) {
      return json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) {
      return json({ error: 'User not authenticated' }, { status: 401 });
    }
    
    // Construct the API URL for the bot action
    const apiUsername = 'meghan';
    const apiPassword = user.id;
    const actionUrl = `/user/${strategyName}/api/v1/${action}`;
    
    // Make the API request to the Freqtrade REST API
    const response = await fetch(actionUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return json({ 
        error: `Failed to ${action} bot`, 
        details: errorText 
      }, { status: response.status });
    }
    
    const data = await response.json();
    
    // Return the response from the Freqtrade API
    return json({
      status: data.status,
      message: data.message,
      running: data.running !== undefined ? data.running : null,
      buying_allowed: data.buying_allowed !== undefined ? data.buying_allowed : null
    });
    
  } catch (error) {
    console.error(`Error in bot action:`, error);
    return json({ 
      error: 'Failed to process bot action', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}