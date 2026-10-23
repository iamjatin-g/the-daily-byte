import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// Site URL is read from the SITE_URL env var (set in the workflow) so the
// config file stays the single place for topic settings.
export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL ?? 'https://example.pages.dev',
  integrations: [tailwind({ applyBaseStyles: false }), sitemap()],
  build: { inlineStylesheets: 'auto' },
});
