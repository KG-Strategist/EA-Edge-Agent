import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
          runtimeCaching: [
            {
              // Blacklist Hub Models and WebLLM shards from the PWA Cache
              // WebLLM manages its own OPFS/CacheStorage. Swallowing these crashes the quota.
              urlPattern: /.*(?:huggingface\.co|githubusercontent\.com|webllm|raw\.githubusercontent\.com).*\.(?:bin|wasm|json|safetensors|txt)/i,
              handler: 'NetworkOnly'
            },
            {
              // Runtime cache for lazy-loaded diagram and export libraries (non-critical paths)
              urlPattern: /mermaid|html2pdf|cytoscape/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'ea-niti-libraries',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
                }
              }
            }
          ],
          maximumFileSizeToCacheInBytes: 20000000 // Increased to 20 MB to accommodate main + worker bundles
        },
        manifest: {
          name: 'EA-NITI Edge Agent',
          short_name: 'EA-NITI',
          description: 'Offline-First Architecture Copilot',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          icons: [
            {
              src: '/logo.svg',
              sizes: '192x192',
              type: 'image/svg+xml'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || ''),
      'import.meta.env.VITE_MICROSOFT_CLIENT_ID': JSON.stringify(env.VITE_MICROSOFT_CLIENT_ID || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Increase chunk size warning limit since we'll optimize later
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Code splitting: separate large libraries into their own chunks for lazy loading
          manualChunks: {
            // Diagram library: lazy-loaded on-demand
            'mermaid-bundle': ['mermaid'],
            // Export libraries: loaded only when user triggers export
            'export-bundle': ['html2pdf.js', 'xlsx'],
            // Graph visualization: lazy-loaded for threat modeling
            'graph-bundle': ['cytoscape']
          }
        }
      }
    },
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
