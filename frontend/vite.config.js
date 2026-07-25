import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

const serviceWorkerBuildVersion =
  process.env.VITE_BUILD_VERSION || Date.now().toString(36)

const stampServiceWorker = () => ({
  name: 'stamp-service-worker',
  apply: 'build',
  async closeBundle() {
    const serviceWorkerPath = fileURLToPath(
      new URL('./dist/service-worker.js', import.meta.url),
    )
    const source = await readFile(serviceWorkerPath, 'utf8')
    if (!source.includes('__BUILD_VERSION__')) {
      throw new Error('Service worker build-version placeholder was not found.')
    }
    await writeFile(
      serviceWorkerPath,
      source.replaceAll('__BUILD_VERSION__', serviceWorkerBuildVersion),
      'utf8',
    )
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stampServiceWorker()],
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
