import type { Candidate, Provider } from '../types';
import { fetchText } from '../lib/http';
import { parseFeed, type RawItem } from '../lib/feed';
import { domainOf, stripHtml } from '../lib/text';
import { sourceKey } from '../sourceHealth';

export function googleNewsUrl(keyword: string, lang: string, region: string): string {
  const q = encodeURIComponent(`${keyword} when:1d`);
  return `https://news.google.com/rss/search?q=${q}&hl=${lang}-${region}&gl=${region}&ceid=${region}:${lang}`;
}

/** Google titles look like "Headline - Publisher"; the <source> tag names the publisher. */
export function mapGoogleItem(item: RawItem, key: string): Candidate | null {
  if (!item.link || !item.title) return null;
  let name = '';
  let srcUrl = '';
  const src = item.source;
  if (typeof src === 'string') name = src;
  else if (src && typeof src === 'object') {
    name = src._ ?? '';
    srcUrl = src.$?.url ?? '';
  }
  let headline = stripHtml(item.title);
  if (name && headline.endsWith(` - ${name}`)) headline = headline.slice(0, -(name.length + 3)).trim();
  else if (!name) {
    const i = headline.lastIndexOf(' - ');
    if (i > 20) {
      name = headline.slice(i + 3).trim();
      headline = headline.slice(0, i).trim();
    }
  }
  return {
    headline,
    source: name || 'Unknown',
    domain: srcUrl ? domainOf(srcUrl) : undefined,
    publishedAt: item.isoDate ?? item.pubDate,
    snippet: '', // Google's description only repeats headlines; the briefing layer fills this
    imageUrl: null,
    url: item.link,
    provider: 'google-news',
    sourceKey: key,
    queried: true,
  };
}

export const googleNews: Provider = {
  name: 'google-news',
  jobs: (ctx) =>
    ctx.config.topics.keywords.map((kw) => ({
      provider: 'google-news',
      name: kw,
      run: async () => {
        const key = sourceKey('google-news', kw);
        const xml = await fetchText(ctx.fetch, googleNewsUrl(kw, ctx.config.site.language, ctx.config.site.region));
        const { items } = await parseFeed(xml);
        return items.slice(0, 40).map((i) => mapGoogleItem(i, key)).filter((c): c is Candidate => c !== null);
      },
    })),
};
