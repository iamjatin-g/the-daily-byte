import { describe, it, expect } from 'vitest';
import { mkArticle, testConfig, NOW } from './helpers';
import { relevanceScore, isSpam, filterArticles } from '../worker/filter';

const cfg = testConfig();
const run = (arts: ReturnType<typeof mkArticle>[], removed: string[] = [], c = cfg) =>
  filterArticles(arts, { config: c, removedDomains: removed, now: NOW });

describe('relevance', () => {
  it('scores on-topic headlines high and off-topic zero', () => {
    expect(relevanceScore({ headline: 'New AI research shows LLMs reason better', snippet: '' }, cfg.topics.keywords)).toBeGreaterThan(0.5);
    expect(relevanceScore({ headline: 'Local cricket team wins district final', snippet: '' }, cfg.topics.keywords)).toBe(0);
  });
  it('counts snippet hits at a discount', () => {
    const head = relevanceScore({ headline: 'Machine learning breakthrough', snippet: '' }, cfg.topics.keywords);
    const snip = relevanceScore({ headline: 'Big breakthrough announced', snippet: 'machine learning' }, cfg.topics.keywords);
    expect(snip).toBeLessThan(head);
    expect(snip).toBeGreaterThan(0);
  });
});

describe('spam and clickbait', () => {
  it('catches blocklisted phrases, shouting and !!!', () => {
    expect(isSpam("You won't believe this AI", cfg.spamBlocklist)).toBe(true);
    expect(isSpam('You won’t believe this AI', cfg.spamBlocklist)).toBe(true);
    expect(isSpam('AI COMPANY ANNOUNCES HUGE NEWS TODAY', cfg.spamBlocklist)).toBe(true);
    expect(isSpam('Wow!! Amazing', cfg.spamBlocklist)).toBe(true);
    expect(isSpam('OpenAI launches a new model', cfg.spamBlocklist)).toBe(false);
  });
});

describe('filterArticles', () => {
  it('drops spam, stale and irrelevant (non-queried) articles with counts', () => {
    const r = run([
      mkArticle({ headline: 'SHOCKING: this AI trick!!!', domain: 'a.com' }),
      mkArticle({ publishedAt: '2026-10-01T00:00:00.000Z', domain: 'b.com' }),
      mkArticle({ headline: 'Local cricket team wins final', queried: false, domain: 'c.com' }),
      mkArticle({ headline: 'AI research lab publishes LLM paper', queried: false, domain: 'd.com' }),
    ]);
    expect(r.dropped).toEqual({ spam: 1, irrelevant: 1, blocked: 0, stale: 1, capped: 0 });
    expect(r.kept).toHaveLength(1);
  });
  it('honors block list, publisher removals (incl. subdomains) and an allow list', () => {
    const arts = [mkArticle({ domain: 'blocked.com' }), mkArticle({ domain: 'news.removed.org' }), mkArticle({ domain: 'fine.com' })];
    const c = testConfig((x) => { x.sources.blockDomains = ['blocked.com']; });
    expect(run(arts, ['removed.org'], c).kept.map((a) => a.domain)).toEqual(['fine.com']);
    const allow = testConfig((x) => { x.sources.allowDomains = ['fine.com']; });
    expect(run(arts, [], allow).kept.map((a) => a.domain)).toEqual(['fine.com']);
  });
  it('caps articles per publisher, keeping the newest', () => {
    const arts = Array.from({ length: 7 }, (_, i) =>
      mkArticle({ domain: 'big.com', publishedAt: `2026-10-18T0${i}:00:00.000Z` }));
    const r = run(arts);
    expect(r.kept).toHaveLength(cfg.sources.maxArticlesPerSource);
    expect(r.dropped.capped).toBe(2);
    expect(r.kept.some((a) => a.publishedAt.startsWith('2026-10-18T00'))).toBe(false);
  });
  it('carried-over articles skip spam/age checks but still obey removals', () => {
    const carried = mkArticle({ sourceKey: 'carry', publishedAt: '2026-10-01T00:00:00.000Z', domain: 'old.com' });
    expect(run([carried]).kept).toHaveLength(1);
    expect(run([carried], ['old.com']).kept).toHaveLength(0);
  });
  it('tracks per-source spam counts for self-healing', () => {
    const r = run([mkArticle({ headline: 'SHOCKING trick!!!', sourceKey: 'x:y' }), mkArticle({ sourceKey: 'x:y', domain: 'z.com' })]);
    expect(r.bySource.get('x:y')).toEqual({ seen: 2, spam: 1 });
  });
});
