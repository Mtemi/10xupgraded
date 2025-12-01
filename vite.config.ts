import { cloudflareDevProxyVitePlugin as remixCloudflareDevProxy, vitePlugin as remixVitePlugin } from '@remix-run/dev';
import UnoCSS from 'unocss/vite';
import { defineConfig, type ViteDevServer } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig((config) => {
  return {
    build: {
      target: 'esnext',
      rollupOptions: {
        external: ['/charting_library/charting_library.standalone.js']
      }
    },
    define: {
      // Suppress some warnings
      'process.env.NODE_ENV': JSON.stringify(config.mode || 'development'),
    },
    css: {
      preprocessorOptions: {
        scss: {
          // Suppress deprecation warnings
          quietDeps: true,
          silenceDeprecations: ['legacy-js-api', 'import'],
        },
      },
    },
    server: {
      host: '0.0.0.0', // Allow access from network devices
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    },
    ssr: {
      external: ['path-browserify', 'buffer'],
      noExternal: ['@webcontainer/api'],
      resolve: {
        conditions: ['node'],
      },
    },
    optimizeDeps: {
      exclude: ['@webcontainer/api'],
      include: ['buffer', 'path-browserify'],
    },
    plugins: [
      config.mode !== 'test' && remixCloudflareDevProxy(),
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
        },
      }),
      UnoCSS(),
      tsconfigPaths(),
      chrome129IssuePlugin(),
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@tradingview/charting_library': '/charting_library/charting_library.standalone.js',
        ...(config.command === 'build' && !config.mode?.includes('ssr') ? {
        'path': 'path-browserify',
        'buffer': 'buffer/',
        } : {})
      }
    }
  };
});

function chrome129IssuePlugin() {
  return {
    name: 'chrome129IssuePlugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const raw = req.headers['user-agent']?.match(/Chrom(e|ium)\/([0-9]+)\./);

        if (raw) {
          const version = parseInt(raw[2], 10);

          if (version === 129) {
            res.setHeader('content-type', 'text/html');
            res.end(
              '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development, see <a href="https://github.com/stackblitz/bolt.new/issues/86#issuecomment-2395519258">for more information.</a></p><p><b>Note:</b> This only impacts <u>local development</u>. `pnpm run build` and `pnpm run start` will work fine in this browser.</p></body>',
            );

            return;
          }
        }

        // Headers are now set in server config to avoid duplicates

        next();
      });
    },
  };
}