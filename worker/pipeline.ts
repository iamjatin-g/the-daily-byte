import type { Article, Cluster, Config, DayFile, HealthFile, SourceStatus } from '../src/lib/schemas';
import type { Candidate, Ctx, FetchFn, Job, Provider, WorkArticle } from './types';
import type { Store } from './store';
import { toWorkArticle } from './normalize';
import { filterArticles, isBlockedDomain } from './filter';
import { dedupe } from './dedupe';
import { clusterArticles } from './cluster';
import { classify } from './categorize';
import { buildClusters, rankClusters, type RankedCluster } from './rank';
import { applyLinkRot, checkLinks } from './linkrot';
import { resolveUrl } from './lib/resolve';
import { canonicalUrl, domainOf, normalizeTitle, sha } from './lib/text';
import { pMap } from './lib/pool';
import { feedJobs } from './providers/feedDiscovery';
import { recordResult, shouldRun, sourceKey } from './sourceHealth';
import type { EnrichInput, EnrichOutput } from './briefing';

const IST_MS = 5.5 * 3_600_000; // IST = UTC+5:30, no daylight saving
export const istDate = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

export interface Deps {
  config: Config;
  store: Store;
  fetch: FetchFn;
  providers: Provider[];
  now: Date;
  env: Record<string, string | undefined>;
  /** Overridable for tests. */
  checkLinks?: (arts: { id: string; url: string }[]) => Promise<Set<string>>;
  resolve?: (url: string) => Promise<string | null>;
  discoverFeeds?: boolean;
  /** AI briefings. Must never fail the run; any failure falls back to null briefings (plain snippets). */
  enrich?: (input: EnrichInput) => Promise<EnrichOutput>;
}

export interface RunResult {
  outcome: 'success' | 'partial' | 'failed';
  health: HealthFile;
  edition: DayFile | null;
}

interface JobResult {
  job: Job; key: string; skipped: boolean; ok: boolean; candidates: Candidate[]; error: string | null;
}

async function execute(jobs: Job[], prev: Map<string, SourceStatus>, cfg: Config, now: Date): Promise<JobResult[]> {
  return Promise.all(
    jobs.map(async (job): Promise<JobResult> => {
      const key = sourceKey(job.provider, job.name);
      if (!shouldRun(prev.get(key), cfg, now)) return { job, key, skipped: true, ok: false, candidates: [], error: null };
      try {
        return { job, key, skipped: false, ok: true, candidates: await job.run(), error: null };
      } catch (e) {
        const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        return { job, key, skipped: false, ok: false, candidates: [], error };
      }
    }),
  );
}

const toArticle = (a: WorkArticle): Article => ({
  id: a.id, headline: a.headline, source: a.source, domain: a.domain, category: a.category,
  publishedAt: a.publishedAt, snippet: a.snippet, imageUrl: a.imageUrl, url: a.url, provider: a.provider,
});

const toCluster = (c: RankedCluster): Cluster => ({
  id: c.id, headline: c.headline, category: c.category, publishedAt: c.publishedAt, score: c.score,
  publisherCount: c.publisherCount, featured: c.featured, lead: c.lead,
  articles: c.articles.map(toArticle), briefing: null,
});

export async function runPipeline(d: Deps): Promise<RunResult> {
  const { config: cfg, store, now } = d;
  const errors: string[] = [];
  const ctx: Ctx = { config: cfg, fetch: d.fetch, now, env: d.env };
  const today = istDate(now);

  const prev = await store.readHealth();
  const prevMap = new Map<string, SourceStatus>((prev?.sources ?? []).map((s) => [sourceKey(s.provider, s.name), s]));
  const removed = await store.readRemovals();

  // 1. Discover and fetch. Each job fails independently.
  const primary = await execute(d.providers.flatMap((p) => p.jobs(ctx)), prevMap, cfg, now);
  const results = [...primary];
  let candidates = primary.flatMap((r) => r.candidates);

  // 1b. Discover publisher RSS feeds from domains seen in the results.
  if (d.discoverFeeds !== false && cfg.pipeline.feedDiscoveryLimit > 0) {
    const freq = new Map<string, number>();
    for (const c of candidates) {
      const a = toWorkArticle(c, cfg, now);
      if (!a || a.domain.startsWith('unknown-') || isBlockedDomain(a.domain, cfg, removed)) continue;
      freq.set(a.domain, (freq.get(a.domain) ?? 0) + 1);
    }
    const domains = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, cfg.pipeline.feedDiscoveryLimit).map(([x]) => x);
    const second = await execute(feedJobs(ctx, domains), prevMap, cfg, now);
    results.push(...second);
    candidates = [...candidates, ...second.flatMap((r) => r.candidates)];
  }
  const fetched = candidates.length;

  // 2-3. Sanitize to allowed fields, then filter (spam, relevance, blocklists, per-source cap).
  const fresh = candidates.map((c) => toWorkArticle(c, cfg, now)).filter((a): a is WorkArticle => a !== null);

  // carry over today's earlier edition; skip stories already published in yesterday's edition
  const todays = await store.readDay(today);
  const yesterday = await store.readDay(istDate(new Date(now.getTime() - 86_400_000)));
  const seenYesterday = new Set<string>();
  for (const c of yesterday?.clusters ?? []) {
    for (const a of c.articles) {
      seenYesterday.add(a.id);
      seenYesterday.add(`${a.domain}:${sha(normalizeTitle(a.headline))}`);
    }
  }
  const carry: WorkArticle[] = (todays?.clusters ?? []).flatMap((c) =>
    c.articles.map((a) => ({ ...a, sourceKey: 'carry', queried: true, resolved: true })),
  );
  const pool = [
    ...carry,
    ...fresh.filter((a) => !seenYesterday.has(a.id) && !seenYesterday.has(`${a.domain}:${sha(normalizeTitle(a.headline))}`)),
  ];
  const filtered = filterArticles(pool, { config: cfg, removedDomains: removed, now });

  // Record source health (spam-heavy sources count as failures, which feeds auto-disable).
  const statuses: SourceStatus[] = [];
  for (const r of results) {
    if (r.skipped) {
      const p = prevMap.get(r.key);
      if (p) statuses.push(p);
      continue;
    }
    const st = filtered.bySource.get(r.key);
    const spammy = !!st && st.seen >= 4 && st.spam / st.seen > 0.5;
    statuses.push(recordResult(prevMap.get(r.key), r.job, { ok: r.ok, count: r.candidates.length, error: r.error, spammy }, cfg, now));
    if (!r.ok) errors.push(`${r.key}: ${r.error}`);
  }
  const ran = new Set(results.map((r) => r.key));
  for (const s of prev?.sources ?? []) {
    if (s.status === 'disabled' && !ran.has(sourceKey(s.provider, s.name))) statuses.push(s);
  }

  const primaryRan = primary.filter((r) => !r.skipped);
  const allPrimaryFailed = primaryRan.every((r) => !r.ok); // also true when nothing ran at all
  const anyPrimaryFailed = primaryRan.some((r) => !r.ok);

  // LLM calls used so far today (resets when the IST date changes)
  let llm = prev && prev.llmCallsToday.date === today ? { ...prev.llmCallsToday } : { date: today, count: 0 };
  let llmUsed = 0;

  const baseHealth = (outcome: HealthFile['outcome'], totals: Partial<HealthFile['totals']>): HealthFile => ({
    runAt: now.toISOString(),
    outcome,
    totals: { fetched, afterFilter: filtered.kept.length, clusters: 0, linkRotDropped: 0, llmCallsUsed: 0, ...totals },
    llmCallsToday: llm,
    sources: statuses.sort((a, b) => sourceKey(a.provider, a.name).localeCompare(sourceKey(b.provider, b.name))),
    errors: errors.slice(0, 50),
  });

  // FAIL SAFE: never overwrite good data with nothing.
  if (allPrimaryFailed || fetched === 0 || filtered.kept.length === 0) {
    errors.push(allPrimaryFailed ? 'All primary providers failed or were skipped' : 'No usable articles; keeping existing data');
    const health = baseHealth('failed', {});
    await store.writeHealth(health);
    return { outcome: 'failed', health, edition: null };
  }

  // Resolve Google News redirect links to real publisher URLs (capped per run).
  const resolver = d.resolve ?? ((u: string) => resolveUrl(u, d.fetch));
  const toResolve = filtered.kept.filter((a) => !a.resolved)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, cfg.pipeline.maxResolvePerRun);
  const resolvedMap = new Map<string, string>();
  await pMap(toResolve, 5, async (a) => {
    try {
      const real = await resolver(a.url);
      const canon = real ? canonicalUrl(real) : null;
      if (canon && domainOf(canon) !== 'news.google.com') resolvedMap.set(a.id, canon);
    } catch {
      /* leave unresolved */
    }
  });
  let articles = filtered.kept
    .map((a) => {
      const url = resolvedMap.get(a.id);
      return url ? { ...a, url, id: sha(url), domain: domainOf(url), resolved: true } : a;
    })
    .filter((a) => !isBlockedDomain(a.domain, cfg, removed)); // removal requests also apply after resolving

  // 4-6. Dedupe, categorize, cluster, rank.
  articles = dedupe(articles).map((a) => ({ ...a, category: classify(`${a.headline} ${a.snippet}`, cfg.categories, a.category) }));
  const build = () => rankClusters(buildClusters(clusterArticles(articles, cfg.pipeline.similarityThreshold), cfg, now), cfg);
  let ranked = build();

  // 7. Link-rot check on the top clusters; dead links dropped, then re-rank so featured stays full.
  const top = ranked.slice(0, cfg.pipeline.linkCheckTopClusters);
  const topArticles = top.flatMap((c) => c.articles);
  let linkRotDropped = 0;
  try {
    const dead = await (d.checkLinks ?? ((arts) => checkLinks(arts, d.fetch)))(topArticles);
    if (dead.size) {
      articles = articles.filter((a) => !dead.has(a.id));
      linkRotDropped = dead.size;
      ranked = build();
    }
  } catch (e) {
    errors.push(`link-rot check skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (ranked.length === 0) {
    errors.push('Every candidate link was dead; keeping existing data');
    const health = baseHealth('failed', { linkRotDropped });
    await store.writeHealth(health);
    return { outcome: 'failed', health, edition: null };
  }

  // 8. Build the edition (optionally enriched with AI briefings in Phase 3).
  let clusters = ranked.map(toCluster);
  if (d.enrich) {
    try {
      const r = await d.enrich({ clusters, previous: todays?.clusters ?? [], callsToday: llm.count });
      clusters = r.clusters;
      llmUsed = r.callsUsed;
      llm = { date: today, count: llm.count + llmUsed };
      errors.push(...r.notes);
    } catch (e) {
      errors.push(`briefing step failed, using plain snippets: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const edition: DayFile = { date: today, generatedAt: now.toISOString(), clusters };
  await store.writeEdition(edition, cfg);

  const outcome = anyPrimaryFailed ? 'partial' : 'success';
  const health = baseHealth(outcome, { clusters: clusters.length, linkRotDropped, llmCallsUsed: llmUsed });
  await store.writeHealth(health);
  return { outcome, health, edition };
}
