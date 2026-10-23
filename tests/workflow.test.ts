import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { config } from '../config/site.config';

const yml = readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
const crons = [...yml.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]!);

describe('automation workflow', () => {
  it('cron lines match config/site.config.ts exactly', () => {
    expect(crons).toEqual(config.schedule.cronUTC);
  });
  it('cron times equal the IST publish times (UTC+5:30)', () => {
    const ist = crons.map((c) => {
      const [m, h] = c.split(' ').map(Number) as [number, number];
      const t = (h * 60 + m + 330) % 1440;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    });
    expect(ist.sort()).toEqual([...config.schedule.publishTimesIST].sort());
  });
  it('has a manual trigger, no-overlap concurrency and timeouts', () => {
    expect(yml).toContain('workflow_dispatch');
    expect(yml).toContain('group: news-update');
    expect(yml).toContain('cancel-in-progress: false');
    expect(yml).toContain('timeout-minutes: 30');
    expect(yml.match(/timeout-minutes:/g)!.length).toBeGreaterThanOrEqual(5);
  });
  it('builds and deploys only after a successful worker; pings watchdog only on success', () => {
    const block = (name: string) => yml.split(`- name: ${name}`)[1]!.split('- name:')[0]!;
    expect(block('Build site')).toContain("steps.worker.outcome == 'success'");
    expect(block('Deploy to Cloudflare Pages')).toContain("steps.worker.outcome == 'success'");
    expect(block('Ping watchdog')).toContain("steps.worker.outcome == 'success'");
    expect(block('Fail the run if the worker failed')).toContain("steps.worker.outcome == 'failure'");
  });
  it('keep-alive and failure alert exist; secrets are never echoed', () => {
    expect(yml).toContain('Keep-alive');
    expect(yml).toContain('/fail');
    expect(/echo[^\n]*secrets\./.test(yml)).toBe(false);
    expect(yml.includes('pull_request_target')).toBe(false);
  });
  it('API keys are only referenced as secrets', () => {
    for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'GNEWS_API_KEY', 'NEWSDATA_API_KEY']) {
      expect(yml).toContain(`${k}: \${{ secrets.${k} }}`);
    }
  });
});
