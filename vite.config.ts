import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));

// Re-enable PWA now that worker stack overflow is fixed
const skipPWA = false;

export default defineConfig({
  assetsInclude: ['src/**/*.wasm'],
  build: {
    // Aggressive code splitting to reduce single-bundle module count
    // Rollup's chunk assignment fails with >200K modules in one graph
    chunkSizeWarningLimit: 1024, // Warn on chunks >1MB
    rollupOptions: {
      external: ['fs', 'path', 'crypto'],
      output: {
        // Simple splitting: just vendor vs app, no complex circular logic
        manualChunks: (id) => {
          if (id.includes('node_modules')) return 'vendor';
          return 'app';
        }
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    // topLevelAwait removed — conflicts with WASM modules during chunk assignment
    !skipPWA && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'EA-NITI Edge Agent',
        short_name: 'EA-NITI',
        description: 'Offline Enterprise Architecture Review — Zero-Backend, In-Browser Agentic Edge AI',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 500 * 1024 * 1024, // 500 MB — app is offline-first, needs full bundle cached
        globIgnores: [
          '**/models/**', 
          '**/dataAssets/**', 
          '**/*.bin.gz', 
          '**/*.gguf', 
          'baseline_meta.json',
          'baseline_meta.json.gz',
          'lexicon.json',
          'lexicon.json.gz',
          'sw.js',
          'workbox-*.js',
          'baseline_corpus.bin.gz'  // Corpus binary — static asset, not bundled
        ]
      }
    })
  ].filter(Boolean),
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js'
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https: wss: ws://127.0.0.1:* ws://localhost:*; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; object-src 'none';",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  resolve: {
    alias: {
      'pdfjs-dist/legacy': resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
    }
  },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite', 'pdfjs-dist']
  }
});
