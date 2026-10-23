import { describe, it, expect } from 'vitest';
import { fixture, testConfig, NOW, fakeGoogleLink } from './helpers';
import type { RawItem } from '../worker/lib/feed';
import { mapFeedItem, imageOfItem } from '../worker/lib/feed';
import { mapGoogleItem, googleNewsUrl } from '../worker/providers/googleNews';
import { mapGdeltArticle, parseGdeltDate, gdeltUrl } from '../worker/providers/gdelt';
import { mapGnewsArticle, mapNewsdataArticle } from '../worker/providers/newsApi';
import { decodeGoogleNewsUrl } from '../worker/lib/resolve';
import { parseRobots, isAllowed } from '../worker/lib/robots';
import { toWorkArticle } from '../worker/normalize';

const cfg = testConfig();

describe('provider parsing (fixtures)', () => {
  it('Google News: splits publisher from headline and reads <source>', () => {
    const items = fixture<RawItem[]>('google-news.items.json');
    const c = mapGoogleItem(items[0] as RawItem, 'k');
    expect(c?.headline).toBe('OpenAI launches new reasoning model for developers');
    expect(c?.source).toBe('TechCrunch');
    expect(c?.domain).toBe('techcrunch.com');
    expect(mapGoogleItem({ title: 'x' }, 'k')).toBeNull();
  });
  it('Google News: falls back to the " - Publisher" suffix when <source> is missing', () => {
    const c = mapGoogleItem({ title: 'A long enough headline about robots - Wired', link: 'https://x.test/a' }, 'k');
    expect(c?.source).toBe('Wired');
    expect(c?.headline).toBe('A long enough headline about robots');
  });
  it('builds Google News and GDELT query URLs with region/language', () => {
    expect(googleNewsUrl('AI research', 'en', 'IN')).toContain('ceid=IN:en');
    expect(gdeltUrl('LLMs', 'en')).toContain('sourcelang%3Aenglish');
  });
  it('GDELT: maps articles and parses its date format', () => {
    const data = fixture<{ articles: Record<string, string>[] }>('gdelt.json');
    const c = mapGdeltArticle(data.articles[0]!, 'k');
    expect(c?.publishedAt).toBe('2026-10-18T03:30:00.000Z');
    expect(c?.imageUrl).toContain('openai.jpg');
    expect(mapGdeltArticle(data.articles[1]!, 'k')?.imageUrl).toBeNull();
    expect(parseGdeltDate('garbage')).toBeNull();
  });
  it('GNews and NewsData map correctly (NewsData date gets a Z)', () => {
    const g = fixture<{ articles: Record<string, unknown>[] }>('gnews.json');
    expect(mapGnewsArticle(g.articles[0]!, 'k')?.domain).toBe('www.livemint.com');
    const n = fixture<{ results: Record<string, unknown>[] }>('newsdata.json');
    expect(mapNewsdataArticle(n.results[0]!, 'k')?.publishedAt).toBe('2026-10-18T01:30:00Z');
  });
  it('generic feed item: picks thumbnail and category hint', () => {
    const c = mapFeedItem(
      { title: 'T', link: 'https://a.test/x', categories: ['Research'], mediaThumbnail: { $: { url: 'https://a.test/t.jpg' } } },
      'A', 'a.test', 'k',
    );
    expect(c?.imageUrl).toBe('https://a.test/t.jpg');
    expect(c?.category).toBe('Research');
    expect(imageOfItem({ content: '<p><img src="https://a.test/i.png"></p>' })).toBe('https://a.test/i.png');
  });
  it('decodes legacy Google News links round-trip', () => {
    const real = 'https://www.theverge.com/2026/10/18/openai-reasoning-model';
    expect(decodeGoogleNewsUrl(fakeGoogleLink(real))).toBe(real);
    expect(decodeGoogleNewsUrl('https://news.google.com/rss/articles/AU_notDecodable123')).toBeNull();
  });
  it('robots.txt: longest rule wins, bot group preferred', () => {
    const r = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/ok\n');
    expect(isAllowed(r, '/news')).toBe(true);
    expect(isAllowed(r, '/private/x')).toBe(false);
    expect(isAllowed(r, '/private/ok/y')).toBe(true);
    expect(isAllowed(parseRobots('User-agent: *\nDisallow: /\n'), '/')).toBe(false);
  });
});

describe('sanitizing into stored fields', () => {
  const base = { headline: 'A valid headline for testing', source: 'S', url: 'https://s.test/a', provider: 'p', sourceKey: 'p:k', queried: true, publishedAt: '2026-10-18T05:00:00Z' };
  it('strips HTML from snippet and caps its length', () => {
    const a = toWorkArticle({ ...base, snippet: `<p>${'word '.repeat(100)}</p><script>x()</script>` }, cfg, NOW);
    expect(a?.snippet.includes('<')).toBe(false);
    expect(a!.snippet.length).toBeLessThanOrEqual(cfg.pipeline.snippetMaxChars + 1);
  });
  it('drops a snippet that merely repeats the headline', () => {
    expect(toWorkArticle({ ...base, snippet: 'A valid headline for testing!' }, cfg, NOW)?.snippet).toBe('');
  });
  it('clamps future dates and rejects missing or bad data', () => {
    expect(toWorkArticle({ ...base, publishedAt: '2030-01-01T00:00:00Z' }, cfg, NOW)?.publishedAt).toBe(NOW.toISOString());
    expect(toWorkArticle({ ...base, publishedAt: undefined }, cfg, NOW)).toBeNull();
    expect(toWorkArticle({ ...base, url: 'javascript:alert(1)' }, cfg, NOW)).toBeNull();
    expect(toWorkArticle({ ...base, headline: 'short' }, cfg, NOW)).toBeNull();
  });
  it('rejects non-http image URLs', () => {
    expect(toWorkArticle({ ...base, imageUrl: 'javascript:alert(1)' }, cfg, NOW)?.imageUrl).toBeNull();
  });
  it('gives unresolved Google links a stable per-publisher domain', () => {
    const a = toWorkArticle({ ...base, url: 'https://news.google.com/rss/articles/abc', source: 'Mint Daily' }, cfg, NOW);
    expect(a?.domain).toBe('unknown-mint-daily');
    expect(a?.resolved).toBe(false);
  });
});
