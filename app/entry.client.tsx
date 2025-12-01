import { RemixBrowser } from '@remix-run/react';
import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

function addGTM() {
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-M4W5D8CH'; // Replace with your GTM ID
  document.head.appendChild(script);

  const noscript = document.createElement('noscript');
  noscript.innerHTML = `
    <iframe
      src="https://www.googletagmanager.com/ns.html?id=GTM-M4W5D8CH"
      height="0"
      width="0"
      style="display: none; visibility: hidden;"
    ></iframe>
  `;
  document.body.appendChild(noscript);

  // Initialize the dataLayer
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: 'gtm.js', 'gtm.start': new Date().getTime() });
}

startTransition(() => {
  hydrateRoot(document.getElementById('root')!, <RemixBrowser />);
  addGTM();
});
