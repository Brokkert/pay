import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Net als CATANIA en Paklijst: één enkel HTML-bestand. Pay heeft geen kaart en
// geen zware afhankelijkheden, dus alles past ruim in één bestand — dat scheelt
// een handvol verzoeken en maakt het geheel makkelijk ergens neer te zetten.
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
