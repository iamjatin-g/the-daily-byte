import type { APIRoute } from 'astro';
import { config } from '../../config/site.config';
import { loadLatest } from '../lib/data';
import { buildRss } from '../lib/rss';

export const GET: APIRoute = async ({ site }) => {
  const { data } = await loadLatest();
  const xml = buildRss({
    siteName: config.site.name,
    siteUrl: site?.toString() ?? 'https://example.pages.dev',
    description: config.site.description,
    language: config.site.language,
    clusters: data.featured.length ? data.featured : data.latest.slice(0, 20),
    now: new Date(),
  });
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
