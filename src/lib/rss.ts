import type { Cluster } from './schemas';
import { primaryArticle } from './format';

// eslint-disable-next-line no-control-regex
const BAD_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

export function escapeXml(s: string): string {
  return s.replace(BAD_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export interface RssOptions {
  siteName: string; siteUrl: string; description: string; language: string; clusters: Cluster[]; now: Date;
}

/** Our own feed: one item per featured story, linking to the original article. */
export function buildRss(o: RssOptions): string {
  const base = o.siteUrl.replace(/\/$/, '');
  const items = o.clusters.map((c) => {
    const a = primaryArticle(c);
    const sources = c.articles.map((x) => x.source).join(', ');
    const text = c.briefing ? `${c.briefing.summary} Why it matters: ${c.briefing.whyItMatters}` : (a.snippet || c.headline);
    return [
      '    <item>',
      `      <title>${escapeXml(c.headline)}</title>`,
      `      <link>${escapeXml(a.url)}</link>`,
      `      <guid isPermaLink="false">${escapeXml(c.id)}</guid>`,
      `      <pubDate>${new Date(c.publishedAt).toUTCString()}</pubDate>`,
      `      <description>${escapeXml(`${text} Sources: ${sources}.`)}</description>`,
      '    </item>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(o.siteName)}</title>`,
    `    <link>${escapeXml(base + '/')}</link>`,
    `    <description>${escapeXml(o.description)}</description>`,
    `    <language>${escapeXml(o.language)}</language>`,
    `    <lastBuildDate>${o.now.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(base + '/rss.xml')}" rel="self" type="application/rss+xml" />`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
