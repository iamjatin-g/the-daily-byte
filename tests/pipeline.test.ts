import { describe, it, expect } from 'vitest';
import { fixture, testConfig, NOW, memoryStore, fakeProvider, fakeGoogleLink } from './helpers';
import { runPipeline } from '../worker/pipeline';
import { mapGoogleItem } from '../worker/providers/googleNews';
import { mapGdeltArticle } from '../worker/providers/gdelt';
import { mapGnewsArticle, mapNewsdataArticle } from '../worker/providers/newsApi';
import { decodeGoogleNewsUrl } from '../worker/lib/resolve';
import { DayFileSchema, HealthFileSchema } from '../src/lib/schemas';
import type { RawItem } from '../worker/lib/feed';
import type { Candidate, FetchFn } from '../worker/types';

const isCand = (c: Candidate | null): c is Candidate => c !== null;
const googleItems = fixture<RawItem[]>('google-news.items.json');
// Google News serves redirect links, so wrap each fixture link the way Google does.
const googleCands = googleItems.map((i) => mapGoogleItem({ ...i, link: fakeGoogleLink(i.link!) }, 'google-news:AI research')).filter(isCand);
const gdeltCands = fixture<{ articles: Record<string, string>[] }>('gdelt.json').articles.map((a) => mapGdeltArticle(a, 'gdelt:LLMs')).filter(isCand);
const gnewsCands = fixture<{ articles: Record<string, unknown>[] }>('gnews.json').articles.map((a) => mapGnewsArticle(a, 'gnews:ai')).filter(isCand);
const ndCands = fixture<{ results: Record<string, unknown>[] }>('newsdata.json').results.map((a) => mapNewsdataArticle(a, 'newsdata:ai')).filter(isCand);

const noNetwork: FetchFn = async () => { throw new Error('network not available in tests'); };
const baseDeps = (over: Partial<Parameters<typeof runPipeline>[0]> = {}) => {
  const mem = memoryStore();
  return {
    mem,
    deps: {
      config: testConfig(), store: mem.store, fetch: noNetwork, now: NOW, env: {}, discoverFeeds: false,
      resolve: async (u: string) => decodeGoogleNewsUrl(u),
      checkLinks: async () => new Set<string>(),
      providers: [fakeProvider('google-news', { 'AI research': googleCands }), fakeProvider('gdelt', { LLMs: gdeltCands }),
        fakeProvider('gnews', { ai: gnewsCands }), fakeProvider('newsdata', { ai: ndCands })],
      ...over,
    },
  };
};

describe('full pipeline on fixtures', () => {
  it('produces a valid edition: spam/stale dropped, duplicates merged, lead + featured set', async () => {
    const { deps, mem } = baseDeps();
    const r = await runPipeline(deps);
    expect(r.outcome).toBe('success');
    const day = DayFileSchema.parse(r.edition);
    HealthFileSchema.parse(r.health);
    const headlines = day.clusters.flatMap((c) => c.articles.map((a) => a.headline));
    expect(headlines.some((h) => h.includes('SHOCKING'))).toBe(false); // spam
    expect(headlines.some((h) => h.includes('startup raises'))).toBe(false); // stale
    const openai = day.clusters.find((c) => c.articles.some((a) => a.domain === 'techcrunch.com'))!;
    expect(openai.publisherCount).toBe(3); // TechCrunch (Google + GDELT merged), Verge, Reuters
    expect(openai.articles.filter((a) => a.domain === 'techcrunch.com')).toHaveLength(1);
    expect(openai.articles.every((a) => !a.url.includes('news.google.com'))).toBe(true); // real publisher links
    expect(openai.articles.find((a) => a.domain === 'techcrunch.com')?.imageUrl).toContain('openai.jpg'); // merged from GDELT
    expect(openai.lead).toBe(true);
    expect(day.clusters.filter((c) => c.lead)).toHaveLength(1);
    expect(day.clusters.every((c) => c.briefing === null)).toBe(true);
    expect(mem.state.editionWrites).toBe(1);
    expect(r.health.totals.fetched).toBe(googleCands.length + gdeltCands.length + gnewsCands.length + ndCands.length);
  });

  it('drops dead links, recounts publishers and re-ranks', async () => {
    const { deps } = baseDeps({ checkLinks: async (arts) => new Set(arts.filter((a) => a.url.includes('reuters.com')).map((a) => a.id)) });
    const r = await runPipeline(deps);
    expect(r.health.totals.linkRotDropped).toBe(1);
    const openai = r.edition!.clusters.find((c) => c.articles.some((a) => a.domain === 'techcrunch.com'))!;
    expect(openai.publisherCount).toBe(2);
  });

  it('honors the publisher removal blocklist, even for Google-resolved links', async () => {
    const mem = memoryStore({ removals: ['techcrunch.com'] });
    const { deps } = baseDeps({ store: mem.store });
    const r = await runPipeline(deps);
    expect(r.edition!.clusters.flatMap((c) => c.articles).some((a) => a.domain === 'techcrunch.com')).toBe(false);
  });

  it('keeps unresolved Google links as a fallback instead of losing the story', async () => {
    const { deps } = baseDeps({ resolve: async () => null });
    const r = await runPipeline(deps);
    const urls = r.edition!.clusters.flatMap((c) => c.articles.map((a) => a.url));
    expect(urls.some((u) => u.includes('news.google.com'))).toBe(true);
    expect(r.edition!.clusters.length).toBeGreaterThan(0);
  });

  it("evening run keeps the morning's stories; yesterday's stories are not repeated", async () => {
    const first = baseDeps();
    const morning = await runPipeline(first.deps);
    const eveningNow = new Date(NOW.getTime() + 8 * 3_600_000);
    const evening = await runPipeline({ ...first.deps, now: eveningNow, providers: [fakeProvider('gdelt', { LLMs: [gdeltCands[1]!] })] });
    const ids = (d: typeof morning) => new Set(d.edition!.clusters.flatMap((c) => c.articles.map((a) => a.id)));
    for (const id of ids(morning)) expect(ids(evening).has(id)).toBe(true);

    const nextDay = new Date(NOW.getTime() + 24 * 3_600_000);
    const tomorrow = await runPipeline({ ...first.deps, now: nextDay, providers: [fakeProvider('gdelt', { LLMs: [gdeltCands[1]!] })] });
    expect(tomorrow.outcome).toBe('failed'); // only story was already published yesterday, so nothing new
  });
});

describe('failure handling', () => {
  it('ALL providers failed: keeps old data untouched, marks the run failed, writes health', async () => {
    const old = baseDeps();
    await runPipeline(old.deps);
    const before = JSON.stringify([...old.mem.days.entries()]);
    const failing = { ...old.deps, now: new Date(NOW.getTime() + 3_600_000),
      providers: [fakeProvider('google-news', { a: new Error('timeout') }), fakeProvider('gdelt', { b: new Error('HTTP 429') })] };
    const r = await runPipeline(failing);
    expect(r.outcome).toBe('failed');
    expect(r.edition).toBeNull();
    expect(JSON.stringify([...old.mem.days.entries()])).toBe(before);
    expect(old.mem.state.editionWrites).toBe(1);
    expect(r.health.errors.join(' ')).toContain('timeout');
    expect(old.mem.state.health?.outcome).toBe('failed');
  });

  it('providers succeed but return nothing usable: still fails safe', async () => {
    const { deps, mem } = baseDeps({ providers: [fakeProvider('google-news', { a: [] })] });
    const r = await runPipeline(deps);
    expect(r.outcome).toBe('failed');
    expect(mem.state.editionWrites).toBe(0);
  });

  it('one provider failing gives a partial run, not a failed one', async () => {
    const { deps } = baseDeps({ providers: [fakeProvider('google-news', { a: new Error('boom') }), fakeProvider('gdelt', { LLMs: gdeltCands })] });
    const r = await runPipeline(deps);
    expect(r.outcome).toBe('partial');
    expect(r.edition!.clusters.length).toBeGreaterThan(0);
  });

  it('a throwing link checker or briefing step never fails the run', async () => {
    const { deps } = baseDeps({
      checkLinks: async () => { throw new Error('checker exploded'); },
      enrich: async () => { throw new Error('LLM exploded'); },
    });
    const r = await runPipeline(deps);
    expect(r.outcome).toBe('success');
    expect(r.health.errors.join(' ')).toContain('LLM exploded');
    expect(r.edition!.clusters.every((c) => c.briefing === null)).toBe(true);
  });

  it('auto-disables a repeatedly failing source, skips it, and re-tests after a week', async () => {
    let badRuns = 0;
    const mk = () => [fakeProvider('gdelt', { LLMs: gdeltCands }), fakeProvider('google-news', { bad: new Error('nope') }, () => { badRuns++; })];
    const { deps, mem } = baseDeps({ providers: mk() });
    for (let i = 0; i < 3; i++) await runPipeline({ ...deps, now: new Date(NOW.getTime() + i * 60_000), providers: mk(), store: memoryStoreSameHealth(mem) });
    expect(badRuns).toBe(3);
    expect(mem.state.health?.sources.find((s) => s.name === 'bad')?.status).toBe('disabled');
    await runPipeline({ ...deps, now: new Date(NOW.getTime() + 10 * 60_000), providers: mk(), store: memoryStoreSameHealth(mem) });
    expect(badRuns).toBe(3); // skipped
    await runPipeline({ ...deps, now: new Date(NOW.getTime() + 8 * 86_400_000), providers: mk(), store: memoryStoreSameHealth(mem) });
    expect(badRuns).toBe(4); // weekly re-test
  });
});

// same store, but each run sees a fresh day list so repeated runs on the same day do not interfere
function memoryStoreSameHealth(mem: ReturnType<typeof memoryStore>) { return mem.store; }
