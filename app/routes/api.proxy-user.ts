import { json } from '@remix-run/cloudflare';

export async function action({ request }: { request: Request }) {
  const url = new URL(request.url);
  
  // Extract the path after /apa/proxy
  const proxyPath = url.pathname.replace('/api/proxy', '');
  
  // Determine target domain based on path or query params
  const exchangeName = url.searchParams.get('exchange') || 'binance';
  const targetDomain = exchangeName === 'binanceus' 
    ? 'https://10xtraders.ai' 
    : 'https://eu.10xtraders.ai';
  
  const targetUrl = `${targetDomain}${proxyPath}${url.search}`;
  
  console.log('[Proxy] Forwarding request:', {
    originalPath: url.pathname,
    proxyPath,
    targetUrl,
    method: request.method,
    exchangeName
  });
  
  try {
    // Forward the request with all headers
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        // Add CORS headers for the response
        'Access-Control-Allow-Origin': 'https://10xtraders.ai',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.text() 
        : undefined,
    });
    
    // Get response data
    const responseData = await response.text();
    
    console.log('[Proxy] Response:', {
      status: response.status,
      statusText: response.statusText,
      dataLength: responseData.length
    });
    
    // Return response with CORS headers
    return new Response(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': 'https://10xtraders.ai',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error('[Proxy] Error forwarding request:', error);
    return json({ 
      error: 'Proxy request failed', 
      details: error instanceof Error ? error.message : String(error) 
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://10xtraders.ai',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }
}

export async function loader({ request }: { request: Request }) {
  // Handle GET requests through the same proxy logic
  return action({ request });
}