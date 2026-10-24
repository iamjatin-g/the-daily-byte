import type { FetchFn } from './types';
import { robotsAllows, type RobotsRules } from './lib/robots';
import { pMap } from './lib/pool';
import { decodeEntities } from './lib/text';

export const MAX_IMAGE_FETCHES = 30; // pages opened per run (keeps runs fast and polite)

const WANT = ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'];

/** Reads the share-image URL from a page's <meta> tags. Returns an absolute http(s) URL or null. */
export function extractImageUrl(html: string, pageUrl: string): string | null {
  const tags = html.slice(0, 200_000).match(/<meta\b[^>]*>/gi) ?? [];
  const found = new Map<string, string>();
  for (const tag of tags) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (key && val && WANT.includes(key) && !found.has(key)) found.set(key, val);
  }
  for (const k of WANT) {
    const v = found.get(k);
    if (!v) continue;
    try {
      const u = new URL(decodeEntities(v), pageUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
    } catch {
      /* try the next tag */
    }
  }
  return null;
}

/** Opens each page (respecting robots.txt) and returns article id -> image URL. Never throws. */
export async function fetchMissingImages(
  targets: { id: string; url: string }[],
  fetchFn: FetchFn,
): Promise<Map<string, string>> {
  const robots = new Map<string, RobotsRules>();
  const out = new Map<string, string>();
  await pMap(targets, 5, async (t) => {
    try {
      if (!(await robotsAllows(fetchFn, t.url, robots))) return;
      const res = await fetchFn(t.url, { headers: { accept: 'text/html' } });
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return;
      const img = extractImageUrl(await res.text(), res.url || t.url);
      if (img) out.set(t.id, img);
    } catch {
      /* skip this page */
    }
  });
  return out;
}