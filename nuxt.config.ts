export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  // Reines SPA: kein SSR-Overhead, localStorage ohne Hydration-Tanz.
  // Nitro läuft trotzdem und betreibt den WebSocket.
  ssr: false,

  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  nitro: {
    experimental: {
      websocket: true,
    },
  },

  app: {
    head: {
      title: 'Vampirspiel',
      htmlAttrs: { lang: 'de' },
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1',
        },
        { name: 'theme-color', content: '#0B0D14' },
        { name: 'color-scheme', content: 'dark' },
        { name: 'mobile-web-app-capable', content: 'yes' },
      ],
    },
  },
})
