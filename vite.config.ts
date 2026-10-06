import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'participant-app',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Vite handles OPTIONS before the API proxy. Keep desktop plugin login preflights working.
    cors: {
      origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'onlyoffice://plugin',
        'null',
        'file://',
      ],
    },
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  build: { outDir: '../dist/client', emptyOutDir: true },
});
