import type { FetchFn } from '../types';

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

/** Parse robots.txt; uses the group for our bot token if present, else "*". */
export function parseRobots(txt: string, botToken = 'newsautopilotbot'): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = (m[1] ?? '').toLowerCase();
    const val = (m[2] ?? '').trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], allow: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' && val) cur.allow.push(val);
    if (key === 'disallow' && val) cur.disallow.push(val);
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && botToken.includes(a)));
  const star = groups.find((g) => g.agents.includes('*'));
  const g = mine ?? star;
  return { allow: g?.allow ?? [], disallow: g?.disallow ?? [] };
}

/** Longest matching rule wins; allow beats disallow on a tie. */
export function isAllowed(rules: RobotsRules, path: string): boolean {
  const best = (list: string[]) =>
    list.reduce((n, p) => (path.startsWith(p.replace(/\$$/, '')) ? Math.max(n, p.length) : n), -1);
  return best(rules.allow) >= best(rules.disallow);
}

export async function robotsAllows(
  fetchFn: FetchFn,
  url: string,
  cache: Map<string, RobotsRules>,
): Promise<boolean> {
  const u = new URL(url);
  let rules = cache.get(u.origin);
  if (!rules) {
    try {
      const res = await fetchFn(`${u.origin}/robots.txt`);
      if (res.status >= 500) return false; // be conservative if we cannot read the rules
      rules = res.ok ? parseRobots(await res.text()) : { allow: [], disallow: [] };
    } catch {
      return false;
    }
    cache.set(u.origin, rules);
  }
  return isAllowed(rules, u.pathname + u.search);
}
