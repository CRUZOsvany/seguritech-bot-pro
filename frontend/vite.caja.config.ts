import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/**
 * Build de la PWA del cajero (POS Lite, T-06). App hermana del panel: mismo
 * stack y mismos componentes compartidos, pero build, URL y service worker
 * propios — el panel admin y la caja no se mezclan.
 *
 * Express sirve backend/public/caja/ en /caja/ y cada negocio entra por
 * /caja/<tenantId>/ (ver backend/src/infrastructure/server/cajaStatic.ts).
 * Sin rutas lazy a propósito: todo el JS va referenciado desde index.html
 * para que el service worker lo guarde completo y la caja abra sin internet.
 */
export default defineConfig({
  root: path.resolve(__dirname, 'src/apps/pos-cajero'),
  base: '/caja/',
  publicDir: path.resolve(__dirname, 'src/apps/pos-cajero/public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../backend/public/caja'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
