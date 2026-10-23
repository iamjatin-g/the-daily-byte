// These tests need the real rss-parser and cheerio packages (run via `npm test`).
import { describe, it, expect } from 'vitest';
import { fixtureText, testConfig, NOW } from './helpers';
import { parseFeed } from '../worker/lib/feed';
import { mapGoogleItem } from '../worker/providers/googleNews';
import { extractFeedLinks, feedJobs } from '../worker/providers/feedDiscovery';
import type { FetchFn } from '../worker/types';

describe('XML and HTML parsing with real libraries', () => {
  it('rss-parser reads a Google News feed including the <source> tag', async () => {
    const { items } = await parseFeed(fixtureText('google-news.xml'));
    expect(items).toHaveLength(2);
    const c = mapGoogleItem(items[0]!, 'k');
    expect(c?.headline).toBe('OpenAI launches new reasoning model for developers');
    expect(c?.source).toBe('TechCrunch');
    expect(c?.domain).toBe('techcrunch.com');
    expect(c?.publishedAt).toBeTruthy();
  });
  it('finds RSS and Atom <link rel="alternate"> tags', async () => {
    const links = await extractFeedLinks(fixtureText('homepage.html'), 'https://example-tech.test/');
    expect(links).toEqual(['https://example-tech.test/rss/all.xml', 'https://example-tech.test/atom']);
  });
  it('feed discovery: robots -> homepage -> feed -> candidates', async () => {
    const files: Record<string, string> = {
      'https://example-tech.test/robots.txt': 'User-agent: *\nDisallow: /admin\n',
      'https://example-tech.test/': fixtureText('homepage.html'),
      'https://example-tech.test/rss/all.xml': fixtureText('publisher-feed.xml'),
    };
    const f: FetchFn = async (u) => (files[u] ? new Response(files[u]) : new Response('nope', { status: 404 }));
    const [job] = feedJobs({ config: testConfig(), fetch: f, now: NOW, env: {} }, ['example-tech.test']);
    const out = await job!.run();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: 'Example Tech', category: 'Research', imageUrl: 'https://example-tech.test/t.jpg' });
  });
  it('feed discovery refuses sites whose robots.txt blocks us', async () => {
    const f: FetchFn = async (u) => new Response(u.endsWith('robots.txt') ? 'User-agent: *\nDisallow: /\n' : 'x');
    const [job] = feedJobs({ config: testConfig(), fetch: f, now: NOW, env: {} }, ['blocked.test']);
    let msg = '';
    try { await job!.run(); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('robots.txt');
  });
});
