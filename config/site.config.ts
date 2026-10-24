import { ConfigSchema } from '../src/lib/schemas';

/**
 * THE ONE FILE TO EDIT to change topic, name, schedule or limits.
 * Validated by Zod at startup: a typo fails loudly instead of silently.
 */
export const config = ConfigSchema.parse({
  site: {
    name: 'The Daily Byte',
    tagline: 'AI news, briefed twice a day.',
    description: 'Automatically curated AI, LLM and machine learning headlines with short original briefings.',
    language: 'en',
    region: 'IN',
    contactEmail: 'jatinghind.04@gmail.com', // CHANGE ME
    design: 'editorial', // editorial | minimal | bold
  },

  topics: {
    // Search queries for Google News RSS / GDELT / news APIs.
    keywords: ['AI research', 'LLMs', 'machine learning'],
    // Articles must score at least this on keyword relevance (0-1).
    minRelevance: 0.25,
  },

  // Used by the keyword classifier when a feed gives no category.
  categories: [
    { id: 'research', label: 'Research', keywords: ['paper', 'study', 'benchmark', 'arxiv', 'researchers'] },
    { id: 'models', label: 'Models & Products', keywords: ['gpt', 'llm', 'gemini', 'claude', 'llama', 'launch', 'release'] },
    { id: 'industry', label: 'Industry', keywords: ['funding', 'acquires', 'startup', 'investment', 'revenue', 'partnership'] },
    { id: 'policy', label: 'Policy & Safety', keywords: ['regulation', 'law', 'safety', 'ban', 'government', 'ethics'] },
    { id: 'general', label: 'General', keywords: [] }, // fallback bucket
  ],

  // ----- SCHEDULE -----
  // Pune/IST is UTC+5:30 and has no daylight saving.
  // GitHub cron runs in UTC, so subtract 5h30m from each IST time:
  //   06:00 IST -> 00:30 UTC -> cron "30 0 * * *"
  //   18:00 IST -> 12:30 UTC -> cron "30 12 * * *"
  // Phase 3 puts these into the workflow file. Keep both in sync.
  schedule: {
    publishTimesIST: ['06:00', '18:00'],
    cronUTC: ['30 0 * * *', '30 12 * * *'],
  },

  sources: {
    // Domains always allowed / never used. Removal requests go in blocklist.
    allowDomains: [],
    blockDomains: [],
    // Reliability weight 0-1 per domain (default 0.5). Used in ranking.
    reliability: {},
    maxArticlesPerSource: 5,
    // Auto-disable a source after this many consecutive failures.
    disableAfterFailures: 3,
    // Re-test disabled sources every N days.
    retestDisabledEveryDays: 7,
    optionalNewsApi: 'none', // none | gnews | newsdata
  },

  spamBlocklist: ['you won\'t believe', 'shocking', 'this one trick', 'gone wrong', 'doctors hate'],

  pipeline: {
    snippetMaxChars: 200,
    latestCount: 100,
    featuredPerCategory: 3,
    keepDays: 2,
    fetchTimeoutMs: 10000,
    fetchRetries: 2,
    perDomainDelayMs: 1000,
    similarityThreshold: 0.6, // title similarity for clustering (0-1)
    maxAgeHours: 48, // ignore freshly fetched articles older than this
    feedDiscoveryLimit: 8, // publisher domains to probe for RSS per run
    maxResolvePerRun: 60, // max Google News redirect resolutions per run
    linkCheckTopClusters: 150, // link-rot check covers the top N clusters
  },

  llm: {
    provider: 'gemini', // gemini | groq | none
    dailyCallCap: 20, // max LLM calls per IST day (one call per featured story)
    // Model names change often (providers retire old ones). If briefings stop appearing,
    // check the failure note in data/health.json and update the name here.
    models: {
      gemini: 'gemini-flash-latest', // alias that follows Google's current Flash model
      groq: 'openai/gpt-oss-20b', // Groq's replacement for the retired llama-3.1-8b-instant
    },
    minIntervalMs: 4500, // spacing between calls, stays under free-tier requests/minute limits
    maxFailuresInRow: 3, // stop calling the API after this many failures in a row
  },
});

export type SiteConfig = typeof config;
