import { json } from '@remix-run/cloudflare';
import { supabase } from '~/lib/superbase/client';

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const botName = url.searchParams.get('botName');
  const userId = url.searchParams.get('userId');
  const lines = url.searchParams.get('lines') || '100';
  
  if (!botName || !userId) {
    return json({ error: 'Missing required parameters' }, { status: 400 });
  }
  
  try {
    // Forward the request to the Flask backend
    const response = await fetch(`/apa/podlogs?botName=${botName}&userId=${userId}&lines=${lines}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText, {
        status: response.status,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    const logsText = await response.text();
    return new Response(logsText, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error) {
    console.error('Error fetching pod logs:', error);
    return new Response('Failed to fetch pod logs', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}