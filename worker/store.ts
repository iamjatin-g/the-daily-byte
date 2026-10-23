import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  DayFileSchema, HealthFileSchema, LatestFileSchema, IndexFileSchema, BlocklistSchema,
  type Config, type DayFile, type HealthFile,
} from '../src/lib/schemas';

/** Everything the pipeline reads/writes. Tests swap in an in-memory version. */
export interface Store {
  readDay(date: string): Promise<DayFile | null>;
  readHealth(): Promise<HealthFile | null>;
  readRemovals(): Promise<string[]>;
  writeEdition(day: DayFile, cfg: Config): Promise<void>;
  writeHealth(h: HealthFile): Promise<void>;
}

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** Write to a temp file then rename, so a crash never leaves half a JSON file. */
async function writeJson(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

export function fsStore(dataDir: string, configDir: string): Store {
  return {
    async readDay(date) {
      const raw = await readJson(path.join(dataDir, `${date}.json`));
      return raw ? DayFileSchema.parse(raw) : null;
    },
    async readHealth() {
      const raw = await readJson(path.join(dataDir, 'health.json'));
      const parsed = raw ? HealthFileSchema.safeParse(raw) : null;
      return parsed?.success ? parsed.data : null; // a corrupt health file must not stop a run
    },
    async readRemovals() {
      const raw = await readJson(path.join(configDir, 'blocklist.json'));
      return raw ? BlocklistSchema.parse(raw).domains.map((d) => d.domain) : [];
    },
    async writeHealth(h) {
      await writeJson(path.join(dataDir, 'health.json'), HealthFileSchema.parse(h));
    },
    async writeEdition(day, cfg) {
      const clean = DayFileSchema.parse(day); // strips internal-only fields
      await fs.mkdir(dataDir, { recursive: true });
      await writeJson(path.join(dataDir, `${clean.date}.json`), clean);

      // prune day files older than keepDays
      const cutoff = new Date(Date.parse(clean.date) - cfg.pipeline.keepDays * 86_400_000).toISOString().slice(0, 10);
      const dates = (await fs.readdir(dataDir))
        .map((f) => DAY_FILE.exec(f)?.[1])
        .filter((d): d is string => !!d)
        .sort()
        .reverse();
      const kept: string[] = [];
      for (const d of dates) {
        if (d < cutoff) await fs.unlink(path.join(dataDir, `${d}.json`));
        else kept.push(d);
      }

      // index.json and latest.json
      const days: { date: string; count: number }[] = [];
      const latest: DayFile['clusters'] = [];
      for (const d of kept) {
        const f = d === clean.date ? clean : await this.readDay(d);
        if (!f) continue;
        days.push({ date: d, count: f.clusters.length });
        if (latest.length < cfg.pipeline.latestCount) {
          latest.push(...[...f.clusters].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
        }
      }
      const generatedAt = clean.generatedAt;
      await writeJson(path.join(dataDir, 'index.json'), IndexFileSchema.parse({ generatedAt, days }));
      await writeJson(
        path.join(dataDir, 'latest.json'),
        LatestFileSchema.parse({
          generatedAt,
          lead: clean.clusters.find((c) => c.lead) ?? null,
          featured: clean.clusters.filter((c) => c.featured),
          latest: latest.slice(0, cfg.pipeline.latestCount),
        }),
      );
    },
  };
}
