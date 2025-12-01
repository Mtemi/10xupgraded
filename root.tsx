import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import type { MetaFunction } from "@remix-run/node";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import { useEffect } from 'react';
import { supabase } from '~/lib/superbase/client';
import { setAuthenticated } from '~/lib/stores/auth';
import { themeStore } from './lib/stores/theme';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';
import { createHead } from 'remix-island';

import 'virtual:uno.css';

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.ico',
    type: 'image/x-icon',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

// export const meta: MetaFunction = () => {
//   return [
//     { title: "10xTraders AI - Trading Strategy Builder" },
//     { property: "og:url", content: "https://10xtraders.ai/" },
//     {
//       property: "og:title",
//       content: "10xTraders AI - Trading Strategy Builder",
//     },
//     {
//       property: "og:description",
//       content:
//         "10xTraders AI helps you create AI-driven trading strategies to dominate the markets. Automate trading with ease using our advanced strategy builder.",
//     },
//     {
//       name: "description",
//       content: "10XTraders is an AI - Trading Strategy Builder platform.",
//     },
//     {
//       name: "keywords",
//       content:
//         "AI trading software, trading strategy builder, automated trading strategies, 10xTraders AI, stock trading AI, crypto trading AI, trading bot builder, algorithmic trading, Natural Language Trading Automation, AI-Powered Trading Software, TradeBotBuilder", 
//     },
//     { name: "author", content: "10xTraders AI" },
//     { name: "robots", content: "index, follow" },
//     { name: "googlebot", content: "index, follow" },
//     { name: "twitter:title", content: "10xTraders AI - Trading Strategy Builder" },
//     { name: "twitter:url", content: "https://10xtraders.ai/" },
//     {
//       name: "twitter:description",
//       content:
//         "Automate trading like never before with 10xTraders AI. Build and test custom trading strategies with AI precision. Perfect for stock, crypto, and forex trading.",
//     },
//   ];
// };

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>10xTraders AI - Trading Strategy Builder</title>
    <meta property="og:url" content="https://10xtraders.ai/"/>
    <meta property="og:title" content="10xTraders AI - Trading Strategy Builder"/>
    <meta property="og:description" content="10xTraders AI helps you create AI-driven trading strategies to dominate the markets. Automate trading with ease using our advanced strategy builder. Transform your trading with AI-powered strategies in minutes. Click to learn more."/>
    <meta name="description" content="10XTraders is an AI - Trading Strategy Builder platform. Transform your trading with AI-powered strategies in minutes. Click to learn more."/>
    <meta name="keywords" content="AI trading software, trading strategy builder, automated trading strategies, 10xTraders AI, stock trading AI, crypto trading AI, trading bot builder, algorithmic trading, Natural Language Trading Automation, AI-Powered Trading Software, TradeBotBuilder, ai powered trading bot, 10x traders, Best AI powered strategy builder, Best AI powered bot, trading strategy, AI trading strategy builder for beginners"/>
    <meta name="author" content="10xTraders AI"/>
    <meta name="robots" content="index, follow"/>
    <meta name="googlebot" content="index, follow"/>
    <meta name="twitter:title" content="10xTraders AI - Trading Strategy Builder"/>
    <meta name="twitter:url" content="https://10xtraders.ai/"/>
    <meta name="twitter:description" content="Automate trading like never before with 10xTraders AI. Build and test custom trading strategies with AI precision. Perfect for stock, crypto, and forex trading."/>
    <Meta />
    <Links />
    {/* <script src="/scripts/theme.js" defer></script> */}
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      {children}
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

export default function App() {
  const theme = useStore(themeStore);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;

    const initAuth = async () => {
      try {
        // Check initial session
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setAuthenticated(!!session);

        // Listen for auth changes
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN') {
            setAuthenticated(true);
          } else if (event === 'SIGNED_OUT') {
            setAuthenticated(false);
          }
        });

        subscription = data.subscription;
      } catch (error) {
        console.error('Error initializing auth:', error);
      }
    };

    initAuth();

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <Outlet />
      <ScrollRestoration />
      <Scripts />
    </>
  );
}
