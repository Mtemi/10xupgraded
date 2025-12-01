import { json } from '@remix-run/cloudflare';

export function loader() {
  const themeScript = `
    function setTutorialKitTheme() {
      let theme = localStorage.getItem('bolt_theme');
      if (!theme) {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.querySelector('html')?.setAttribute('data-theme', theme);
    }
    setTutorialKitTheme();
  `;

  return new Response(themeScript, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
    },
  });
}