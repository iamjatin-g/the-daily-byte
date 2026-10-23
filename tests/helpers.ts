import { readFileSync } from 'node:fs';
import { config } from '../config/site.config';
import type { Config, DayFile, HealthFile } from '../src/lib/schemas';
import type { Store } from '../worker/store';
import type { Candidate, Job, Provider, WorkArticle } from '../worker/types';
import { sha } from '../worker/lib/text';

export const NOW = new Date('2026-10-18T06:30:00.000Z'); // 12:00 IST on 2026-10-18

export function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}
export function fixtureText(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

export function testConfig(mutate?: (c: Config) => void): Config {
  const c = structuredClone(config) as Config;
  mutate?.(c);
  return c;
}

export function mkArticle(over: Partial<WorkArticle> = {}): WorkArticle {
  const url = over.url ?? `https://${over.domain ?? 'example.com'}/${Math.random().toString(36).slice(2)}`;
  return {
    id: sha(url), headline: 'Sample headline about AI research today', source: 'Example', domain: 'example.com',
    category: 'general', publishedAt: '2026-10-18T04:00:00.000Z', snippet: '', imageUrl: null, url,
    provider: 'test', sourceKey: 'test:q', queried: true, resolved: true, ...over,
  };
}

/** Build a legacy-style Google News link that embeds the publisher URL (like real older ids). */
export function fakeGoogleLink(url: string): string {
  const body = Buffer.concat([Buffer.from([0x08, 0x13, 0x22, url.length]), Buffer.from(url), Buffer.from([0xd2, 0x01, 0x00])]);
  return `https://news.google.com/rss/articles/${body.toString('base64url')}?oc=5`;
}

export function memoryStore(init: { health?: HealthFile; days?: DayFile[]; removals?: string[] } = {}) {
  const days = new Map<string, DayFile>((init.days ?? []).map((d) => [d.date, d]));
  const state = { health: init.health ?? null as HealthFile | null, editionWrites: 0, healthWrites: 0 };
  const store: Store = {
    readDay: async (d) => days.get(d) ?? null,
    readHealth: async () => state.health,
    readRemovals: async () => init.removals ?? [],
    writeEdition: async (day) => { days.set(day.date, day); state.editionWrites++; },
    writeHealth: async (h) => { state.health = h; state.healthWrites++; },
  };
  return { store, state, days };
}

/** A provider with named jobs. Each job either returns candidates or throws. */
export function fakeProvider(name: string, jobs: Record<string, Candidate[] | Error>, onRun?: (job: string) => void): Provider {
  return {
    name,
    jobs: () =>
      Object.entries(jobs).map(([jobName, result]): Job => ({
        provider: name, name: jobName,
        run: async () => { onRun?.(jobName); if (result instanceof Error) throw result; return result; },
      })),
  };
}
