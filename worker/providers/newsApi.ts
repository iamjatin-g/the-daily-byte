import type { Candidate, Provider } from '../types';
import { fetchText } from '../lib/http';
import { sourceKey } from '../sourceHealth';

interface GnewsArticle {
  title?: string; description?: string; url?: string; image?: string; publishedAt?: string;
  source?: { name?: string; url?: string };
}
interface NewsdataArticle {
  title?: string; link?: string; description?: string; pubDate?: string; image_url?: string;
  source_name?: string; source_url?: string;
}

export function mapGnewsArticle(a: GnewsArticle, key: string): Candidate | null {
  if (!a.url || !a.title) return null;
  return {
    headline: a.title, source: a.source?.name ?? '', domain: a.source?.url ? new URL(a.source.url).hostname : undefined,
    publishedAt: a.publishedAt, snippet: a.description ?? '', imageUrl: a.image ?? null, url: a.url,
    provider: 'gnews', sourceKey: key, queried: true,
  };
}

/** NewsData dates are UTC without a zone suffix: "2026-10-18 03:10:00". */
export function mapNewsdataArticle(a: NewsdataArticle, key: string): Candidate | null {
  if (!a.link || !a.title) return null;
  const when = a.pubDate ? a.pubDate.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(a.pubDate) ? '' : 'Z') : undefined;
  let domain: string | undefined;
  try {
    domain = a.source_url ? new URL(a.source_url).hostname : undefined;
  } catch {
    domain = undefined;
  }
  return {
    headline: a.title, source: a.source_name ?? '', domain, publishedAt: when,
    snippet: a.description ?? '', imageUrl: a.image_url ?? null, url: a.link,
    provider: 'newsdata', sourceKey: key, queried: true,
  };
}

/** Optional provider: only active if config picks one AND its key is in the environment. */
export const newsApi: Provider = {
  name: 'news-api',
  jobs: (ctx) => {
    const choice = ctx.config.sources.optionalNewsApi;
    const { language: lang, region } = ctx.config.site;
    if (choice === 'gnews' && ctx.env.GNEWS_API_KEY) {
      const apikey = ctx.env.GNEWS_API_KEY;
      return ctx.config.topics.keywords.map((kw) => ({
        provider: 'gnews', name: kw,
        run: async () => {
          const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(kw)}&lang=${lang}&country=${region.toLowerCase()}&max=10&apikey=${apikey}`;
          const data = JSON.parse(await fetchText(ctx.fetch, url)) as { articles?: GnewsArticle[] };
          return (data.articles ?? []).map((a) => mapGnewsArticle(a, sourceKey('gnews', kw))).filter((c): c is Candidate => c !== null);
        },
      }));
    }
    if (choice === 'newsdata' && ctx.env.NEWSDATA_API_KEY) {
      const apikey = ctx.env.NEWSDATA_API_KEY;
      return ctx.config.topics.keywords.map((kw) => ({
        provider: 'newsdata', name: kw,
        run: async () => {
          const url = `https://newsdata.io/api/1/latest?apikey=${apikey}&q=${encodeURIComponent(kw)}&language=${lang}&country=${region.toLowerCase()}`;
          const data = JSON.parse(await fetchText(ctx.fetch, url)) as { results?: NewsdataArticle[] };
          return (data.results ?? []).map((a) => mapNewsdataArticle(a, sourceKey('newsdata', kw))).filter((c): c is Candidate => c !== null);
        },
      }));
    }
    return [];
  },
};
