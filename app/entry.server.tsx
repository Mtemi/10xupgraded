import type { AppLoadContext, EntryContext } from '@remix-run/cloudflare';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';
import { themeStore } from '~/lib/stores/theme';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const readable = await renderToReadableStream(<RemixServer context={remixContext} url={request.url} />, {
    signal: request.signal,
    onError(error: unknown) {
      console.error(error);
      responseStatusCode = 500;
    },
  });

  const body = new ReadableStream({
    start(controller) {
      const head = renderHeadToString({ request, remixContext, Head });

      controller.enqueue(
        new Uint8Array(
          new TextEncoder().encode(
            `<!DOCTYPE html><html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body><div id="root" class="w-full h-full">`,
          ),
        ),
      );

      const reader = readable.getReader();

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              controller.enqueue(new Uint8Array(new TextEncoder().encode(`</div></body></html>`)));
              controller.close();

              return;
            }

            controller.enqueue(value);
            read();
          })
          .catch((error) => {
            controller.error(error);
            readable.cancel();
          });
      }
      read();
    },

    cancel() {
      readable.cancel();
    },
  });

  if (isbot(request.headers.get('user-agent') || '')) {
    await readable.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');

  responseHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
  responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

  responseHeaders.set('Content-Security-Policy', [
    "default-src 'self'",

    // allow blobs & data frames (used by charting libs / helpers)
    "frame-src 'self' blob: data: https://www.youtube.com https://www.youtube-nocookie.com https://stackblitz.com https://www.googletagmanager.com",
    "child-src 'self' blob: data: https://www.youtube.com https://www.youtube-nocookie.com https://www.googletagmanager.com",

    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",

    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://*.googleadservices.com https://www.clarity.ms https://scripts.clarity.ms",

    "media-src 'self' https://*.googlevideo.com https://*.youtube.com",

    "connect-src 'self' https: wss: https://*.supabase.co https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com https://googleads.g.doubleclick.net https://*.googleadservices.com https://www.google.com https://www.clarity.ms https://scripts.clarity.ms https://fonts.googleapis.com https://fonts.gstatic.com https://eu.10xtraders.ai https://10xtraders.ai https://*.10xtraders.ai",

    "img-src 'self' data: https://i.ytimg.com https://*.ytimg.com https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://www.googleadservices.com https://*.g.doubleclick.net https://www.google.com https://www.google.co.ke https://lh3.googleusercontent.com https://c.clarity.ms https://c.bing.com https://bat.bing.com https://www.bing.com https://eu.10xtraders.ai https://10xtraders.ai https://*.10xtraders.ai",

    "connect-src 'self' https: wss: https://*.supabase.co https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com https://googleads.g.doubleclick.net https://*.googleadservices.com https://www.google.com https://www.clarity.ms https://scripts.clarity.ms https://fonts.googleapis.com https://fonts.gstatic.com https://eu.10xtraders.ai https://10xtraders.ai https://*.10xtraders.ai",
    "worker-src 'self' blob:"
  ].join('; '));

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
