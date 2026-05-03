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
          // PDF / canvas — loaded on demand via dynamic import,
          // but Rollup still needs a chunk boundary here
          'vendor-pdf': ['jspdf', 'html2canvas'],
        },
      },
    },
    // Raise warning threshold — individual chunks over 400 kB
    // (jspdf + html2canvas) are intentional lazy chunks
    chunkSizeWarningLimit: 600,
  },
});
