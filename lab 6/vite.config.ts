import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'Task Manager',
        short_name: 'Tasks',
        lang: 'uk',
        start_url: '/',
        display: 'standalone',
        theme_color: '#5148bb',
        background_color: '#f7f7fb',
        description: 'Робочий простір для командних проєктів і завдань.',
        icons: [
          { src: '/icons/task-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/task-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/health$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true },
});
