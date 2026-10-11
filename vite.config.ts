/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The review preview (memory router, hosted inside another page) must never register a service worker.
const reviewBuild = process.env.VITE_ROUTER === 'memory';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      disable: reviewBuild,
      // A new version waits until the person chooses to reload, so a draft is never cut off mid-sentence.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Pursuit of Greatness',
        short_name: 'Greatness',
        description: 'Plan who you are becoming, do today\'s work, write what actually happened.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#090D13',
        theme_color: '#090D13',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,jpg,woff2,mp3,ogg}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Character clips (including ones added later) are cached on first play, with range support for seeking.
            urlPattern: ({ url }) => url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm'),
            handler: 'CacheFirst',
            options: { cacheName: 'character-clips', rangeRequests: true, expiration: { maxEntries: 40 } },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
