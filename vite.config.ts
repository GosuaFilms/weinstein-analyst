import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React — always needed
          'vendor-react': ['react', 'react-dom'],
          // Supabase client — always needed (auth, realtime)
          'vendor-supabase': ['@supabase/supabase-js'],
          // jspdf / html2canvas are deliberately NOT listed: forcing them into a
          // manual chunk made Rollup put shared helpers there, so the entry
          // imported it eagerly. Left alone, they stay lazy (dynamic import only).
        },
      },
    },
    // Raise warning threshold — the lazy jspdf chunk is ~400 kB on its own
    chunkSizeWarningLimit: 600,
  },
});
