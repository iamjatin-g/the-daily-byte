// End-to-end dry run on fixtures: worker -> JSON files on disk -> pages, RSS and search records.
// Uses the real file store. No network: providers serve saved sample feeds.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fixture, testConfig, NOW, fakeProvider, fakeGoogleLink } from './helpers';
import { runPipeline } from '../worker/pipeline';
import { fsStore } from '../worker/store';
import { makeEnricher } from '../worker/briefing';
import { mapGoogleItem } from '../worker/providers/googleNews';
import { mapGdeltArticle } from '../worker/providers/gdelt';
import { mapGnewsArticle, mapNewsdataArticle } from '../worker/providers/newsApi';
import { decodeGoogleNewsUrl } from '../worker/lib/resolve';
import { loadLatest, loadIndex, loadHealth, loadAllDays } from '../src/lib/data';
import { homeMain, categoryMain, archiveMain, type ViewCtx } from '../src/lib/views';
import { buildRss } from '../src/lib/rss';
import { toSearchRecords } from '../src/lib/search-records';
import type { RawItem } from '../worker/lib/feed';
import type { Candidate, FetchFn } from '../worker/types';

const isC = (c: Candidate | null): c is Candidate => c !== null;
const cfg = testConfig();
const v: ViewCtx = { now: NOW, siteName: cfg.site.name, tagline: cfg.site.tagline, categories: cfg.categories, publishTimesIST: cfg.schedule.publishTimesIST, contactEmail: cfg.site.contactEmail };
const GOOD = JSON.stringify({ summary: 'A major lab has released a reasoning system aimed at software teams. Several outlets say it targets multi-step coding work.', whyItMatters: 'Stronger reasoning tools could change how developers build and review software.' });
const feeds = () => [
  fakeProvider('google-news', { 'AI research': fixture<RawItem[]>('google-news.items.json').map((i) => mapGoogleItem({ ...i, link: fakeGoogleLink(i.link!) }, 'google-news:AI research')).filter(isC) }),
  fakeProvider('gdelt', { LLMs: fixture<{ articles: Record<string, string>[] }>('gdelt.json').articles.map((a) => mapGdeltArticle(a, 'gdelt:LLMs')).filter(isC) }),
  fakeProvider('gnews', { ai: fixture<{ articles: Record<string, unknown>[] }>('gnews.json').articles.map((a) => mapGnewsArticle(a, 'gnews:ai')).filter(isC) }),
  fakeProvider('newsdata', { ai: fixture<{ results: Record<string, unknown>[] }>('newsdata.json').results.map((a) => mapNewsdataArticle(a, 'newsdata:ai')).filter(isC) }),
];
const offline: FetchFn = async () => { throw new Error('offline'); };

describe('end-to-end dry run (fixtures)', () => {
  it('morning run, evening run, then a total outage that must not touch live data', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'e2e-'));
    const data = path.join(root, 'data');
    mkdirSync(data);
    const run = (now: Date, providers = feeds()) => runPipeline({
      config: cfg, store: fsStore(data, root), fetch: offline, providers, now, env: {}, discoverFeeds: false,
      resolve: async (u) => decodeGoogleNewsUrl(u), checkLinks: async () => new Set(),
      enrich: makeEnricher({ config: cfg, client: async () => GOOD, sleep: async () => undefined }),
    });

    // 1. morning run writes every data file
    const r1 = await run(NOW);
    expect(r1.outcome).toBe('success');
    expect(readdirSync(data).sort()).toEqual(['2026-10-18.json', 'health.json', 'index.json', 'latest.json']);
    const latest = await loadLatest(data);
    expect(latest.ok).toBe(true);
    expect(latest.data.lead?.briefing?.summary).toContain('reasoning system');
    expect(latest.data.featured.length).toBeGreaterThan(1);
    expect((await loadIndex(data)).data.days).toEqual([{ date: '2026-10-18', count: latest.data.latest.length }]);
    const health = (await loadHealth(data)).data!;
    expect(health.outcome).toBe('success');
    expect(health.llmCallsToday.count).toBe(health.totals.llmCallsUsed);

    // 2. the site pages build from those files
    const home = homeMain({ lead: latest.data.lead, featured: latest.data.featured, latest: latest.data.latest, ok: true }, v);
    expect(/OpenAI (launches|releases|unveils)/.test(home)).toBe(true);
    expect(home).toContain('Covered by 3 publishers');
    expect(/undefined|\[object|NaN/.test(home)).toBe(false);
    for (const cat of cfg.categories) expect(categoryMain(cat.id, { latest: latest.data.latest, ok: true }, v).length).toBeGreaterThan(50);
    expect(archiveMain((await loadIndex(data)).data.days, v)).toContain('18 October 2026');
    const rss = buildRss({ siteName: cfg.site.name, siteUrl: 'https://x.test', description: 'd', language: 'en', clusters: latest.data.featured, now: NOW });
    expect(rss.split('<item>').length - 1).toBe(latest.data.featured.length);
    const records = toSearchRecords(await loadAllDays(data), 'en', cfg.categories);
    expect(records.length).toBe(latest.data.latest.length);
    expect(records.every((r) => r.url.startsWith('https://') && !r.url.includes('news.google.com'))).toBe(true);

    // 3. evening run keeps the morning's stories
    const eve = new Date(NOW.getTime() + 8 * 3_600_000);
    const r2 = await run(eve);
    expect(r2.outcome).toBe('success');
    const ids = (x: typeof latest.data) => new Set(x.latest.map((c) => c.id));
    const after = (await loadLatest(data)).data;
    for (const id of ids(latest.data)) expect(ids(after).has(id)).toBe(true);

    // 4. total outage: every provider fails -> news files byte-identical, health says failed
    const snap = ['latest.json', 'index.json', '2026-10-18.json'].map((f) => readFileSync(path.join(data, f), 'utf8'));
    const r3 = await run(new Date(eve.getTime() + 3_600_000), [fakeProvider('google-news', { a: new Error('timeout') }), fakeProvider('gdelt', { b: new Error('HTTP 429') })]);
    expect(r3.outcome).toBe('failed');
    expect(['latest.json', 'index.json', '2026-10-18.json'].map((f) => readFileSync(path.join(data, f), 'utf8'))).toEqual(snap);
    expect((await loadHealth(data)).data?.outcome).toBe('failed');
    expect((await loadLatest(data)).data.lead).not.toBeNull(); // old content still served
  });
});
