// Pure helpers shared by the build (views) and the browser script. No Node imports here.
import type { Article, Cluster } from './schemas';

export const IST = 'Asia/Kolkata';
const MIN = 60_000;
const HOUR = 3_600_000;

export function istDay(d: Date): string {
  return new Date(d.getTime() + 5.5 * HOUR).toISOString().slice(0, 10);
}

/** "just now", "12 min ago", "3 h ago", "2 d ago", then a short date. */
export function relativeTime(iso: string, now: Date): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = now.getTime() - t;
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 7 * 24 * HOUR) return `${Math.floor(diff / (24 * HOUR))} d ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: IST }).format(t);
}

/** Freshness indicator: "new" under 3 hours, "today" within the same IST day, otherwise "earlier". */
export function freshness(iso: string, now: Date): 'new' | 'today' | 'earlier' {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'earlier';
  if (now.getTime() - t < 3 * HOUR) return 'new';
  return istDay(new Date(t)) === istDay(now) ? 'today' : 'earlier';
}

export function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST,
  }).format(t);
  return `${s} IST`;
}

export function formatDay(date: string): string {
  const t = Date.parse(`${date}T12:00:00Z`);
  if (Number.isNaN(t)) return date;
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(t);
}

export function editionLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Latest edition';
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: IST }).format(t)) % 24;
  return h < 12 ? 'Morning edition' : h < 17 ? 'Afternoon edition' : 'Evening edition';
}

export const isStale = (generatedAt: string, now: Date, hours = 18): boolean => {
  const t = Date.parse(generatedAt);
  return Number.isNaN(t) || now.getTime() - t > hours * HOUR;
};

/** The article a card's headline links to (articles are pre-sorted by source reliability). */
export const primaryArticle = (c: Cluster): Article => c.articles[0] as Article;

export const cardImage = (c: Cluster): string | null => c.articles.find((a) => a.imageUrl)?.imageUrl ?? null;

/** AI briefing if present, else the longest publisher snippet, else nothing. */
export function blurb(c: Cluster): { kind: 'briefing' | 'snippet' | 'none'; text: string; why: string } {
  if (c.briefing) return { kind: 'briefing', text: c.briefing.summary, why: c.briefing.whyItMatters };
  const best = [...c.articles].sort((a, b) => b.snippet.length - a.snippet.length)[0];
  return best && best.snippet ? { kind: 'snippet', text: best.snippet, why: '' } : { kind: 'none', text: '', why: '' };
}

export const categoryLabel = (id: string, cats: { id: string; label: string }[]): string =>
  cats.find((c) => c.id === id)?.label ?? id;

export interface SourceOption { value: string; label: string; count: number }

/** Publishers present in a set of stories, for the source filter. */
export function sourceOptions(clusters: Cluster[]): SourceOption[] {
  const map = new Map<string, SourceOption>();
  for (const c of clusters) {
    for (const d of new Set(c.articles.map((a) => a.domain))) {
      const art = c.articles.find((a) => a.domain === d) as Article;
      const cur = map.get(d) ?? { value: d, label: art.source, count: 0 };
      cur.count++;
      map.set(d, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Coverage ledger rows: publishers in the order they reported, with a 0-100 position on the time track. */
export function ledger(c: Cluster): { article: Article; pos: number }[] {
  const rows = [...c.articles].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const times = rows.map((a) => Date.parse(a.publishedAt));
  const min = Math.min(...times);
  const span = Math.max(...times) - min;
  return rows.map((article, i) => ({ article, pos: span === 0 ? 50 : Math.round(((times[i] as number) - min) / span * 100) }));
}

export const publishersText = (n: number): string => (n === 1 ? 'Reported by 1 publisher' : `Covered by ${n} publishers`);
