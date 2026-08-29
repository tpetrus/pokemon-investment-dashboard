import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

// Always use Cloudflare adapter for consistent R2 binding access
export default defineConfig({
  output: 'server',
  adapter: cloudflare({ prerenderEnvironment: 'node' }),
  integrations: [react()],
  server: { port: 4321, open: true },
});
