import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        name: 'Karta — Sistema Operativo Gastronómico',
        short_name: 'Karta',
        description: 'Plataforma SaaS para Restaurantes: Pedidos, Cocina KDS y Reportes',
        theme_color: '#ea580c',
        background_color: '#faf8f5',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/images/karta-hero.jpg',
            sizes: '192x192',
            type: 'image/jpeg',
            purpose: 'any maskable',
          },
          {
            src: '/images/karta-hero.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // NetworkOnly estricto para toda la API v1 (nunca cachear datos privados multi-tenant)
            urlPattern: /^\/api\/v1\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'api-network-only',
            },
          },
          {
            // CacheFirst para activos estáticos (imágenes y fuentes)
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|woff2?)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 días
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@restaurante-saas/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});

