import type { Config, SourceStatus } from '../src/lib/schemas';

export const sourceKey = (provider: string, name: string) => `${provider}:${name}`;

/** Disabled sources are skipped until the weekly re-test is due. */
export function shouldRun(prev: SourceStatus | undefined, cfg: Config, now: Date): boolean {
  if (!prev || prev.status !== 'disabled') return true;
  const at = prev.disabledAt ? Date.parse(prev.disabledAt) : 0;
  return now.getTime() - at >= cfg.sources.retestDisabledEveryDays * 86_400_000;
}

export interface JobOutcome {
  ok: boolean;
  count: number;
  error?: string | null;
  spammy?: boolean;
}

export function recordResult(
  prev: SourceStatus | undefined,
  job: { provider: string; name: string },
  r: JobOutcome,
  cfg: Config,
  now: Date,
): SourceStatus {
  const iso = now.toISOString();
  const base = { name: job.name, provider: job.provider, articlesFetched: r.count };
  if (r.ok && !r.spammy) {
    return {
      ...base, status: 'ok', consecutiveFailures: 0, lastError: null,
      lastSuccessAt: iso, disabledAt: null,
    };
  }
  const failures = (prev?.consecutiveFailures ?? 0) + 1;
  const disabled = failures >= cfg.sources.disableAfterFailures;
  return {
    ...base,
    status: disabled ? 'disabled' : 'failed',
    consecutiveFailures: failures,
    lastError: r.error ?? 'high spam rate',
    lastSuccessAt: prev?.lastSuccessAt ?? null,
    // a failed weekly re-test restarts the one-week wait
    disabledAt: disabled ? iso : null,
  };
}
