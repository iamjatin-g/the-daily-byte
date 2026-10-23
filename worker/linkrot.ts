import type { FetchFn } from './types';
import { domainOf } from './lib/text';
import { pMap } from './lib/pool';
import type { RankedCluster } from './rank';

const drain = (res: Response) => void res.body?.cancel().catch(() => undefined);

/**
 * Only a definite 404/410 (confirmed by GET) or a DNS "not found" counts as dead.
 * 403, 429, 5xx and timeouts are treated as alive, because many healthy sites block bots.
 */
export async function isDead(url: string, fetchFn: FetchFn): Promise<boolean> {
  try {
    const head = await fetchFn(url, { method: 'HEAD' });
    drain(head);
    if (head.status !== 404 && head.status !== 410) return false;
    const get = await fetchFn(url, { method: 'GET' });
    drain(get);
    return get.status === 404 || get.status === 410;
  } catch (e) {
    const err = e as { message?: string; cause?: { code?: string } };
    return /ENOTFOUND/.test(`${err.message ?? ''} ${err.cause?.code ?? ''}`);
  }
}

export async function checkLinks(
  arts: { id: string; url: string }[],
  fetchFn: FetchFn,
  concurrency = 8,
): Promise<Set<string>> {
  const dead = new Set<string>();
  await pMap(arts, concurrency, async (a) => {
    if (domainOf(a.url) === 'news.google.com') return; // cannot be validated
    if (await isDead(a.url, fetchFn)) dead.add(a.id);
  });
  return dead;
}

/** Remove dead articles; drop clusters left empty; recount publishers. */
export function applyLinkRot(clusters: RankedCluster[], dead: Set<string>): { clusters: RankedCluster[]; dropped: number } {
  let dropped = 0;
  const out: RankedCluster[] = [];
  for (const c of clusters) {
    const articles = c.articles.filter((a) => !dead.has(a.id));
    dropped += c.articles.length - articles.length;
    if (!articles.length) continue;
    out.push({ ...c, articles, publisherCount: new Set(articles.map((a) => a.domain)).size });
  }
  return { clusters: out, dropped };
}
