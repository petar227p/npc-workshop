import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Transfer validation is loaded on demand. Discover zod at startup so the first file selection
  // cannot trigger Vite's dependency-optimization reload and discard an in-progress bench conversation.
  optimizeDeps: { include: ['zod'] },
  // API_PORT points a second dev server at another API (an offline one for UI checks); 8787 is `npm run dev`'s.
  // VITE_HOST=0.0.0.0 makes the dev server reachable from outside a container.
  server: { host: process.env.VITE_HOST, port: 5174, proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 8787}` } },
});
