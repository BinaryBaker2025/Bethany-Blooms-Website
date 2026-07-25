import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

const SERVICE_WORKER_CACHE_PREFIX = 'bethany-blooms-'

// Production owns the service worker. Development actively removes any older
// Bethany Blooms worker/cache so Vite modules can never be served from it.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
  });
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        registrations
          .filter((registration) => {
            const scriptUrl =
              registration.active?.scriptURL ||
              registration.waiting?.scriptURL ||
              registration.installing?.scriptURL ||
              ''
            return scriptUrl.startsWith(window.location.origin)
          })
          .map((registration) => registration.unregister()),
      )

      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith(SERVICE_WORKER_CACHE_PREFIX))
            .map((cacheName) => caches.delete(cacheName)),
        )
      }
    } catch (error) {
      console.warn('Unable to remove the development service worker cache.', error)
    }
  })
}
