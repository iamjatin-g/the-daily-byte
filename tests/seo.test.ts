import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const base = read('src/layouts/Base.astro');

describe('SEO and site plumbing', () => {
  it('every page head has the required tags', () => {
    for (const needle of ['<title>', 'name="description"', 'rel="canonical"', 'property="og:title"', 'property="og:description"',
      'property="og:url"', 'property="og:site_name"', 'name="twitter:card"', 'name="viewport"', 'type="application/rss+xml"', 'rel="icon"', 'lang={config.site.language}']) {
      expect(base).toContain(needle);
    }
  });
  it('sitemap is enabled and a site URL is set', () => {
    const cfg = read('astro.config.mjs');
    expect(cfg).toContain('sitemap()');
    expect(cfg).toContain('site:');
    expect(cfg).toContain("output: 'static'");
  });
  it('robots.txt points at the sitemap; RSS and favicon endpoints exist', () => {
    expect(read('src/pages/robots.txt.ts')).toContain('sitemap-index.xml');
    const pages = readdirSync(new URL('../src/pages', import.meta.url));
    for (const f of ['rss.xml.ts', 'favicon.svg.ts', '404.astro']) expect(pages).toContain(f);
  });
  it('only the 404 page is noindex; inner pages set their own title', () => {
    const dir = new URL('../src/pages/', import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.astro'))) {
      const s = readFileSync(new URL(f, dir), 'utf8');
      expect(s.includes('noindex')).toBe(f === '404.astro');
      if (f !== 'index.astro') expect(s).toContain('title=');
    }
  });
  it('legal pages exist and the footer links to them', () => {
    const views = read('src/lib/views.ts');
    for (const p of ['about', 'contact', 'privacy', 'disclaimer', 'remove']) {
      expect(readdirSync(new URL('../src/pages', import.meta.url))).toContain(`${p}.astro`);
      expect(views).toContain(`'${p}:`);
    }
  });
});
