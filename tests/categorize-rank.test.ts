import { describe, it, expect } from 'vitest';
import { mkArticle, testConfig, NOW } from './helpers';
import { classify, categorizeCluster } from '../worker/categorize';
import { buildClusters, rankClusters, reliabilityOf } from '../worker/rank';
import { applyLinkRot } from '../worker/linkrot';

const cfg = testConfig();

describe('categorization', () => {
  it('classifies by keyword hits and falls back to general', () => {
    expect(classify('New benchmark paper from researchers', cfg.categories)).toBe('research');
    expect(classify('Startup closes funding round', cfg.categories)).toBe('industry');
    expect(classify('Something entirely unrelated', cfg.categories)).toBe('general');
  });
  it('a feed-provided category wins when it matches ours', () => {
    expect(classify('Startup closes funding round', cfg.categories, 'Policy & Safety')).toBe('policy');
    expect(classify('Startup closes funding round', cfg.categories, 'Weird Feed Label')).toBe('industry');
  });
  it('cluster category is a majority vote, with keyword tie-break', () => {
    const a = (category: string, headline = 'x headline here') => mkArticle({ category, headline });
    expect(categorizeCluster([a('models'), a('models'), a('policy')], cfg.categories)).toBe('models');
    expect(categorizeCluster([a('models', 'new gpt release'), a('policy', 'new gpt launch')], cfg.categories)).toBe('models');
  });
});

describe('ranking', () => {
  const raw = (id: string, arts: ReturnType<typeof mkArticle>[]) => ({ id, articles: arts });
  const A = raw('A', ['a.com', 'b.com', 'c.com'].map((d) => mkArticle({ domain: d, category: 'models', publishedAt: '2026-10-18T04:30:00.000Z' })));
  const B = raw('B', [mkArticle({ domain: 'd.com', category: 'models', publishedAt: '2026-10-18T04:30:00.000Z' })]);
  const C = raw('C', ['e.com', 'f.com'].map((d) => mkArticle({ domain: d, category: 'research', publishedAt: '2026-10-16T14:00:00.000Z' })));

  it('orders by publishers, recency and reliability', () => {
    const r = rankClusters(buildClusters([C, B, A], cfg, NOW), cfg);
    expect(r.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(r[0]?.publisherCount).toBe(3);
  });
  it('features top N per category and exactly one lead', () => {
    const c1 = testConfig((x) => { x.pipeline.featuredPerCategory = 1; });
    const r = rankClusters(buildClusters([A, B, C], c1, NOW), c1);
    expect(r.filter((c) => c.featured).map((c) => c.id).sort()).toEqual(['A', 'C']);
    expect(r.filter((c) => c.lead).map((c) => c.id)).toEqual(['A']);
  });
  it('source reliability breaks near-ties', () => {
    const c1 = testConfig((x) => { x.sources.reliability = { 'trusted.com': 1 }; });
    const t = raw('T', [mkArticle({ domain: 'trusted.com', category: 'models' })]);
    const u = raw('U', [mkArticle({ domain: 'unknown.com', category: 'models' })]);
    expect(rankClusters(buildClusters([u, t], c1, NOW), c1)[0]?.id).toBe('T');
    expect(reliabilityOf('news.trusted.com', c1)).toBe(1);
    expect(reliabilityOf('nobody.com', c1)).toBe(0.5);
  });
  it('dead links shrink clusters and drop empty ones; publisher count updates', () => {
    const built = buildClusters([A, B], cfg, NOW);
    const deadIds = new Set([A.articles[0]!.id, B.articles[0]!.id]);
    const { clusters, dropped } = applyLinkRot(built, deadIds);
    expect(dropped).toBe(2);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.publisherCount).toBe(2);
  });
});
