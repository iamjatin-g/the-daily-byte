import { config } from '../config/site.config';
import { makeFetcher } from './lib/http';
import { fsStore } from './store';
import { runPipeline } from './pipeline';
import { googleNews } from './providers/googleNews';
import { gdelt } from './providers/gdelt';
import { newsApi } from './providers/newsApi';
import { createLlmClient, makeEnricher } from './briefing';

async function main(): Promise<void> {
  if (config.site.contactEmail.endsWith('@example.com')) console.log('[worker] note: contactEmail in config/site.config.ts is still the placeholder');
  const botName = config.site.name.replace(/[^A-Za-z0-9]/g, '') + 'Bot';
  const fetchFn = makeFetcher({
    timeoutMs: config.pipeline.fetchTimeoutMs,
    retries: config.pipeline.fetchRetries,
    defaultDelayMs: config.pipeline.perDomainDelayMs,
    hostDelayMs: { 'api.gdeltproject.org': 5500 }, // GDELT asks for ~1 request per 5 seconds
    userAgent: `${botName}/1.0 (+mailto:${config.site.contactEmail})`,
  });
  const result = await runPipeline({
    config,
    store: fsStore('data', 'config'),
    fetch: fetchFn,
    providers: [googleNews, gdelt, newsApi],
    now: new Date(),
    env: process.env,
    enrich: makeEnricher({ config, client: createLlmClient(config, process.env) }),
  });
  const t = result.health.totals;
  console.log(`[worker] ${result.outcome}: fetched=${t.fetched} kept=${t.afterFilter} clusters=${t.clusters} deadLinks=${t.linkRotDropped}`);
  for (const e of result.health.errors) console.log(`[worker] note: ${e}`);
  process.exit(result.outcome === 'failed' ? 1 : 0); // non-zero exit makes the workflow fail loudly
}

main().catch((e) => {
  console.error('[worker] fatal:', e);
  process.exit(1);
});
