import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Like CATANIA and Paklijst: a single HTML file. Pay has no map and no heavy
// dependencies, so everything fits comfortably in one file — that saves a
// handful of requests and makes it trivial to host anywhere.
//
// base is relative, so the same build works at a domain root and under a
// project subpath like /pay/ without rebuilding.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  build: {
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
