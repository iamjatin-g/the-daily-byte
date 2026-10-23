import { describe, it, expect } from 'vitest';
import { mkArticle, testConfig } from './helpers';
import { dedupe } from '../worker/dedupe';
import { clusterArticles, similarity } from '../worker/cluster';
import { tokens } from '../worker/lib/text';

describe('dedupe', () => {
  it('removes identical canonical URLs', () => {
    const a = mkArticle({ url: 'https://x.test/a' });
    expect(dedupe([a, { ...a }])).toHaveLength(1);
  });
  it('removes same title from the same publisher, keeps it across publishers', () => {
    const h = 'Big AI announcement today';
    expect(dedupe([mkArticle({ headline: h, domain: 'a.com' }), mkArticle({ headline: h + '!', domain: 'a.com' })])).toHaveLength(1);
    expect(dedupe([mkArticle({ headline: h, domain: 'a.com' }), mkArticle({ headline: h, domain: 'b.com' })])).toHaveLength(2);
  });
  it('merges the image and snippet from the duplicate', () => {
    const a = mkArticle({ url: 'https://x.test/a', imageUrl: null, snippet: '' });
    const b = mkArticle({ url: 'https://x.test/a', imageUrl: 'https://x.test/i.jpg', snippet: 'Has text' });
    const [m] = dedupe([a, b]);
    expect(m?.imageUrl).toBe('https://x.test/i.jpg');
    expect(m?.snippet).toBe('Has text');
  });
});

const H = {
  a: 'OpenAI launches new reasoning model for developers',
  b: 'OpenAI releases new reasoning model aimed at developers',
  c: 'OpenAI unveils reasoning model for developers',
  d: 'Researchers publish benchmark for LLM reasoning',
};

describe('clustering', () => {
  const thr = testConfig().pipeline.similarityThreshold;
  it('groups differently-worded headlines about one story', () => {
    const arts = [H.a, H.b, H.c, H.d].map((h, i) => mkArticle({ headline: h, domain: `p${i}.com` }));
    const cl = clusterArticles(arts, thr).map((c) => c.articles.length).sort();
    expect(cl).toEqual([1, 3]);
  });
  it('does not merge unrelated stories', () => {
    const arts = [H.a, H.d, 'EU proposes strict chip export rules'].map((h, i) => mkArticle({ headline: h, domain: `p${i}.com` }));
    expect(clusterArticles(arts, thr)).toHaveLength(3);
  });
  it('caps cluster size so chaining cannot build a mega-story', () => {
    const arts = Array.from({ length: 25 }, (_, i) => mkArticle({ headline: H.a, domain: `p${i}.com` }));
    expect(Math.max(...clusterArticles(arts, thr).map((c) => c.articles.length))).toBeLessThanOrEqual(15);
  });
  it('is stable: the same input gives the same cluster ids', () => {
    const arts = [H.a, H.b].map((h, i) => mkArticle({ headline: h, domain: `p${i}.com`, url: `https://p${i}.com/x` }));
    expect(clusterArticles(arts, thr)[0]?.id).toBe(clusterArticles([...arts].reverse(), thr)[0]?.id);
  });
  it('similarity is symmetric and bounded', () => {
    const s = similarity(tokens(H.a), tokens(H.b));
    expect(s).toBe(similarity(tokens(H.b), tokens(H.a)));
    expect(s).toBeGreaterThan(0.6);
    expect(similarity([], [])).toBe(0);
  });
});
