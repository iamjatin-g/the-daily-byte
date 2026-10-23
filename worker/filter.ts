import type { Config } from '../src/lib/schemas';
import type { WorkArticle } from './types';
import { hostMatches, tokens } from './lib/text';

/** 0-1 keyword relevance. Headline hits count fully, snippet hits 70%; extra matched keywords add a bonus. */
export function relevanceScore(a: { headline: string; snippet: string }, keywords: string[]): number {
  const head = tokens(a.headline);
  const all = [...head, ...tokens(a.snippet)];
  const hit = (set: string[], t: string) => set.some((w) => w === t || (t.length >= 4 && w.startsWith(t)));
  let best = 0;
  let matched = 0;
  for (const k of keywords) {
    const kt = tokens(k);
    if (!kt.length) continue;
    const fh = kt.filter((t) => hit(head, t)).length / kt.length;
    const fa = kt.filter((t) => hit(all, t)).length / kt.length;
    const s = Math.max(fh, 0.7 * fa);
    if (s > 0) matched++;
    best = Math.max(best, s);
  }
  return Math.min(1, best + 0.15 * Math.max(0, matched - 1));
}

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");

export function isSpam(headline: string, phrases: string[]): boolean {
  const h = norm(headline);
  if (phrases.some((p) => h.includes(norm(p)))) return true;
  const letters = headline.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 15 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) return true;
  return /!{2,}|\?{2,}/.test(headline);
}

export interface FilterStats {
  spam: number; irrelevant: number; blocked: number; stale: number; capped: number;
}
export interface FilterResult {
  kept: WorkArticle[];
  dropped: FilterStats;
  bySource: Map<string, { seen: number; spam: number }>;
}

export function isBlockedDomain(domain: string, cfg: Config, removed: string[]): boolean {
  if (hostMatches(domain, [...cfg.sources.blockDomains, ...removed])) return true;
  const allow = cfg.sources.allowDomains;
  return allow.length > 0 && !hostMatches(domain, allow); // non-empty allow list = ONLY these
}

/**
 * Domain blocks apply to everything (publisher removal requests must always win).
 * Spam / relevance / age apply to fresh articles only; carried-over ones were already vetted.
 */
export function filterArticles(
  arts: WorkArticle[],
  opts: { config: Config; removedDomains: string[]; now: Date },
): FilterResult {
  const { config: cfg, removedDomains, now } = opts;
  const dropped: FilterStats = { spam: 0, irrelevant: 0, blocked: 0, stale: 0, capped: 0 };
  const bySource = new Map<string, { seen: number; spam: number }>();
  const maxAgeMs = cfg.pipeline.maxAgeHours * 3_600_000;
  const scored: { a: WorkArticle; rel: number }[] = [];

  for (const a of arts) {
    const carried = a.sourceKey === 'carry';
    const st = bySource.get(a.sourceKey) ?? { seen: 0, spam: 0 };
    st.seen++;
    bySource.set(a.sourceKey, st);
    if (isBlockedDomain(a.domain, cfg, removedDomains)) { dropped.blocked++; continue; }
    if (carried) { scored.push({ a, rel: 1 }); continue; }
    if (isSpam(a.headline, cfg.spamBlocklist)) { dropped.spam++; st.spam++; continue; }
    if (now.getTime() - Date.parse(a.publishedAt) > maxAgeMs) { dropped.stale++; continue; }
    let rel = relevanceScore(a, cfg.topics.keywords);
    if (a.queried) rel = Math.max(rel, 0.3); // a keyword search already matched it
    if (rel < cfg.topics.minRelevance) { dropped.irrelevant++; continue; }
    scored.push({ a, rel });
  }

  // cap per publisher so nobody dominates: best relevance first, then newest
  scored.sort((x, y) => y.rel - x.rel || Date.parse(y.a.publishedAt) - Date.parse(x.a.publishedAt));
  const perDomain = new Map<string, number>();
  const kept: WorkArticle[] = [];
  for (const { a } of scored) {
    const n = perDomain.get(a.domain) ?? 0;
    if (n >= cfg.sources.maxArticlesPerSource) { dropped.capped++; continue; }
    perDomain.set(a.domain, n + 1);
    kept.push(a);
  }
  return { kept, dropped, bySource };
}
