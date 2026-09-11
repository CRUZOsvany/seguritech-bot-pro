import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@/styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root no encontrado en index.html');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// El service worker guarda la app para que abra sin internet. Solo en el
// build: en `vite dev` cachearía módulos que cambian a cada guardado.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/caja/sw.js', { scope: '/caja/' }).catch((err: unknown) => {
      console.error('No se pudo registrar el service worker de la caja', err);
    });
  });
}
