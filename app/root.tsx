import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
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
import { ToastContainer, toast, cssTransition } from 'react-toastify';

import 'virtual:uno.css';
import '~/lib/logger'; // Import logger to filter console noise

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
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

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>10xTraders AI – AI Crypto Trading Bots | Build, Deploy, and Scale Strategies</title>
    <meta name="description" content="Build, test, and deploy custom crypto trading bots in minutes with 10xTraders AI—a 100% cloud-based, secure platform requiring no installation—always online." />
    <meta name="keywords" content="AI trading software, trading strategy builder, automated trading strategies, 10xTraders AI, stock trading AI, crypto trading AI, forex trading AI, trading bot builder, algorithmic trading, natural language trading automation, AI-powered trading software, AI powered trading bot, 10x traders, AI trading bot platform, trading strategy, AI trading for beginners" />
    <meta name="author" content="10xTraders AI"/>
    <meta name="robots" content="index, follow"/>
    <meta name="googlebot" content="index, follow"/>
    
    {/* Open Graph / Facebook Meta Tags for Social Sharing */}
    <meta property="og:url" content="https://10xtraders.ai/" />
    <meta property="og:title" content="10xTraders AI – AI Crypto Trading Bots | Build, Deploy, and Scale Strategies" />
    <meta property="og:description" content="Build, test, and deploy fully custom crypto trading strategies with AI. 100% cloud-based, zero-install, always on, and secure by design — trade smarter on every exchange. The first Trading System as a Service (TSaaS) for crypto." />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="/assets/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="10xTraders AI - AI-Powered Crypto Trading Platform" />
    <meta property="og:site_name" content="10xTraders AI" />
    <meta property="og:locale" content="en_US" />
    
    {/* Twitter Card Meta Tags */}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@10xtradersai" />
    <meta name="twitter:creator" content="@10xtradersai" />
    <meta name="twitter:title" content="10xTraders AI – AI Crypto Trading Bots | Build, Deploy, and Scale Strategies" />
    <meta name="twitter:description" content="Automate your trading like never before with 10xTraders AI. Build and test custom trading strategies with AI precision—perfect for stock, crypto, and forex traders." />
    <meta name="twitter:image" content="/assets/og-image.png" />
    <meta name="twitter:image:alt" content="10xTraders AI - AI-Powered Crypto Trading Platform" />
    <meta name="twitter:url" content="https://10xtraders.ai/"/>
    
    {/* Additional SEO Meta Tags */}
    <meta name="theme-color" content="#00FF7F" />
    <meta name="msapplication-TileColor" content="#00FF7F" />
    <meta name="application-name" content="10xTraders AI" />
    <meta name="apple-mobile-web-app-title" content="10xTraders AI" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    
    {/* Canonical URL */}
    <link rel="canonical" href="https://10xtraders.ai/" />
    
    {/* Favicon and App Icons */}
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    
    {/* Structured Data: Organization Schema (JSON-LD) */}
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "10XTraders.AI",
          "alternateName": "10xTraders AI",
          "url": "https://10xtraders.ai/",
          "logo": "/101x.png",
          "image": "/assets/og-image.png",
          "description": "AI-powered crypto trading platform for building, testing, and deploying custom trading strategies",
          "foundingDate": "2024",
          "contactPoint": [{
            "@type": "ContactPoint",
            "contactType": "Customer Support",
            "email": "10xtraders.ai@gmail.com",
            "availableLanguage": "English"
          }],
          "sameAs": [
            "https://twitter.com/10xtradersai",
            "https://x.com/10xtradersai",
            "https://www.instagram.com/10xtraders.ai"
          ],
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "3343 Peachtree Rd NE, Ste 145-1585",
            "addressLocality": "Atlanta",
            "addressRegion": "GA",
            "postalCode": "30326",
            "addressCountry": "US"
          }
        })
      }}
    />
    
    {/* Structured Data: SoftwareApplication Schema */}
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "10xTraders AI",
          "applicationCategory": "FinanceApplication",
          "operatingSystem": "Web Browser",
          "description": "AI-powered cryptocurrency trading platform for automated strategy development and execution",
          "url": "https://10xtraders.ai/",
          "screenshot": "/assets/app-screenshot.png",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
            "description": "Free tier available with premium plans"
          },
          "publisher": {
            "@type": "Organization",
            "name": "10XTraders.AI, LLC"
          },
          "featureList": [
            "AI-powered trading strategy generation",
            "Automated trade execution",
            "Real-time market analysis",
            "Multi-exchange support",
            "Paper trading simulation",
            "Live trading capabilities"
          ]
        })
      }}
    />
    <Meta />
    <Links />
  </>
));

export default function App() {
  const theme = useStore(themeStore);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;

    const initAuth = async () => {
      try {
        // Check if Supabase is properly configured
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
          console.log('Supabase not configured - setting unauthenticated state');
          setAuthenticated(false);
          return;
        }

        // Check initial session
        const {
          data: { session },
        } = await supabase.auth.getSession();
        console.log('Initial session check:', !!session);
        setAuthenticated(!!session);

        // Listen for auth changes
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          console.log('Auth state change:', event, !!session);
          if (event === 'SIGNED_IN') {
            setAuthenticated(true);
          } else if (event === 'SIGNED_OUT') {
            setAuthenticated(false);
          }
        });

        subscription = data.subscription;
      } catch (error) {
        console.error('Error initializing auth:', error);
        // Ensure we set unauthenticated state on error
        setAuthenticated(false);
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
    <html lang="en" data-theme={theme}>
      <head>
        {/* Don't add Meta or Links here - they're already in the Head component */}
      </head>
      <body>
        <div id="root" className="w-full">
          <Outlet />
        </div>
        <ToastContainer
          containerId="main-toast-container"
          limit={3}
          closeButton={({ closeToast }) => {
            return (
              <button className="Toastify__close-button" onClick={closeToast}>
                <div className="i-ph:x text-lg" />
              </button>
            );
          }}
          icon={({ type }) => {
            switch (type) {
              case 'success': {
                return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
              }
              case 'error': {
                return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
              }
            }
            return undefined;
          }}
          position="bottom-right"
          autoClose={4000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme={theme}
          transition={toastAnimation}
        />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}