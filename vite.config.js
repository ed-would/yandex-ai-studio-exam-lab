import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути работают и в корне, и в /имя-репозитория/ на GitHub Pages.
  base: './',
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { target: 'baseline-widely-available', sourcemap: false, chunkSizeWarningLimit: 1000 },
});
