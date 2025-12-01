import { json } from '@remix-run/cloudflare';
import { streamText } from '~/lib/.server/llm/stream-text';

export async function action({ request, context }: { request: Request; context: any }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { prompt } = await request.json();

    const result = await streamText([{
      role: 'user',
      content: prompt
    }], context.cloudflare.env);

    return new Response(result.toAIStream(), {
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error) {
    console.error('Error in AI analysis:', error);
    return json({ error: 'Failed to process AI analysis' }, { status: 500 });
  }
}