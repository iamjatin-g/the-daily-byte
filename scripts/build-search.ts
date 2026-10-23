// Builds the Pagefind search index AFTER `astro build`. Runs entirely at build time.
import * as pagefind from 'pagefind';
import { config } from '../config/site.config';
import { loadAllDays } from '../src/lib/data';
import { toSearchRecords } from '../src/lib/search-records';

async function main(): Promise<void> {
  const records = toSearchRecords(await loadAllDays(), config.site.language, config.categories);
  if (records.length === 0) {
    console.log('[search] no stories yet, skipping search index (search shows a friendly message)');
    return;
  }
  const { index, errors } = await pagefind.createIndex({ forceLanguage: config.site.language });
  if (!index) throw new Error(`Pagefind could not start: ${errors.join('; ')}`);
  for (const r of records) {
    const res = await index.addCustomRecord(r);
    if (res.errors.length) throw new Error(`Pagefind rejected a record: ${res.errors.join('; ')}`);
  }
  const out = await index.writeFiles({ outputPath: 'dist/pagefind' });
  if (out.errors.length) throw new Error(`Pagefind could not write files: ${out.errors.join('; ')}`);
  await pagefind.close();
  console.log(`[search] indexed ${records.length} stories`);
}

main().catch((e) => {
  console.error('[search] failed:', e);
  process.exit(1);
});
