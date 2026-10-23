import { createHash } from 'node:crypto';

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&nbsp;': ' ', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”',
  '&ndash;': '–', '&mdash;': '—', '&hellip;': '…',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m) => {
    const known = ENTITIES[m.toLowerCase()];
    if (known) return known;
    let n = NaN;
    if (/^&#x/i.test(m)) n = parseInt(m.slice(3, -1), 16);
    else if (m.startsWith('&#')) n = parseInt(m.slice(2, -1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

/** Strip and sanitize HTML to plain text. Output never contains tags. */
export function stripHtml(input: unknown): string {
  let raw = '';
  if (typeof input === 'string') raw = input;
  else if (typeof input === 'number') raw = String(input);
  else if (input && typeof input === 'object' && typeof (input as { _?: unknown })._ === 'string') raw = (input as { _: string })._;
  if (!raw) return '';
  let s = raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s).replace(/<[^>]*>/g, ' '); // second pass handles double-encoded tags
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:.\-–—]+$/, '') + '…';
}

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(
  ('the a an and or but of to in on for with at by from as is are was were be been it its this that ' +
    'new says say said after over amid how why what who will can could may might has have had not no ' +
    'into than more most up out about their his her they you your we our us vs via report reports')
    .split(' '),
);

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ch|sh|x|ss|zz)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Normalized, stopword-free, lightly stemmed tokens. */
export function tokens(s: string): string[] {
  return normalizeTitle(s)
    .split(' ')
    .filter((w) => (w.length >= 2 || /^\d$/.test(w)) && !STOP.has(w))
    .map(stem);
}

export function sha(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function hostMatches(domain: string, list: string[]): boolean {
  return list.some((raw) => {
    const d = raw.toLowerCase().replace(/^www\./, '');
    return d !== '' && (domain === d || domain.endsWith('.' + d));
  });
}

/** Canonical form of a URL for dedupe: https, no www, no tracking params, no fragment. */
export function canonicalUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.protocol = 'https:';
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  const drop = [...u.searchParams.keys()].filter((k) =>
    /^(utm_|fbclid|gclid|mc_|ref$|ref_|cmp|ocid|igshid|spm|taid)/i.test(k),
  );
  drop.forEach((k) => u.searchParams.delete(k));
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}

export function slug(s: string): string {
  return normalizeTitle(s).replace(/\s+/g, '-').slice(0, 40) || 'unknown';
}
