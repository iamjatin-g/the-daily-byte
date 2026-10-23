import { z } from 'zod';

// ---------- Config ----------
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, 24h');
const cron = z.string().regex(/^\S+ \S+ \S+ \S+ \S+$/, 'Cron needs 5 fields');

export const ConfigSchema = z.object({
  site: z.object({
    name: z.string().min(1),
    tagline: z.string(),
    description: z.string(),
    language: z.string().min(2),
    region: z.string().min(2),
    contactEmail: z.string().email(),
    design: z.enum(['editorial', 'minimal', 'bold']),
  }),
  topics: z.object({
    keywords: z.array(z.string().min(1)).min(1),
    minRelevance: z.number().min(0).max(1),
  }),
  categories: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        label: z.string(),
        keywords: z.array(z.string()),
      }),
    )
    .min(1),
  schedule: z.object({
    publishTimesIST: z.array(hhmm).min(1),
    cronUTC: z.array(cron).min(1),
  }),
  sources: z.object({
    allowDomains: z.array(z.string()),
    blockDomains: z.array(z.string()),
    reliability: z.record(z.string(), z.number().min(0).max(1)),
    maxArticlesPerSource: z.number().int().positive(),
    disableAfterFailures: z.number().int().positive(),
    retestDisabledEveryDays: z.number().int().positive(),
    optionalNewsApi: z.enum(['none', 'gnews', 'newsdata']),
  }),
  spamBlocklist: z.array(z.string()),
  pipeline: z.object({
    snippetMaxChars: z.number().int().positive(),
    latestCount: z.number().int().positive(),
    featuredPerCategory: z.number().int().positive(),
    keepDays: z.number().int().positive(),
    fetchTimeoutMs: z.number().int().positive(),
    fetchRetries: z.number().int().min(0),
    perDomainDelayMs: z.number().int().min(0),
    similarityThreshold: z.number().min(0).max(1),
    maxAgeHours: z.number().int().positive(),
    feedDiscoveryLimit: z.number().int().min(0),
    maxResolvePerRun: z.number().int().min(0),
    linkCheckTopClusters: z.number().int().positive(),
  }),
  llm: z.object({
    provider: z.enum(['gemini', 'groq', 'none']),
    dailyCallCap: z.number().int().min(0),
    models: z.object({ gemini: z.string().min(1), groq: z.string().min(1) }),
    minIntervalMs: z.number().int().min(0),
    maxFailuresInRow: z.number().int().positive(),
  }),
});
export type Config = z.infer<typeof ConfigSchema>;

// ---------- Article: ONLY these fields are ever stored (no full text) ----------
export const ArticleSchema = z.object({
  id: z.string(), // hash of canonical URL
  headline: z.string().min(1).max(300),
  source: z.string().min(1), // publisher display name
  domain: z.string().min(1),
  category: z.string(),
  publishedAt: z.string().datetime(),
  snippet: z.string().max(260), // ~200 chars + ellipsis headroom
  imageUrl: z.string().url().nullable(),
  url: z.string().url(), // canonical publisher URL
  provider: z.string(), // which provider found it
});
export type Article = z.infer<typeof ArticleSchema>;

// ---------- Cluster: one story, possibly many publishers ----------
export const ClusterSchema = z.object({
  id: z.string(),
  headline: z.string(),
  category: z.string(),
  publishedAt: z.string().datetime(), // newest article in cluster
  score: z.number(),
  publisherCount: z.number().int().positive(),
  featured: z.boolean(),
  lead: z.boolean(),
  articles: z.array(ArticleSchema).min(1), // every source is credited + linked
  briefing: z
    .object({
      summary: z.string(), // 2-3 sentences, original wording
      whyItMatters: z.string(), // one line
      model: z.string(),
    })
    .nullable(), // null => UI falls back to plain snippet
});
export type Cluster = z.infer<typeof ClusterSchema>;

// ---------- Data files ----------
export const DayFileSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generatedAt: z.string().datetime(),
  clusters: z.array(ClusterSchema),
});
export type DayFile = z.infer<typeof DayFileSchema>;

export const LatestFileSchema = z.object({
  generatedAt: z.string().datetime(),
  lead: ClusterSchema.nullable(),
  featured: z.array(ClusterSchema),
  latest: z.array(ClusterSchema),
});
export type LatestFile = z.infer<typeof LatestFileSchema>;

export const IndexFileSchema = z.object({
  generatedAt: z.string().datetime(),
  days: z.array(z.object({ date: z.string(), count: z.number().int() })), // newest first
});
export type IndexFile = z.infer<typeof IndexFileSchema>;

// ---------- Health ----------
export const SourceStatusSchema = z.object({
  name: z.string(),
  provider: z.string(),
  status: z.enum(['ok', 'failed', 'disabled']),
  articlesFetched: z.number().int(),
  consecutiveFailures: z.number().int(),
  lastError: z.string().nullable(),
  lastSuccessAt: z.string().datetime().nullable(),
  disabledAt: z.string().datetime().nullable(),
});
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const HealthFileSchema = z.object({
  runAt: z.string().datetime(),
  outcome: z.enum(['success', 'partial', 'failed']),
  totals: z.object({
    fetched: z.number().int(),
    afterFilter: z.number().int(),
    clusters: z.number().int(),
    linkRotDropped: z.number().int(),
    llmCallsUsed: z.number().int(),
  }),
  llmCallsToday: z.object({ date: z.string(), count: z.number().int() }),
  sources: z.array(SourceStatusSchema),
  errors: z.array(z.string()),
});
export type HealthFile = z.infer<typeof HealthFileSchema>;

// ---------- Publisher removal blocklist (worker honors this) ----------
export const BlocklistSchema = z.object({
  domains: z.array(
    z.object({ domain: z.string(), addedAt: z.string(), reason: z.string().optional() }),
  ),
});
export type Blocklist = z.infer<typeof BlocklistSchema>;
