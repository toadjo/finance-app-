import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * One codebase, two targets.
 *
 * The Electron build keeps the default base and ignores the service worker. The
 * phone build is published to GitHub Pages under a subpath, passed in as
 * `--base=/finance-app-/`, and installs to the Home Screen as a PWA.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-180.png'],
      manifest: {
        name: 'Ledger — personal finance',
        short_name: 'Ledger',
        description: 'Track expenses, income and savings goals. Your data stays on your device.',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'portrait',
        // Relative so the same manifest works under a Pages subpath.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything is precached, so the app opens with no signal at all.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
  server: { port: 5173 },
})
