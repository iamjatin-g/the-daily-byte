import type { Candidate } from '../types';
import { domainOf } from './text';

export interface RawItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  categories?: string[];
  enclosure?: { url?: string; type?: string };
  source?: string | { _?: string; $?: { url?: string } };
  mediaContent?: { $?: { url?: string } };
  mediaThumbnail?: { $?: { url?: string } };
  'content:encoded'?: string;
}
export interface ParsedFeed {
  title: string;
  items: RawItem[];
}

/** rss-parser is loaded lazily so pure logic can be tested without it. */
export async function parseFeed(xml: string): Promise<ParsedFeed> {
  const { default: Parser } = await import('rss-parser');
  const parser = new Parser({
    customFields: {
      item: [
        ['source', 'source'],
        ['media:content', 'mediaContent'],
        ['media:thumbnail', 'mediaThumbnail'],
      ],
    },
  });
  const feed = await parser.parseString(xml);
  return { title: feed.title ?? '', items: feed.items as unknown as RawItem[] };
}

export function imageOfItem(item: RawItem): string | null {
  const enc = item.enclosure;
  if (enc?.url && (!enc.type || enc.type.startsWith('image'))) return enc.url;
  const media = item.mediaContent?.$?.url ?? item.mediaThumbnail?.$?.url;
  if (media) return media;
  const html = item['content:encoded'] ?? item.content ?? '';
  return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;
}

/** Map a generic RSS/Atom item. Only metadata is kept: never article body text. */
export function mapFeedItem(
  item: RawItem,
  source: string,
  domain: string,
  sourceKey: string,
): Candidate | null {
  if (!item.link || !item.title) return null;
  return {
    headline: item.title,
    source: source || domain,
    domain: domain || domainOf(item.link),
    publishedAt: item.isoDate ?? item.pubDate,
    snippet: item.contentSnippet ?? item.summary ?? item.content ?? '',
    imageUrl: imageOfItem(item),
    url: item.link,
    category: item.categories?.[0] ?? null,
    provider: 'feed',
    sourceKey,
    queried: false,
  };
}
