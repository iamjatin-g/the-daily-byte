import { describe, it, expect } from 'vitest';
import { stripHtml, truncate, canonicalUrl, normalizeTitle, tokens, hostMatches } from '../worker/lib/text';

describe('text helpers', () => {
  it('strips tags, scripts, styles and entities', () => {
    expect(stripHtml('<p>Hello <b>world</b> &amp; friends<script>alert(1)</script></p>')).toBe('Hello world & friends');
  });
  it('neutralizes double-encoded tags', () => {
    expect(stripHtml('&lt;img src=x onerror=alert(1)&gt;Safe')).toBe('Safe');
  });
  it('truncates on a word boundary with an ellipsis', () => {
    const out = truncate('alpha beta gamma delta epsilon zeta', 20);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(truncate('short', 20)).toBe('short');
  });
  it('canonicalizes URLs', () => {
    expect(canonicalUrl('http://www.Example.com/a/b/?utm_source=x&id=2#frag')).toBe('https://example.com/a/b?id=2');
    expect(canonicalUrl('https://example.com/a')).toBe(canonicalUrl('https://www.example.com/a/'));
  });
  it('rejects non-http URLs', () => {
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalUrl('not a url')).toBeNull();
  });
  it('normalizes titles and tokens', () => {
    expect(normalizeTitle("Don't PANIC: AI's rise!")).toBe('dont panic ais rise');
    expect(tokens('New LLMs launches')).toEqual(['llm', 'launch']);
  });
  it('matches domains and subdomains only', () => {
    expect(hostMatches('news.example.com', ['example.com'])).toBe(true);
    expect(hostMatches('notexample.com', ['example.com'])).toBe(false);
  });
});
