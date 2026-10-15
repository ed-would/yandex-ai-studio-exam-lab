import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const imageVariants = JSON.parse(readFileSync(new URL('./src/data/image-variants.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Относительные пути работают и в корне, и в /имя-репозитория/ на GitHub Pages.
  base: './',
  server: { host: '0.0.0.0', port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'baseline-widely-available',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    license: true,
    copyPublicDir: false,
  },
  plugins: [
    {
      name: 'runtime-public-assets',
      apply: 'build',
      generateBundle() {
        const files = new Set([
          '.nojekyll',
          'theme.js',
          'theme-controls.css',
          'accordion.css',
          'favicon.png',
          'fonts/unbounded-cyrillic-variable.woff2',
          'fonts/unbounded-latin-variable.woff2',
          'fonts/Unbounded-OFL.txt',
          'images/brand/ai-studio-white.svg',
          ...Object.values(imageVariants).flatMap(({ variants }) => variants.map(([, file]) => `images/${file}`)),
        ]);
        for (const file of files) {
          this.emitFile({
            type: 'asset',
            fileName: file,
            source: readFileSync(new URL(`./public/${file}`, import.meta.url)),
          });
        }
      },
    },
  ],
});
