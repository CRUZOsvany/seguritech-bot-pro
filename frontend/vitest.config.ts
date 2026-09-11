import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // IndexedDB en memoria para probar la cola offline de la caja con Dexie real.
    setupFiles: ['fake-indexeddb/auto'],
  },
});
