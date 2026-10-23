import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import {
  LatestFileSchema, IndexFileSchema, DayFileSchema, HealthFileSchema, BlocklistSchema,
  type LatestFile, type IndexFile, type DayFile, type HealthFile,
} from './schemas';

export interface Loaded<T> { data: T; ok: boolean; error?: string }

const EPOCH = '1970-01-01T00:00:00.000Z';
export const EMPTY_LATEST: LatestFile = { generatedAt: EPOCH, lead: null, featured: [], latest: [] };
export const EMPTY_INDEX: IndexFile = { generatedAt: EPOCH, days: [] };

/** Never throws: a missing or corrupt data file produces an empty state, not a failed build. */
async function load<T>(file: string, schema: z.ZodType<T>, fallback: T): Promise<Loaded<T>> {
  try {
    const parsed = schema.safeParse(JSON.parse(await fs.readFile(file, 'utf8')));
    return parsed.success ? { data: parsed.data, ok: true } : { data: fallback, ok: false, error: `${path.basename(file)} has an unexpected format` };
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === 'ENOENT';
    return { data: fallback, ok: false, error: missing ? `${path.basename(file)} not found` : `${path.basename(file)} is unreadable` };
  }
}

const dir = (d?: string) => d ?? path.join(process.cwd(), 'data');

export const loadLatest = (d?: string) => load(path.join(dir(d), 'latest.json'), LatestFileSchema, EMPTY_LATEST);
export const loadIndex = (d?: string) => load(path.join(dir(d), 'index.json'), IndexFileSchema, EMPTY_INDEX);
export const loadHealth = (d?: string) =>
  load<HealthFile | null>(path.join(dir(d), 'health.json'), HealthFileSchema.nullable(), null);

export async function loadDay(date: string, d?: string): Promise<Loaded<DayFile | null>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { data: null, ok: false, error: 'bad date' };
  return load<DayFile | null>(path.join(dir(d), `${date}.json`), DayFileSchema.nullable(), null);
}

export async function loadAllDays(d?: string): Promise<DayFile[]> {
  const idx = await loadIndex(d);
  const days = await Promise.all(idx.data.days.map((x) => loadDay(x.date, d)));
  return days.map((x) => x.data).filter((x): x is DayFile => x !== null);
}

export async function loadRemovedDomains(configDir?: string): Promise<string[]> {
  const file = path.join(configDir ?? path.join(process.cwd(), 'config'), 'blocklist.json');
  const r = await load(file, BlocklistSchema, { domains: [] });
  return r.data.domains.map((x) => x.domain).sort();
}
