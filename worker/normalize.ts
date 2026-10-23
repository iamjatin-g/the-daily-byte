import type { Config } from '../src/lib/schemas';
import type { Candidate, WorkArticle } from './types';
import { canonicalUrl, domainOf, normalizeTitle, sha, slug, stripHtml, truncate } from './lib/text';

/** Sanitize a raw candidate into the ONLY fields we ever store. Returns null if unusable. */
function buildWorkArticle(c: Candidate, cfg: Config, now: Date): WorkArticle | null {
  const url = canonicalUrl(c.url);
  if (!url) return null;
  const headline = stripHtml(c.headline).slice(0, 300);
  if (headline.length < 8) return null;
  const t = c.publishedAt ? new Date(c.publishedAt) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  const published = t.getTime() > now.getTime() + 3_600_000 ? now : t; // clamp future dates

  const isGoogle = domainOf(url) === 'news.google.com';
  const source = stripHtml(c.source).slice(0, 80);
  let domain = (c.domain ? domainOf(`https://${c.domain}`) : '') || domainOf(url);
  if (domain === 'news.google.com') domain = `unknown-${slug(source)}`;

  let snippet = truncate(stripHtml(c.snippet ?? ''), cfg.pipeline.snippetMaxChars);
  if (normalizeTitle(snippet) === normalizeTitle(headline)) snippet = '';

  let imageUrl: string | null = null;
  if (c.imageUrl) {
    try {
      const u = new URL(c.imageUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') imageUrl = u.toString();
    } catch {
      imageUrl = null;
    }
  }

  return {
    id: sha(url),
    headline,
    source: source || domain,
    domain,
    category: c.category ? stripHtml(c.category).slice(0, 40) : '', // hint only; classifier decides
    publishedAt: published.toISOString(),
    snippet,
    imageUrl,
    url,
    provider: c.provider,
    sourceKey: c.sourceKey,
    queried: c.queried,
    resolved: !isGoogle,
  };
}

/** Never throws: one malformed item from a news source is skipped instead of stopping the whole run. */
export function toWorkArticle(c: Candidate, cfg: Config, now: Date): WorkArticle | null {
  try {
    return buildWorkArticle(c, cfg, now);
  } catch {
    return null;
  }
}