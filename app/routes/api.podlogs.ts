import { json } from '@remix-run/cloudflare';

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const botName = url.searchParams.get('botName');
  const userId = url.searchParams.get('userId');
  const lines = url.searchParams.get('lines') || '100';
  
  if (!botName || !userId) {
    return json({ error: 'Missing required parameters: botName and userId' }, { status: 400 });
  }
  
  try {
    const backendResponse = await fetch(`/apa/podlogs?botName=${botName}&userId=${userId}&lines=${lines}`);
    
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      return new Response(errorText, {
        status: backendResponse.status,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    
    const logsText = await backendResponse.text();
    return new Response(logsText, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    console.error('Error fetching pod logs:', error);
    return new Response(`Failed to fetch pod logs: ${error instanceof Error ? error.message : String(error)}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}