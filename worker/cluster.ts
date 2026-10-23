import type { WorkArticle } from './types';
import { sha, tokens } from './lib/text';

export interface RawCluster {
  id: string;
  articles: WorkArticle[];
}

/** Jaccard, or a boosted overlap score so a short headline inside a longer one still matches. */
export function similarity(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  if (!union) return 0;
  const jaccard = inter / union;
  const overlap = inter >= 3 ? inter / Math.min(A.size, B.size) : 0;
  return Math.max(jaccard, 0.85 * overlap);
}

const MAX_CLUSTER = 15; // stops single-linkage "chaining" into one giant story

export function clusterArticles(arts: WorkArticle[], threshold: number): RawCluster[] {
  const toks = arts.map((a) => tokens(a.headline));
  const parent = arts.map((_, i) => i);
  const size = arts.map(() => 1);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i] as number] as number;
      i = parent[i] as number;
    }
    return i;
  };
  for (let i = 0; i < arts.length; i++) {
    for (let j = i + 1; j < arts.length; j++) {
      const ri = find(i);
      const rj = find(j);
      if (ri === rj || (size[ri] as number) + (size[rj] as number) > MAX_CLUSTER) continue;
      if (similarity(toks[i] as string[], toks[j] as string[]) >= threshold) {
        parent[rj] = ri;
        size[ri] = (size[ri] as number) + (size[rj] as number);
      }
    }
  }
  const groups = new Map<number, WorkArticle[]>();
  arts.forEach((a, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), a]);
  });
  return [...groups.values()].map((articles) => ({
    id: sha(articles.map((a) => a.id).sort()[0] as string),
    articles,
  }));
}
