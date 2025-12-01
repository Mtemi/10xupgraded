// app/routes/api.tradingview-proxy.ts
import { json } from '@remix-run/cloudflare';

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return json({ error: 'No URL provided' }, { status: 400 });
  }
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Origin': 'https://10xtraders.ai',
        'Referer': 'https://10xtraders.ai/'
      }
    });
    
    if (!response.ok) {
      return json({ error: `Failed to fetch data: ${response.statusText}` }, { status: response.status });
    }
    
    const contentType = response.headers.get('Content-Type');
    const data = contentType?.includes('application/json') ? await response.json() : await response.text();
    
    return json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType || 'application/json'
      }
    });
  } catch (error) {
    console.error('Error proxying TradingView request:', error);
    return json({ error: 'Failed to proxy request' }, { status: 500 });
  }
}
