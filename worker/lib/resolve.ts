import type { FetchFn } from '../types';
import { domainOf } from './text';

/**
 * Older Google News article links embed the publisher URL inside a base64 id.
 * Newer ids do not, so this can return null (we then try following redirects).
 */
export function decodeGoogleNewsUrl(url: string): string | null {
  let id: string | undefined;
  try {
    id = new URL(url).pathname.match(/\/(?:rss\/)?articles\/([^/?]+)/)?.[1];
  } catch {
    return null;
  }
  if (!id) return null;
  try {
    const bin = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
    // eslint-disable-next-line no-control-regex
    return bin.match(/https?:\/\/[\x21-\x7e]+/)?.[0] ?? null;
  } catch {
    return null;
  }
}

const GOOGLE_HOSTS = new Set(['news.google.com', 'consent.google.com', 'www.google.com']);

/** Returns the real publisher URL, the input if not a Google link, or null if unresolved. */
export async function resolveUrl(url: string, fetchFn: FetchFn): Promise<string | null> {
  if (domainOf(url) !== 'news.google.com') return url;
  const decoded = decodeGoogleNewsUrl(url);
  if (decoded && !GOOGLE_HOSTS.has(domainOf(decoded))) return decoded;
  try {
    const res = await fetchFn(url, { method: 'GET', redirect: 'follow' });
    const final = res.url;
    if (final && !GOOGLE_HOSTS.has(domainOf(final))) return final;
  } catch {
    /* fall through */
  }
  return null;
}
