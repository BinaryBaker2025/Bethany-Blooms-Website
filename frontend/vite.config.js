import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react$/, replacement: fileURLToPath(new URL('./node_modules/react', import.meta.url)) },
      { find: /^react\/jsx-runtime$/, replacement: fileURLToPath(new URL('./node_modules/react/jsx-runtime.js', import.meta.url)) },
      { find: /^react\/jsx-dev-runtime$/, replacement: fileURLToPath(new URL('./node_modules/react/jsx-dev-runtime.js', import.meta.url)) },
      { find: /^react-dom$/, replacement: fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)) },
      { find: /^react-dom\/client$/, replacement: fileURLToPath(new URL('./node_modules/react-dom/client.js', import.meta.url)) },
      { find: /^react-router$/, replacement: fileURLToPath(new URL('./node_modules/react-router', import.meta.url)) },
      { find: /^react-router-dom$/, replacement: fileURLToPath(new URL('./node_modules/react-router-dom', import.meta.url)) },
    ],
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react-router', 'react-router-dom'],
    force: true,
  },
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/storage',
            'firebase/functions',
          ],
        },
      },
    },
  },
})
