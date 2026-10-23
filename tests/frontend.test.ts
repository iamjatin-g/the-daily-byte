import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { testConfig, NOW, mkArticle } from './helpers';
import { relativeTime, freshness, blurb, ledger, sourceOptions, editionLabel, isStale, formatDay } from '../src/lib/format';
import { esc, cardHtml, leadHtml, homeMain, categoryMain, emptyHtml, shellHtml, gridHtml, type ViewCtx } from '../src/lib/views';
import { removeMain, aboutMain } from '../src/lib/pages';
import { buildRss, escapeXml } from '../src/lib/rss';
import { toSearchRecords } from '../src/lib/search-records';
import { loadLatest, loadRemovedDomains } from '../src/lib/data';
import type { Cluster } from '../src/lib/schemas';

const cfg = testConfig();
const v: ViewCtx = { now: NOW, siteName: cfg.site.name, tagline: cfg.site.tagline, categories: cfg.categories, publishTimesIST: cfg.schedule.publishTimesIST, contactEmail: cfg.site.contactEmail };
const art = (o: object) => { const a = mkArticle(o); const { sourceKey, queried, resolved, ...rest } = a; void sourceKey; void queried; void resolved; return rest; };
function cl(id: string, o: Partial<Cluster> = {}, arts: object[] = [{}]): Cluster {
  const articles = arts.map((x, i) => art({ domain: `p${i}-${id}.com`, source: `Pub ${i}`, url: `https://p${i}-${id}.com/a`, headline: `Headline ${id}`, ...x }));
  return { id, headline: `Headline ${id}`, category: 'models', publishedAt: '2026-10-18T05:00:00.000Z', score: 0.5, publisherCount: articles.length, featured: false, lead: false, articles, briefing: null, ...o };
}

describe('format helpers', () => {
  it('relative time and freshness', () => {
    expect(relativeTime('2026-10-18T06:29:40.000Z', NOW)).toBe('just now');
    expect(relativeTime('2026-10-18T03:30:00.000Z', NOW)).toBe('3 h ago');
    expect(freshness('2026-10-18T05:00:00.000Z', NOW)).toBe('new');
    expect(freshness('2026-10-18T01:00:00.000Z', NOW)).toBe('today');
    expect(freshness('2026-10-16T01:00:00.000Z', NOW)).toBe('earlier');
  });
  it('edition label, staleness, day format', () => {
    expect(editionLabel('2026-10-18T00:30:00.000Z')).toBe('Morning edition');
    expect(editionLabel('2026-10-18T12:30:00.000Z')).toBe('Evening edition');
    expect(isStale('2026-10-17T06:30:00.000Z', NOW)).toBe(true);
    expect(isStale('2026-10-18T01:00:00.000Z', NOW)).toBe(false);
    expect(formatDay('2026-10-18')).toContain('18 October 2026');
  });
  it('blurb prefers briefing, falls back to longest snippet, then none', () => {
    expect(blurb(cl('a', { briefing: { summary: 'S', whyItMatters: 'W', model: 'm' } })).kind).toBe('briefing');
    expect(blurb(cl('b', {}, [{ snippet: 'short' }, { snippet: 'a longer snippet' }])).text).toBe('a longer snippet');
    expect(blurb(cl('c')).kind).toBe('none');
  });
  it('ledger orders by report time; source options count stories', () => {
    const c = cl('d', {}, [{ publishedAt: '2026-10-18T05:00:00.000Z' }, { publishedAt: '2026-10-18T03:00:00.000Z' }]);
    expect(ledger(c).map((r) => r.pos)).toEqual([0, 100]);
    expect(sourceOptions([c, cl('e')]).length).toBe(3);
  });
});

describe('markup', () => {
  it('escapes dynamic text everywhere', () => {
    const evil = cl('x', { headline: '<img src=x onerror=alert(1)>' }, [{ headline: 'h', source: '"><script>alert(1)</script>', imageUrl: 'https://i.test/a.jpg" onerror="x' }]);
    const html = cardHtml(evil, v) + leadHtml(evil, v);
    expect(html.includes('<script>')).toBe(false);
    expect(html.includes('<img src=x')).toBe(false);
    expect(html.includes('onerror="x')).toBe(false);
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
  it('every external link opens a new tab safely and every publisher is linked', () => {
    const c = cl('m', {}, [{}, {}, {}]);
    const html = cardHtml(c, v) + leadHtml(c, v);
    const anchors = [...html.matchAll(/<a [^>]*href="https?:[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(anchors.length).toBeGreaterThan(5);
    expect(anchors.every((a) => a.includes('target="_blank"') && a.includes('rel="noopener noreferrer"'))).toBe(true);
    for (const a of c.articles) expect(html).toContain(`href="${a.url}"`);
    expect(html).toContain('Covered by 3 publishers');
  });
  it('images are lazy with fixed size, except the lead (priority); decorative alt', () => {
    const c = cl('i', {}, [{ imageUrl: 'https://i.test/a.jpg' }]);
    expect(cardHtml(c, v)).toContain('loading="lazy"');
    expect(cardHtml(c, v)).toContain('width="640" height="360"');
    expect(leadHtml(c, v)).toContain('fetchpriority="high"');
    expect(cardHtml(c, v)).toContain('alt=""');
  });
  it('empty and error states', () => {
    expect(homeMain({ lead: null, featured: [], latest: [], ok: true }, v)).toContain('No stories yet');
    expect(homeMain({ lead: null, featured: [], latest: [], ok: false }, v)).toContain('could not be loaded');
    expect(categoryMain('policy', { latest: [], ok: true }, v)).toContain('No Policy &amp; Safety stories');
    expect(emptyHtml('no-data', v)).toContain('06:00 and 18:00 IST');
  });
  it('home avoids showing the lead twice; briefing shows AI label', () => {
    const lead = cl('L', { lead: true, featured: true, briefing: { summary: 'Sum text', whyItMatters: 'Why text', model: 'm' } });
    const html = homeMain({ lead, featured: [lead, cl('F', { featured: true })], latest: [lead, cl('F', { featured: true }), cl('G')], ok: true }, v);
    expect(html.split('Headline L').length - 1).toBeGreaterThan(0);
    expect(html.match(/class="card"/g)?.length).toBe(1); // only G is left for the grid
    expect(html).toContain('Summary written by AI');
  });
  it('filter bar only appears with 2+ publishers; shell has skip link, landmarks, h1 on home only', () => {
    expect(gridHtml([cl('a')], v, 'T', 't')).not.toContain('data-filter ');
    expect(gridHtml([cl('a'), cl('b')], v, 'T', 't')).toContain('id="source-filter"');
    const home = shellHtml({ v, main: '', isHome: true, activeNav: 'all', generatedAt: '2026-10-18T05:00:00.000Z' });
    const other = shellHtml({ v, main: '', isHome: false, activeNav: '', generatedAt: null });
    expect(home).toContain('class="skip"');
    expect(home).toContain('<h1 class="mast-name">');
    expect(other.includes('<h1')).toBe(false);
    expect(home).toContain('aria-current="page"');
    expect(other).toContain('Waiting for the first update');
  });
  it('removal page lists removed domains and about page uses config text', () => {
    expect(removeMain(v, ['gone.com'])).toContain('gone.com');
    expect(removeMain(v, [])).toContain('No publisher has asked');
    expect(aboutMain(v, ['AI research'])).toContain('06:00 and 18:00 IST');
  });
});

describe('rss, search records, data loading', () => {
  it('RSS is well-formed and escapes content', () => {
    const c = cl('r', { headline: 'A & B <tag> "q"', briefing: { summary: 'S1. S2.', whyItMatters: 'W', model: 'm' } });
    const xml = buildRss({ siteName: 'N & Co', siteUrl: 'https://x.test/', description: 'd', language: 'en', clusters: [c], now: NOW });
    expect(xml).toContain('<title>A &amp; B &lt;tag&gt; &quot;q&quot;</title>');
    expect(xml).toContain('<atom:link href="https://x.test/rss.xml"');
    expect(xml.includes('<tag>')).toBe(false);
    expect(escapeXml('a\u0000b')).toBe('ab');
  });
  it('search records: one per story, direct publisher URL, filters', () => {
    const recs = toSearchRecords([{ date: '2026-10-18', generatedAt: NOW.toISOString(), clusters: [cl('s', {}, [{}, {}]), cl('s2')] }], 'en', cfg.categories);
    expect(recs.length).toBe(2);
    expect(recs[0]!.url.startsWith('https://p0-s.com')).toBe(true);
    expect(recs[0]!.filters.source.length).toBe(2);
    expect(recs[0]!.meta.category).toBe('Models & Products');
  });
  it('data loaders never throw: missing, corrupt and valid files', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'd-'));
    expect((await loadLatest(dir)).ok).toBe(false);
    writeFileSync(path.join(dir, 'latest.json'), '{bad');
    expect((await loadLatest(dir)).data.latest).toEqual([]);
    expect((await loadLatest('data')).ok).toBe(true);
    expect(await loadRemovedDomains('config')).toEqual([]);
  });
});

describe('colour contrast (WCAG AA)', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  const block = (re: RegExp) => Object.fromEntries([...(css.match(re)?.[1] ?? '').matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  const themes: Record<string, Record<string, string>> = {
    light: block(/:root \{([\s\S]*?)\}/), dark: block(/:root\[data-theme="dark"\] \{([\s\S]*?)\}/),
    'dark (system, no JS)': block(/:root:not\(\[data-theme\]\) \{([\s\S]*?)\}/),
  };
  for (const [name, t] of Object.entries(themes)) {
    it(`${name}: text pairs reach 4.5:1, borders of inputs 3:1`, () => {
      for (const fg of ['ink', 'ink-2', 'accent', 'flag']) {
        for (const bg of ['paper', 'wash']) expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThan(4.5);
      }
      expect(ratio(t['ink-2']!, t['paper']!)).toBeGreaterThan(3); // input borders use ink-2
      expect(ratio(t['paper']!, t['flag']!)).toBeGreaterThan(4.5); // stale banner text on flag
    });
  }
});
