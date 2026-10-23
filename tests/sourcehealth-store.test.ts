import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { recordResult, shouldRun } from '../worker/sourceHealth';
import { fsStore } from '../worker/store';
import { DayFileSchema, LatestFileSchema, IndexFileSchema } from '../src/lib/schemas';
import { testConfig, NOW } from './helpers';
import { buildClusters, rankClusters } from '../worker/rank';
import { mkArticle } from './helpers';
import type { Cluster } from '../src/lib/schemas';

const cfg = testConfig();
const job = { provider: 'feed', name: 'x.test' };

describe('self-healing source status', () => {
  it('disables after N consecutive failures and skips until the weekly re-test', () => {
    let s = recordResult(undefined, job, { ok: false, count: 0, error: 'boom' }, cfg, NOW);
    expect(s.status).toBe('failed');
    for (let i = 1; i < cfg.sources.disableAfterFailures; i++) s = recordResult(s, job, { ok: false, count: 0, error: 'boom' }, cfg, NOW);
    expect(s.status).toBe('disabled');
    expect(shouldRun(s, cfg, new Date(NOW.getTime() + 3 * 86_400_000))).toBe(false);
    expect(shouldRun(s, cfg, new Date(NOW.getTime() + 8 * 86_400_000))).toBe(true);
  });
  it('a success resets everything; a spammy success counts as a failure', () => {
    const failed = recordResult(undefined, job, { ok: false, count: 0, error: 'e' }, cfg, NOW);
    const ok = recordResult(failed, job, { ok: true, count: 5 }, cfg, NOW);
    expect(ok).toMatchObject({ status: 'ok', consecutiveFailures: 0, lastError: null });
    const spam = recordResult(ok, job, { ok: true, count: 5, spammy: true }, cfg, NOW);
    expect(spam.consecutiveFailures).toBe(1);
    expect(spam.lastError).toBe('high spam rate');
  });
  it('a failed re-test restarts the one-week wait', () => {
    const disabled = { ...recordResult(undefined, job, { ok: false, count: 0 }, cfg, NOW), consecutiveFailures: 3, status: 'disabled' as const };
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    const again = recordResult(disabled, job, { ok: false, count: 0, error: 'still down' }, cfg, later);
    expect(again.status).toBe('disabled');
    expect(again.disabledAt).toBe(later.toISOString());
  });
});

describe('file store', () => {
  const cl = (id: string, domain: string, cat: string, when: string): Cluster => {
    const a = mkArticle({ domain, category: cat, publishedAt: when });
    const [c] = rankClusters(buildClusters([{ id, articles: [a] }], cfg, NOW), cfg);
    return { id: c!.id, headline: c!.headline, category: c!.category, publishedAt: c!.publishedAt, score: c!.score, publisherCount: 1, featured: true, lead: false, articles: [a], briefing: null };
  };

  it('writes day/latest/index, strips internal fields, prunes old days', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'news-'));
    const data = path.join(root, 'data');
    mkdirSync(data);
    writeFileSync(path.join(data, '2020-01-01.json'), '{}'); // far older than keepDays
    writeFileSync(path.join(root, 'blocklist.json'), JSON.stringify({ domains: [{ domain: 'gone.com', addedAt: '2026-01-01' }] }));
    const store = fsStore(data, root);
    const day = { date: '2026-10-18', generatedAt: NOW.toISOString(), clusters: [cl('c1', 'a.com', 'models', '2026-10-18T03:00:00.000Z'), cl('c2', 'b.com', 'research', '2026-10-18T05:00:00.000Z')] };
    await store.writeEdition(day, cfg);

    expect(readdirSync(data).sort()).toEqual(['2026-10-18.json', 'index.json', 'latest.json']);
    const saved = JSON.parse(readFileSync(path.join(data, '2026-10-18.json'), 'utf8'));
    DayFileSchema.parse(saved);
    expect('sourceKey' in saved.clusters[0].articles[0]).toBe(false);
    const latest = LatestFileSchema.parse(JSON.parse(readFileSync(path.join(data, 'latest.json'), 'utf8')));
    expect(latest.latest.map((c) => c.id)).toEqual(['c2', 'c1']); // newest first
    expect(IndexFileSchema.parse(JSON.parse(readFileSync(path.join(data, 'index.json'), 'utf8'))).days).toEqual([{ date: '2026-10-18', count: 2 }]);
    expect(await store.readRemovals()).toEqual(['gone.com']);
    expect((await store.readDay('2026-10-18'))?.clusters).toHaveLength(2);
    expect(await store.readDay('2026-10-17')).toBeNull();
  });
  it('tolerates a corrupt health file', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'news-'));
    writeFileSync(path.join(root, 'health.json'), '{"nonsense":true}');
    expect(await fsStore(root, root).readHealth()).toBeNull();
  });
});
