import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';

// Astro puts .env values on import.meta.env, not process.env, and the workbook
// loader runs in plain Node — so bridge the one variable it needs.
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
if (!process.env.POKEMON_DATA_DIR && env.POKEMON_DATA_DIR) {
  process.env.POKEMON_DATA_DIR = env.POKEMON_DATA_DIR;
}

export default defineConfig({
  integrations: [react()],
  server: { port: 4321, open: true },
});
