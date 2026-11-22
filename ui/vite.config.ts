import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: './',
  plugins: [solid()],
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
    target: 'es2022',
  },
});
