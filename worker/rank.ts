import type { Config } from '../src/lib/schemas';
import type { WorkArticle } from './types';
import type { RawCluster } from './cluster';
import { categorizeCluster } from './categorize';

export interface RankedCluster {
  id: string;
  headline: string;
  category: string;
  publishedAt: string;
  score: number;
  publisherCount: number;
  featured: boolean;
  lead: boolean;
  articles: WorkArticle[];
}

export function reliabilityOf(domain: string, cfg: Config): number {
  const table = cfg.sources.reliability;
  const parts = domain.split('.');
  for (let i = 0; i < parts.length; i++) {
    const v = table[parts.slice(i).join('.')];
    if (v !== undefined) return v; // exact domain first, then parent domains
  }
  return 0.5;
}

/** score = 50% distinct publishers (saturates at 6) + 30% recency (half-life ~12h) + 20% source reliability */
export function scoreCluster(articles: WorkArticle[], cfg: Config, now: Date): number {
  const domains = [...new Set(articles.map((a) => a.domain))];
  const pub = Math.min(domains.length, 6) / 6;
  const newest = Math.max(...articles.map((a) => Date.parse(a.publishedAt)));
  const ageH = Math.max(0, (now.getTime() - newest) / 3_600_000);
  const recency = Math.exp(-ageH / 18);
  const rel = domains.reduce((s, d) => s + reliabilityOf(d, cfg), 0) / domains.length;
  return Math.round((0.5 * pub + 0.3 * recency + 0.2 * rel) * 10_000) / 10_000;
}

export function buildClusters(raw: RawCluster[], cfg: Config, now: Date): RankedCluster[] {
  return raw
    .filter((c) => c.articles.length > 0)
    .map((c) => {
      const articles = [...c.articles].sort(
        (a, b) =>
          reliabilityOf(b.domain, cfg) - reliabilityOf(a.domain, cfg) ||
          Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
      );
      return {
        id: c.id,
        headline: (articles[0] as WorkArticle).headline,
        category: categorizeCluster(articles, cfg.categories),
        publishedAt: new Date(Math.max(...articles.map((a) => Date.parse(a.publishedAt)))).toISOString(),
        score: scoreCluster(articles, cfg, now),
        publisherCount: new Set(articles.map((a) => a.domain)).size,
        featured: false,
        lead: false,
        articles,
      };
    });
}

/** Sort by score; top N per category are featured; the single best overall is the lead. */
export function rankClusters(clusters: RankedCluster[], cfg: Config): RankedCluster[] {
  const sorted = [...clusters]
    .map((c) => ({ ...c, featured: false, lead: false }))
    .sort((a, b) => b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  const perCat = new Map<string, number>();
  for (const c of sorted) {
    const n = perCat.get(c.category) ?? 0;
    if (n < cfg.pipeline.featuredPerCategory) c.featured = true;
    perCat.set(c.category, n + 1);
  }
  if (sorted[0]) {
    sorted[0].lead = true;
    sorted[0].featured = true;
  }
  return sorted;
}
