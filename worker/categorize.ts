import type { Config } from '../src/lib/schemas';
import type { WorkArticle } from './types';
import { normalizeTitle } from './lib/text';

type Cats = Config['categories'];
const fallbackId = (cats: Cats) => (cats.find((c) => c.id === 'general') ?? cats[cats.length - 1])?.id ?? 'general';

/** Feed-provided category wins if it matches one of ours; otherwise keyword hits decide. */
export function classify(text: string, cats: Cats, hint?: string | null): string {
  if (hint) {
    const h = hint.trim().toLowerCase();
    const m = cats.find((c) => c.id === h || c.label.toLowerCase() === h);
    if (m) return m.id;
  }
  const hay = ` ${normalizeTitle(text)} `;
  let best = fallbackId(cats);
  let bestHits = 0;
  for (const c of cats) {
    const hits = c.keywords.filter((k) => hay.includes(` ${normalizeTitle(k)}`)).length;
    if (hits > bestHits) {
      best = c.id;
      bestHits = hits;
    }
  }
  return best;
}

export function categorizeCluster(arts: WorkArticle[], cats: Cats): string {
  const votes = new Map<string, number>();
  for (const a of arts) votes.set(a.category, (votes.get(a.category) ?? 0) + 1);
  const ranked = [...votes.entries()].sort((x, y) => y[1] - x[1]);
  const top = ranked[0];
  const tie = ranked[1] && top && ranked[1][1] === top[1];
  if (top && !tie) return top[0];
  return classify(arts.map((a) => `${a.headline} ${a.snippet}`).join(' '), cats);
}
