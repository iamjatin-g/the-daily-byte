import type { APIRoute } from 'astro';
import { config } from '../../config/site.config';

// A simple monogram generated from the site name, so a new niche gets a matching icon automatically.
export const GET: APIRoute = () => {
  const letter = (config.site.name.trim()[0] ?? 'N').toUpperCase().replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#15171c"/><text x="32" y="46" font-family="Georgia, serif" font-size="42" font-weight="700" text-anchor="middle" fill="#f2f3f0">${letter}</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
