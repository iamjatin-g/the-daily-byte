import type { Candidate, Ctx, Job } from '../types';
import { fetchText } from '../lib/http';
import { parseFeed, mapFeedItem } from '../lib/feed';
import { robotsAllows, type RobotsRules } from '../lib/robots';
import { sourceKey } from '../sourceHealth';

const GUESSES = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml'];

/** Finds <link rel="alternate" type="application/rss+xml|atom+xml"> in a homepage. */
export async function extractFeedLinks(html: string, baseUrl: string): Promise<string[]> {
  const { load } = await import('cheerio');
  const $ = load(html);
  const out: string[] = [];
  $('link[rel="alternate"]').each((_, el) => {
    const type = ($(el).attr('type') ?? '').toLowerCase();
    const href = $(el).attr('href');
    if (href && (type.includes('rss') || type.includes('atom'))) {
      try {
        out.push(new URL(href, baseUrl).toString());
      } catch {
        /* ignore malformed href */
      }
    }
  });
  return out;
}

/** One job per publisher domain: homepage -> feed link -> items. Respects robots.txt. */
export function feedJobs(ctx: Ctx, domains: string[], robots: Map<string, RobotsRules> = new Map()): Job[] {
  return domains.map((domain) => ({
    provider: 'feed',
    name: domain,
    run: async (): Promise<Candidate[]> => {
      const key = sourceKey('feed', domain);
      const home = `https://${domain}/`;
      if (!(await robotsAllows(ctx.fetch, home, robots))) throw new Error('robots.txt disallows or is unreadable');
      const html = await fetchText(ctx.fetch, home);
      const found = await extractFeedLinks(html, home);
      const links = [...new Set([...found, ...GUESSES.map((g) => new URL(g, home).toString())])].slice(0, 4);
      for (const link of links) {
        try {
          if (!(await robotsAllows(ctx.fetch, link, robots))) continue;
          const feed = await parseFeed(await fetchText(ctx.fetch, link));
          const items = feed.items
            .slice(0, 20)
            .map((i) => mapFeedItem(i, feed.title, domain, key))
            .filter((c): c is Candidate => c !== null);
          if (items.length) return items;
        } catch {
          /* try next candidate link */
        }
      }
      throw new Error('no usable feed found');
    },
  }));
}
