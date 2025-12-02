// vite.config.ts
import { cloudflareDevProxyVitePlugin as remixCloudflareDevProxy, vitePlugin as remixVitePlugin } from "file:///home/project/node_modules/@remix-run/dev/dist/index.js";
import UnoCSS from "file:///home/project/node_modules/unocss/dist/vite.mjs";
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import "file:///home/project/node_modules/vite-plugin-node-polyfills/dist/index.js";
import { optimizeCssModules } from "file:///home/project/node_modules/vite-plugin-optimize-css-modules/dist/index.mjs";
import tsconfigPaths from "file:///home/project/node_modules/vite-tsconfig-paths/dist/index.mjs";
var vite_config_default = defineConfig((config) => {
  return {
    build: {
      target: "esnext",
      rollupOptions: {
        external: ["/charting_library/charting_library.standalone.js"]
      }
    },
    define: {
      // Suppress some warnings
      "process.env.NODE_ENV": JSON.stringify(config.mode || "development")
    },
    css: {
      preprocessorOptions: {
        scss: {
          // Suppress deprecation warnings
          quietDeps: true,
          silenceDeprecations: ["legacy-js-api", "import"]
        }
      }
    },
    server: {
      host: "0.0.0.0",
      // Allow access from network devices
      headers: {
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "cross-origin"
      }
    },
    ssr: {
      external: ["path-browserify", "buffer"],
      noExternal: ["@webcontainer/api"],
      resolve: {
        conditions: ["node"]
      }
    },
    optimizeDeps: {
      exclude: ["@webcontainer/api"],
      include: ["buffer", "path-browserify"]
    },
    plugins: [
      config.mode !== "test" && remixCloudflareDevProxy(),
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true
        }
      }),
      UnoCSS(),
      tsconfigPaths(),
      chrome129IssuePlugin(),
      config.mode === "production" && optimizeCssModules({ apply: "build" })
    ].filter(Boolean),
    resolve: {
      alias: {
        "@tradingview/charting_library": "/charting_library/charting_library.standalone.js",
        ...config.command === "build" && !config.mode?.includes("ssr") ? {
          "path": "path-browserify",
          "buffer": "buffer/"
        } : {}
      }
    }
  };
});
function chrome129IssuePlugin() {
  return {
    name: "chrome129IssuePlugin",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.headers["user-agent"]?.match(/Chrom(e|ium)\/([0-9]+)\./);
        if (raw) {
          const version = parseInt(raw[2], 10);
          if (version === 129) {
            res.setHeader("content-type", "text/html");
            res.end(
              '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development, see <a href="https://github.com/stackblitz/bolt.new/issues/86#issuecomment-2395519258">for more information.</a></p><p><b>Note:</b> This only impacts <u>local development</u>. `pnpm run build` and `pnpm run start` will work fine in this browser.</p></body>'
            );
            return;
          }
        }
        next();
      });
    }
  };
}
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBjbG91ZGZsYXJlRGV2UHJveHlWaXRlUGx1Z2luIGFzIHJlbWl4Q2xvdWRmbGFyZURldlByb3h5LCB2aXRlUGx1Z2luIGFzIHJlbWl4Vml0ZVBsdWdpbiB9IGZyb20gJ0ByZW1peC1ydW4vZGV2JztcbmltcG9ydCBVbm9DU1MgZnJvbSAndW5vY3NzL3ZpdGUnO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnLCB0eXBlIFZpdGVEZXZTZXJ2ZXIgfSBmcm9tICd2aXRlJztcbmltcG9ydCB7IG5vZGVQb2x5ZmlsbHMgfSBmcm9tICd2aXRlLXBsdWdpbi1ub2RlLXBvbHlmaWxscyc7XG5pbXBvcnQgeyBvcHRpbWl6ZUNzc01vZHVsZXMgfSBmcm9tICd2aXRlLXBsdWdpbi1vcHRpbWl6ZS1jc3MtbW9kdWxlcyc7XG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tICd2aXRlLXRzY29uZmlnLXBhdGhzJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKChjb25maWcpID0+IHtcbiAgcmV0dXJuIHtcbiAgICBidWlsZDoge1xuICAgICAgdGFyZ2V0OiAnZXNuZXh0JyxcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgICAgZXh0ZXJuYWw6IFsnL2NoYXJ0aW5nX2xpYnJhcnkvY2hhcnRpbmdfbGlicmFyeS5zdGFuZGFsb25lLmpzJ11cbiAgICAgIH1cbiAgICB9LFxuICAgIGRlZmluZToge1xuICAgICAgLy8gU3VwcHJlc3Mgc29tZSB3YXJuaW5nc1xuICAgICAgJ3Byb2Nlc3MuZW52Lk5PREVfRU5WJzogSlNPTi5zdHJpbmdpZnkoY29uZmlnLm1vZGUgfHwgJ2RldmVsb3BtZW50JyksXG4gICAgfSxcbiAgICBjc3M6IHtcbiAgICAgIHByZXByb2Nlc3Nvck9wdGlvbnM6IHtcbiAgICAgICAgc2Nzczoge1xuICAgICAgICAgIC8vIFN1cHByZXNzIGRlcHJlY2F0aW9uIHdhcm5pbmdzXG4gICAgICAgICAgcXVpZXREZXBzOiB0cnVlLFxuICAgICAgICAgIHNpbGVuY2VEZXByZWNhdGlvbnM6IFsnbGVnYWN5LWpzLWFwaScsICdpbXBvcnQnXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIGhvc3Q6ICcwLjAuMC4wJywgLy8gQWxsb3cgYWNjZXNzIGZyb20gbmV0d29yayBkZXZpY2VzXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDcm9zcy1PcmlnaW4tRW1iZWRkZXItUG9saWN5JzogJ3JlcXVpcmUtY29ycCcsXG4gICAgICAgICdDcm9zcy1PcmlnaW4tT3BlbmVyLVBvbGljeSc6ICdzYW1lLW9yaWdpbicsXG4gICAgICAgICdDcm9zcy1PcmlnaW4tUmVzb3VyY2UtUG9saWN5JzogJ2Nyb3NzLW9yaWdpbicsXG4gICAgICB9LFxuICAgIH0sXG4gICAgc3NyOiB7XG4gICAgICBleHRlcm5hbDogWydwYXRoLWJyb3dzZXJpZnknLCAnYnVmZmVyJ10sXG4gICAgICBub0V4dGVybmFsOiBbJ0B3ZWJjb250YWluZXIvYXBpJ10sXG4gICAgICByZXNvbHZlOiB7XG4gICAgICAgIGNvbmRpdGlvbnM6IFsnbm9kZSddLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG9wdGltaXplRGVwczoge1xuICAgICAgZXhjbHVkZTogWydAd2ViY29udGFpbmVyL2FwaSddLFxuICAgICAgaW5jbHVkZTogWydidWZmZXInLCAncGF0aC1icm93c2VyaWZ5J10sXG4gICAgfSxcbiAgICBwbHVnaW5zOiBbXG4gICAgICBjb25maWcubW9kZSAhPT0gJ3Rlc3QnICYmIHJlbWl4Q2xvdWRmbGFyZURldlByb3h5KCksXG4gICAgICByZW1peFZpdGVQbHVnaW4oe1xuICAgICAgICBmdXR1cmU6IHtcbiAgICAgICAgICB2M19mZXRjaGVyUGVyc2lzdDogdHJ1ZSxcbiAgICAgICAgICB2M19yZWxhdGl2ZVNwbGF0UGF0aDogdHJ1ZSxcbiAgICAgICAgICB2M190aHJvd0Fib3J0UmVhc29uOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBVbm9DU1MoKSxcbiAgICAgIHRzY29uZmlnUGF0aHMoKSxcbiAgICAgIGNocm9tZTEyOUlzc3VlUGx1Z2luKCksXG4gICAgICBjb25maWcubW9kZSA9PT0gJ3Byb2R1Y3Rpb24nICYmIG9wdGltaXplQ3NzTW9kdWxlcyh7IGFwcGx5OiAnYnVpbGQnIH0pLFxuICAgIF0uZmlsdGVyKEJvb2xlYW4pLFxuICAgIHJlc29sdmU6IHtcbiAgICAgIGFsaWFzOiB7XG4gICAgICAgICdAdHJhZGluZ3ZpZXcvY2hhcnRpbmdfbGlicmFyeSc6ICcvY2hhcnRpbmdfbGlicmFyeS9jaGFydGluZ19saWJyYXJ5LnN0YW5kYWxvbmUuanMnLFxuICAgICAgICAuLi4oY29uZmlnLmNvbW1hbmQgPT09ICdidWlsZCcgJiYgIWNvbmZpZy5tb2RlPy5pbmNsdWRlcygnc3NyJykgPyB7XG4gICAgICAgICdwYXRoJzogJ3BhdGgtYnJvd3NlcmlmeScsXG4gICAgICAgICdidWZmZXInOiAnYnVmZmVyLycsXG4gICAgICAgIH0gOiB7fSlcbiAgICAgIH1cbiAgICB9XG4gIH07XG59KTtcblxuZnVuY3Rpb24gY2hyb21lMTI5SXNzdWVQbHVnaW4oKSB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogJ2Nocm9tZTEyOUlzc3VlUGx1Z2luJyxcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyOiBWaXRlRGV2U2VydmVyKSB7XG4gICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgICAgICBjb25zdCByYXcgPSByZXEuaGVhZGVyc1sndXNlci1hZ2VudCddPy5tYXRjaCgvQ2hyb20oZXxpdW0pXFwvKFswLTldKylcXC4vKTtcblxuICAgICAgICBpZiAocmF3KSB7XG4gICAgICAgICAgY29uc3QgdmVyc2lvbiA9IHBhcnNlSW50KHJhd1syXSwgMTApO1xuXG4gICAgICAgICAgaWYgKHZlcnNpb24gPT09IDEyOSkge1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignY29udGVudC10eXBlJywgJ3RleHQvaHRtbCcpO1xuICAgICAgICAgICAgcmVzLmVuZChcbiAgICAgICAgICAgICAgJzxib2R5PjxoMT5QbGVhc2UgdXNlIENocm9tZSBDYW5hcnkgZm9yIHRlc3RpbmcuPC9oMT48cD5DaHJvbWUgMTI5IGhhcyBhbiBpc3N1ZSB3aXRoIEphdmFTY3JpcHQgbW9kdWxlcyAmIFZpdGUgbG9jYWwgZGV2ZWxvcG1lbnQsIHNlZSA8YSBocmVmPVwiaHR0cHM6Ly9naXRodWIuY29tL3N0YWNrYmxpdHovYm9sdC5uZXcvaXNzdWVzLzg2I2lzc3VlY29tbWVudC0yMzk1NTE5MjU4XCI+Zm9yIG1vcmUgaW5mb3JtYXRpb24uPC9hPjwvcD48cD48Yj5Ob3RlOjwvYj4gVGhpcyBvbmx5IGltcGFjdHMgPHU+bG9jYWwgZGV2ZWxvcG1lbnQ8L3U+LiBgcG5wbSBydW4gYnVpbGRgIGFuZCBgcG5wbSBydW4gc3RhcnRgIHdpbGwgd29yayBmaW5lIGluIHRoaXMgYnJvd3Nlci48L3A+PC9ib2R5PicsXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSGVhZGVycyBhcmUgbm93IHNldCBpbiBzZXJ2ZXIgY29uZmlnIHRvIGF2b2lkIGR1cGxpY2F0ZXNcblxuICAgICAgICBuZXh0KCk7XG4gICAgICB9KTtcbiAgICB9LFxuICB9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
