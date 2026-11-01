import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createAnalysisHandler } from './api/analyze-fish.ts';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const handler = createAnalysisHandler({
    key: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL,
    supabaseUrl: env.VITE_SUPABASE_URL,
    supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    allowDemo: true,
  });
  return {
    plugins: [
      react(),
      {
        name: 'local-fish-analysis',
        configureServer(server) {
          server.middlewares.use('/api/analyze-fish', (request, response) => {
            void handler(request, response);
          });
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/three/')) return 'three';
            if (id.includes('/node_modules/@supabase/')) return 'supabase';
          },
        },
      },
    },
  };
});
