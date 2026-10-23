import type { Candidate, Provider } from '../types';
import { fetchText } from '../lib/http';
import { sourceKey } from '../sourceHealth';

interface GdeltArticle {
  url?: string; title?: string; seendate?: string; socialimage?: string; domain?: string;
}

const LANGS: Record<string, string> = { en: 'english', hi: 'hindi', mr: 'marathi' };

export function gdeltUrl(keyword: string, lang: string): string {
  const q = encodeURIComponent(`"${keyword}" sourcelang:${LANGS[lang] ?? 'english'}`);
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&maxrecords=50&timespan=1d&sort=datedesc`;
}

/** GDELT dates look like 20261018T031000Z. */
export function parseGdeltDate(s: string | undefined): string | null {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z` : null;
}

export function mapGdeltArticle(a: GdeltArticle, key: string): Candidate | null {
  if (!a.url || !a.title) return null;
  return {
    headline: a.title,
    source: a.domain ?? '',
    domain: a.domain,
    publishedAt: parseGdeltDate(a.seendate),
    snippet: '',
    imageUrl: a.socialimage || null,
    url: a.url,
    provider: 'gdelt',
    sourceKey: key,
    queried: true,
  };
}

export const gdelt: Provider = {
  name: 'gdelt',
  jobs: (ctx) =>
    ctx.config.topics.keywords.map((kw) => ({
      provider: 'gdelt',
      name: kw,
      run: async () => {
        const key = sourceKey('gdelt', kw);
        const text = await fetchText(ctx.fetch, gdeltUrl(kw, ctx.config.site.language));
        let data: { articles?: GdeltArticle[] };
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`GDELT returned non-JSON: ${text.slice(0, 80)}`);
        }
        return (data.articles ?? []).map((a) => mapGdeltArticle(a, key)).filter((c): c is Candidate => c !== null);
      },
    })),
};
