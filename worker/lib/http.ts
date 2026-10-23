import type { FetchFn } from '../types';

export interface FetcherOptions {
  timeoutMs: number;
  retries: number;
  defaultDelayMs: number; // min gap between requests to the same host
  hostDelayMs?: Record<string, number>; // per-host override (e.g. GDELT asks for ~5s)
  userAgent: string;
  base?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * fetch with: per-host rate limit, timeout, retries with exponential backoff
 * (network errors, HTTP 429 and 5xx are retried; other statuses are returned as-is).
 */
export function makeFetcher(o: FetcherOptions): FetchFn {
  const base: FetchFn = o.base ?? ((u, i) => fetch(u, i));
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const chains = new Map<string, Promise<void>>();

  async function throttle(url: string): Promise<void> {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      /* invalid URL: fetch will throw below */
    }
    const delay = o.hostDelayMs?.[host] ?? o.defaultDelayMs;
    const prev = chains.get(host) ?? Promise.resolve();
    chains.set(host, prev.then(() => sleep(delay)));
    await prev;
  }

  return async (url, init = {}) => {
    let lastErr: unknown = new Error('request failed');
    for (let attempt = 0; attempt <= o.retries; attempt++) {
      await throttle(url);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), o.timeoutMs);
      try {
        const res = await base(url, {
          redirect: 'follow',
          ...init,
          headers: { 'user-agent': o.userAgent, accept: '*/*', ...(init.headers as Record<string, string> | undefined) },
          signal: ctl.signal,
        });
        clearTimeout(timer);
        if ((res.status === 429 || res.status >= 500) && attempt < o.retries) {
          lastErr = new Error(`HTTP ${res.status}`);
          await sleep(500 * 2 ** attempt);
          continue;
        }
        return res;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        if (attempt < o.retries) await sleep(500 * 2 ** attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  };
}

export async function fetchText(fetchFn: FetchFn, url: string): Promise<string> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.text()).slice(0, 5_000_000);
}
