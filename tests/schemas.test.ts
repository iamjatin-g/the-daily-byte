import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { config } from '../config/site.config';
import { LatestFileSchema, IndexFileSchema, HealthFileSchema, BlocklistSchema } from '../src/lib/schemas';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

describe('config and seed data', () => {
  it('config parses', () => expect(config.site.name).toBeTruthy());
  it('has a fallback "general" category', () =>
    expect(config.categories.some((c) => c.id === 'general')).toBe(true));
  it('one cron per publish time', () =>
    expect(config.schedule.cronUTC.length).toBe(config.schedule.publishTimesIST.length));
  it('seed files match schemas', () => {
    LatestFileSchema.parse(json('data/latest.json'));
    IndexFileSchema.parse(json('data/index.json'));
    HealthFileSchema.parse(json('data/health.json'));
    BlocklistSchema.parse(json('config/blocklist.json'));
  });
});
