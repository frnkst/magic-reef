import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createAnalysisHandler } from './api/analyze-fish.ts';
import { createOwnerHandler } from './api/owner.ts';
import { createDrawingsHandler } from './api/drawings.ts';
import { createTanksHandler } from './api/tanks.ts';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const owner = {
    authUrl: env.VITE_AUTH_SUPABASE_URL,
    authKey: env.VITE_AUTH_SUPABASE_PUBLISHABLE_KEY,
    ownerId: env.ALLOWED_GITHUB_USER_ID,
    databaseUrl: env.VITE_SUPABASE_URL,
    databaseKey: env.SUPABASE_SECRET_KEY,
  };
  const handler = createAnalysisHandler({
    ...owner,
    key: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL,
    imageModel: env.OPENROUTER_IMAGE_MODEL,
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
          server.middlewares.use('/api/owner', (request, response) => { void createOwnerHandler(owner)(request, response); });
          server.middlewares.use('/api/drawings', (request, response) => { void createDrawingsHandler(owner)(request, response); });
          server.middlewares.use('/api/tanks', (request, response) => { void createTanksHandler(owner)(request, response); });
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
