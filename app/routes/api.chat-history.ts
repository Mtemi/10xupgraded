import { json } from '@remix-run/cloudflare';
import { supabase } from '~/lib/superbase/client';

export async function loader({ request }: { request: Request }) {
  try {
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) {
      return json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get chat history for user
    const { data, error } = await supabase.rpc('get_user_chat_history');
    
    if (error) {
      console.error('Error fetching chat history:', error);
      return json({ error: 'Failed to fetch chat history' }, { status: 500 });
    }
    
    return json({ chats: data });
  } catch (error) {
    console.error('Error in chat history API:', error);
    return json({ 
      error: 'Failed to fetch chat history',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  
  try {
    const { id, urlId, description, messages } = await request.json();
    
    if (!id) {
      return json({ error: 'Chat ID is required' }, { status: 400 });
    }
    
    // Save chat history
    const { error } = await supabase.rpc('save_chat_history', {
      p_id: id,
      p_url_id: urlId || id,
      p_description: description || 'New Chat',
      p_messages: messages
    });
    
    if (error) {
      console.error('Error saving chat history:', error);
      return json({ error: 'Failed to save chat history' }, { status: 500 });
    }
    
    return json({ success: true });
  } catch (error) {
    console.error('Error in chat history API:', error);
    return json({ 
      error: 'Failed to save chat history',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}