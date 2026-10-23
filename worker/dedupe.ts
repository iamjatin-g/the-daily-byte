import type { WorkArticle } from './types';
import { normalizeTitle, sha } from './lib/text';

const quality = (a: WorkArticle) =>
  (a.resolved ? 4 : 0) + (a.imageUrl ? 2 : 0) + (a.snippet ? 1 : 0);

/**
 * Same canonical URL, or same normalized title from the SAME publisher, is a duplicate.
 * Same title from different publishers is kept: that is "coverage" and gets clustered.
 */
export function dedupe(arts: WorkArticle[]): WorkArticle[] {
  const byKey = new Map<string, WorkArticle>();
  const order: string[] = [];
  const keyOf = new Map<string, string>(); // any alias key -> primary key
  for (const a of arts) {
    const k1 = `u:${a.id}`;
    const k2 = `t:${a.domain}:${sha(normalizeTitle(a.headline))}`;
    const primary = keyOf.get(k1) ?? keyOf.get(k2);
    if (!primary) {
      keyOf.set(k1, k1);
      keyOf.set(k2, k1);
      byKey.set(k1, a);
      order.push(k1);
      continue;
    }
    keyOf.set(k1, primary);
    keyOf.set(k2, primary);
    const cur = byKey.get(primary) as WorkArticle;
    const better = quality(a) > quality(cur) ? a : cur;
    const other = better === a ? cur : a;
    byKey.set(primary, {
      ...better,
      imageUrl: better.imageUrl ?? other.imageUrl,
      snippet: better.snippet || other.snippet,
    });
  }
  return order.map((k) => byKey.get(k) as WorkArticle);
}
