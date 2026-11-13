/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { devAiEndpoint } from './server/dev-ai-endpoint.ts';

export default defineConfig(({ mode }) => {
  // Server-only variables (no VITE_ prefix) stay on the Node side and are never bundled.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), devAiEndpoint(env)],
    resolve: {
      alias: { '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)) },
    },
    test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  };
});
