import { describe, it, expect } from 'vitest';
import { checkLinks, isDead } from '../worker/linkrot';
import { makeFetcher } from '../worker/lib/http';
import type { FetchFn } from '../worker/types';

const res = (status: number) => new Response(null, { status });

describe('link-rot', () => {
  it('only confirmed 404/410 and DNS failures are dead', async () => {
    const table: Record<string, number | Error> = {
      'https://ok.test/': 200, 'https://gone.test/': 404, 'https://gone410.test/': 410,
      'https://blocked.test/': 403, 'https://flaky.test/': 503,
      'https://nodns.test/': Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
      'https://timeout.test/': new Error('The operation was aborted'),
    };
    const f: FetchFn = async (u) => { const v = table[u]; if (v instanceof Error) throw v; return res(v ?? 200); };
    const arts = Object.keys(table).map((url) => ({ id: url, url }));
    const dead = await checkLinks(arts, f);
    expect([...dead].sort()).toEqual(['https://gone.test/', 'https://gone410.test/', 'https://nodns.test/']);
  });
  it('a HEAD 404 that GET disproves is alive', async () => {
    const f: FetchFn = async (_u, init) => res(init?.method === 'HEAD' ? 404 : 200);
    expect(await isDead('https://picky.test/', f)).toBe(false);
  });
  it('skips unresolved Google News links', async () => {
    const f: FetchFn = async () => res(404);
    const dead = await checkLinks([{ id: 'g', url: 'https://news.google.com/rss/articles/x' }], f);
    expect(dead.size).toBe(0);
  });
});

describe('http fetcher', () => {
  const opts = { timeoutMs: 1000, retries: 2, defaultDelayMs: 100 };
  it('retries 5xx and network errors with exponential backoff, then succeeds', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const base: FetchFn = async () => { n++; if (n === 1) throw new Error('boom'); return res(n === 2 ? 503 : 200); };
    const f = makeFetcher({ ...opts, base, sleep: async (ms) => { sleeps.push(ms); }, userAgent: 't' });
    expect((await f('https://a.test/')).status).toBe(200);
    expect(n).toBe(3);
    expect(sleeps).toContain(500);
    expect(sleeps).toContain(1000);
  });
  it('gives up after the retry budget and throws the last error', async () => {
    const base: FetchFn = async () => { throw new Error('down'); };
    const f = makeFetcher({ ...opts, base, sleep: async () => undefined, userAgent: 't' });
    let msg = '';
    try { await f('https://a.test/'); } catch (e) { msg = (e as Error).message; }
    expect(msg).toBe('down');
  });
  it('does not retry 404 and returns it to the caller', async () => {
    let n = 0;
    const base: FetchFn = async () => { n++; return res(404); };
    const f = makeFetcher({ ...opts, base, sleep: async () => undefined, userAgent: 't' });
    expect((await f('https://a.test/')).status).toBe(404);
    expect(n).toBe(1);
  });
  it('applies the per-host delay (and per-host overrides)', async () => {
    const sleeps: number[] = [];
    const base: FetchFn = async () => res(200);
    const f = makeFetcher({ ...opts, hostDelayMs: { 'slow.test': 5500 }, base, sleep: async (ms) => { sleeps.push(ms); }, userAgent: 't' });
    await f('https://a.test/x');
    await f('https://slow.test/x');
    expect(sleeps).toEqual([100, 5500]);
  });
});
