import type { DayFile } from './schemas';
import { categoryLabel, primaryArticle, formatDateTime } from './format';

export interface SearchRecord {
  url: string;
  content: string;
  language: string;
  meta: { title: string; source: string; date: string; category: string; publishers: string };
  filters: { category: string[]; source: string[] };
}

/** One searchable record per story. Results link straight to the publisher's article. */
export function toSearchRecords(days: DayFile[], language: string, cats: { id: string; label: string }[]): SearchRecord[] {
  const seen = new Set<string>();
  const out: SearchRecord[] = [];
  for (const day of days) {
    for (const c of day.clusters) {
      const a = primaryArticle(c);
      if (seen.has(a.url)) continue;
      seen.add(a.url);
      const content = [
        c.headline,
        c.briefing?.summary ?? '',
        c.briefing?.whyItMatters ?? '',
        ...c.articles.map((x) => x.snippet),
        ...c.articles.map((x) => x.source),
      ].filter(Boolean).join('. ');
      out.push({
        url: a.url,
        content,
        language,
        meta: {
          title: c.headline,
          source: a.source,
          date: formatDateTime(c.publishedAt),
          category: categoryLabel(c.category, cats),
          publishers: String(c.publisherCount),
        },
        filters: { category: [c.category], source: [...new Set(c.articles.map((x) => x.source))] },
      });
    }
  }
  return out;
}
