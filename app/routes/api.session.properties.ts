import { json } from '@remix-run/cloudflare';

export async function loader() {
  return json({
    properties: {
      // Add any session properties you need here
      initialized: true,
      timestamp: new Date().toISOString()
    }
  });
}
