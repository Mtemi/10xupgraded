import { json } from '@remix-run/cloudflare';

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const botName = url.searchParams.get('botName');
  const userId = url.searchParams.get('userId');
  
  if (!botName || !userId) {
    return json({ error: 'Missing required parameters' }, { status: 400 });
  }
  
  try {
    // Forward the request to the Flask backend
    const response = await fetch(`/apa/podstatus?botName=${botName}&userId=${userId}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      return json(errorData, { status: response.status });
    }
    
    const data = await response.json();
    return json(data);
  } catch (error) {
    console.error('Error fetching pod status:', error);
    return json({ 
      error: 'Failed to fetch pod status', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}