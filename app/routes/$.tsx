import { json } from '@remix-run/cloudflare';
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

// Catch-all route to handle 404s and prevent console errors
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  
  // Handle Chrome DevTools requests silently
  if (url.pathname.includes('.well-known') || 
      url.pathname.includes('devtools') ||
      url.pathname.includes('node_modules')) {
    return new Response('', { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/plain'
      }
    });
  }
  
  // For other 404s, return a proper 404 response
  throw new Response('Not Found', { status: 404 });
}

export default function CatchAll() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bolt-elements-background-depth-1">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-bolt-elements-textPrimary mb-4">404</h1>
        <p className="text-bolt-elements-textSecondary mb-6">Page not found</p>
        <a 
          href="/" 
          className="text-accent-500 hover:text-accent-400 underline"
        >
          Go back home
        </a>
      </div>
    </div>
  );
}
