import type { Config, Article } from '../src/lib/schemas';

/** Raw item from any provider, before sanitizing. */
export interface Candidate {
  headline: string;
  source: string;
  domain?: string | undefined;
  publishedAt?: string | Date | null | undefined;
  snippet?: string | undefined;
  imageUrl?: string | null | undefined;
  url: string;
  category?: string | null | undefined;
  provider: string;
  sourceKey: string; // "provider:name", the unit of health tracking
  queried: boolean; // true if a keyword search found it (so already topical)
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface Ctx {
  config: Config;
  fetch: FetchFn;
  now: Date;
  env: Record<string, string | undefined>;
}

/** One fetchable unit (a query or a feed). Health is tracked per job. */
export interface Job {
  provider: string;
  name: string;
  run: () => Promise<Candidate[]>;
}

export interface Provider {
  name: string;
  jobs(ctx: Ctx): Job[];
}

/** Article plus internal-only fields. Extra fields are stripped by Zod on write. */
export type WorkArticle = Article & { sourceKey: string; queried: boolean; resolved: boolean };
