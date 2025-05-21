import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifestConfig from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest: manifestConfig })],
  server: {
    port: 5173,
    hmr: {
      port: 5173,
    },
  },
  build: {
    rollupOptions: {
      input: {
        content: 'src/content.ts',
      },
    },
  },
});
