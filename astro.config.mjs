import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';
import node from '@astrojs/node';
import cloudflare from '@astrojs/cloudflare';

// Astro puts .env values on import.meta.env, not process.env, and the workbook
// loader runs in plain Node — so bridge the one variable it needs.
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
if (!process.env.POKEMON_DATA_DIR && env.POKEMON_DATA_DIR) {
  process.env.POKEMON_DATA_DIR = env.POKEMON_DATA_DIR;
}

// Use Node adapter for dev mode, Cloudflare adapter for production
const isDev = process.env.NODE_ENV === 'development';
const adapter = isDev 
  ? node({ mode: 'standalone' })
  : cloudflare({ prerenderEnvironment: 'node' });

export default defineConfig({
  output: 'server',
  adapter,
  integrations: [react()],
  server: { port: 4321, open: true },
});
