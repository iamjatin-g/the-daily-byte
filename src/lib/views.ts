// All page markup lives here as plain functions that return HTML strings, so it can be unit-tested
// and rendered in a real browser without Astro. Every dynamic value goes through esc().
import type { Cluster, Config } from './schemas';
import {
  blurb, cardImage, categoryLabel, editionLabel, formatDateTime, formatDay, freshness, ledger,
  primaryArticle, publishersText, relativeTime, sourceOptions,
} from './format';

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface ViewCtx {
  now: Date;
  siteName: string;
  tagline: string;
  categories: Config['categories'];
  publishTimesIST: string[];
  contactEmail: string;
}

const NEW_TAB = 'target="_blank" rel="noopener noreferrer"';
const hidden = (t: string) => `<span class="visually-hidden">${t}</span>`;

function link(url: string, text: string, cls = ''): string {
  return `<a${cls ? ` class="${cls}"` : ''} href="${esc(url)}" ${NEW_TAB}>${esc(text)}${hidden(' (opens in a new tab)')}</a>`;
}

function timeEl(iso: string, v: ViewCtx): string {
  return `<time datetime="${esc(iso)}" data-rel>${esc(relativeTime(iso, v.now))}</time>`;
}

function freshFlag(iso: string, v: ViewCtx): string {
  return `<span class="fresh" data-published="${esc(iso)}"${freshness(iso, v.now) === 'new' ? '' : ' hidden'}>New</span>`;
}

function media(c: Cluster, kind: 'card' | 'lead', priority = false): string {
  const img = cardImage(c);
  const a = primaryArticle(c);
  const size = kind === 'lead' ? 'width="960" height="540"' : 'width="640" height="360"';
  const load = priority ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<div class="media media--${kind}${img ? '' : ' is-empty'}">` +
    (img ? `<img src="${esc(img)}" alt="" ${size} ${load} decoding="async" referrerpolicy="no-referrer">` : '') +
    `<span class="media-fallback" aria-hidden="true">${esc(a.source)}</span></div>`;
}

/** Every publisher is credited and linked: a list for several, a single credit for one. */
function sources(c: Cluster, v: ViewCtx): string {
  if (c.articles.length === 1) {
    const a = c.articles[0]!;
    return `<p class="byline">Source: ${link(a.url, a.source)}</p>`;
  }
  const rows = c.articles.map((a) => `<li>${link(a.url, a.source)} ${timeEl(a.publishedAt, v)}</li>`).join('');
  return `<details class="sources"><summary><span class="badge">${esc(publishersText(c.publisherCount))}</span></summary><ul>${rows}</ul></details>`;
}

function meta(c: Cluster, v: ViewCtx): string {
  return `<p class="meta"><span class="cat">${esc(categoryLabel(c.category, v.categories))}</span>` +
    `${timeEl(c.publishedAt, v)}${freshFlag(c.publishedAt, v)}</p>`;
}

const dataAttrs = (c: Cluster): string =>
  `data-category="${esc(c.category)}" data-sources="${esc([...new Set(c.articles.map((a) => a.domain))].join(' '))}"`;

export function cardHtml(c: Cluster, v: ViewCtx): string {
  const a = primaryArticle(c);
  const b = blurb(c);
  return `<article class="card" ${dataAttrs(c)}>${media(c, 'card')}<div class="card-body">${meta(c, v)}` +
    `<h3 class="card-title">${link(a.url, c.headline)}</h3>` +
    (b.text ? `<p class="card-text">${esc(b.text)}</p>` : '') +
    (b.why ? `<p class="why"><strong>Why it matters.</strong> ${esc(b.why)}</p>` : '') +
    `${sources(c, v)}</div></article>`;
}

export function leadHtml(c: Cluster, v: ViewCtx): string {
  const a = primaryArticle(c);
  const b = blurb(c);
  const rows = ledger(c);
  const track = rows.map((r) => `<span style="--pos:${r.pos}%"></span>`).join('');
  const list = rows.map((r) => `<li>${link(r.article.url, r.article.source)} ${timeEl(r.article.publishedAt, v)}</li>`).join('');
  return `<section class="lead" aria-labelledby="lead-title"><div class="lead-main">${meta(c, v)}` +
    `<h2 id="lead-title" class="lead-title">${link(a.url, c.headline)}</h2>` +
    (b.text ? `<p class="lead-text">${esc(b.text)}</p>` : '') +
    (b.why ? `<p class="why"><strong>Why it matters.</strong> ${esc(b.why)}</p>` : '') +
    (b.kind === 'briefing' ? '<p class="ai-note">Summary written by AI from the linked reports. Check the sources.</p>' : '') +
    `</div><div class="lead-side">${media(c, 'lead', true)}` +
    `<section class="ledger" aria-labelledby="ledger-title"><h3 id="ledger-title">${esc(publishersText(c.publisherCount))}</h3>` +
    `<div class="ledger-track" aria-hidden="true">${track}</div>` +
    `<ol>${list}</ol><p class="ledger-note">In the order each publisher reported it.</p></section></div></section>`;
}

function briefItem(c: Cluster, v: ViewCtx): string {
  const a = primaryArticle(c);
  return `<li class="brief" ${dataAttrs(c)}><h4 class="brief-title">${link(a.url, c.headline)}</h4>` +
    `<p class="meta">${esc(a.source)}${c.publisherCount > 1 ? `<span class="badge">${esc(publishersText(c.publisherCount))}</span>` : ''}` +
    `${timeEl(c.publishedAt, v)}${freshFlag(c.publishedAt, v)}</p></li>`;
}

export function sectionsHtml(groups: { id: string; label: string; clusters: Cluster[] }[], v: ViewCtx): string {
  if (!groups.length) return '';
  return `<section class="top" aria-labelledby="top-title"><h2 id="top-title" class="section-title">Top stories by topic</h2><div class="sections">` +
    groups.map((g) => `<div class="sec"><h3><a href="/category/${esc(g.id)}/">${esc(g.label)}</a></h3><ul>${g.clusters.map((c) => briefItem(c, v)).join('')}</ul></div>`).join('') +
    `</div></section>`;
}

export function filterBar(clusters: Cluster[]): string {
  const opts = sourceOptions(clusters);
  if (opts.length < 2) return '';
  return `<div class="filter" data-filter><label for="source-filter">Publisher</label>` +
    `<select id="source-filter"><option value="">All publishers</option>` +
    opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)} (${o.count})</option>`).join('') +
    `</select><p class="filter-status" role="status" aria-live="polite"></p></div>`;
}

export function gridHtml(clusters: Cluster[], v: ViewCtx, title: string, id: string): string {
  if (!clusters.length) return '';
  return `<section class="latest" aria-labelledby="${esc(id)}"><div class="latest-head"><h2 id="${esc(id)}" class="section-title">${esc(title)}</h2>${filterBar(clusters)}</div>` +
    `<div class="grid" data-filterable>${clusters.map((c) => cardHtml(c, v)).join('')}</div>` +
    `<p class="empty empty--filter" data-filter-empty hidden>No stories from this publisher in this list. Choose another publisher.</p></section>`;
}

export function emptyHtml(kind: 'no-data' | 'no-category' | 'error', v: ViewCtx, label = ''): string {
  const times = v.publishTimesIST.join(' and ');
  const msg =
    kind === 'no-data'
      ? { h: 'No stories yet', p: `The first update is scheduled for ${times} IST. Reload this page after it runs.` }
      : kind === 'no-category'
        ? { h: `No ${label} stories right now`, p: 'Stories appear here after the next update. Browse all topics from the menu above.' }
        : { h: 'Stories could not be loaded', p: 'The saved news data is unreadable. Updates continue on schedule, and the next successful update restores this page.' };
  return `<section class="empty" role="status"><h2>${esc(msg.h)}</h2><p>${esc(msg.p)}</p></section>`;
}

// ---------- Page bodies ----------

export function homeMain(
  data: { lead: Cluster | null; featured: Cluster[]; latest: Cluster[]; ok: boolean },
  v: ViewCtx,
): string {
  if (!data.ok) return emptyHtml('error', v);
  if (!data.lead && data.latest.length === 0) return emptyHtml('no-data', v);
  const shown = new Set<string>(data.lead ? [data.lead.id] : []);
  const groups = v.categories
    .map((cat) => ({
      id: cat.id, label: cat.label,
      clusters: data.featured.filter((c) => c.category === cat.id && c.id !== data.lead?.id),
    }))
    .filter((g) => g.clusters.length);
  groups.forEach((g) => g.clusters.forEach((c) => shown.add(c.id)));
  const rest = data.latest.filter((c) => !shown.has(c.id));
  return (data.lead ? leadHtml(data.lead, v) : '') + sectionsHtml(groups, v) + gridHtml(rest, v, 'Latest stories', 'latest-title');
}

export function categoryMain(id: string, data: { latest: Cluster[]; ok: boolean }, v: ViewCtx): string {
  const label = categoryLabel(id, v.categories);
  const list = data.latest.filter((c) => c.category === id).sort((a, b) => Number(b.featured) - Number(a.featured));
  const head = `<h1 class="page-title">${esc(label)}</h1>`;
  if (!data.ok) return head + emptyHtml('error', v);
  if (!list.length) return head + emptyHtml('no-category', v, label);
  return head + gridHtml(list, v, `Stories in ${label}`, 'cat-title');
}

export function dayMain(date: string, clusters: Cluster[], v: ViewCtx): string {
  const head = `<h1 class="page-title">${esc(formatDay(date))}</h1><p class="page-sub">${clusters.length} ${clusters.length === 1 ? 'story' : 'stories'} from this day. <a href="/archive/">All days</a></p>`;
  return head + (clusters.length ? gridHtml(clusters, v, 'Stories', 'day-title') : emptyHtml('no-data', v));
}

export function archiveMain(days: { date: string; count: number }[], v: ViewCtx): string {
  const head = `<h1 class="page-title">Archive</h1><p class="page-sub">The last ${days.length || 60} days of stories, newest first.</p>`;
  if (!days.length) return head + emptyHtml('no-data', v);
  return head + `<ul class="archive-list">${days.map((d) => `<li><a href="/archive/${esc(d.date)}/">${esc(formatDay(d.date))}</a><span class="count">${d.count} ${d.count === 1 ? 'story' : 'stories'}</span></li>`).join('')}</ul>`;
}

// ---------- Page shell (header, search, footer) ----------

export interface ShellOpts {
  v: ViewCtx;
  main: string;
  isHome: boolean;
  activeNav: string; // 'all' | category id | 'archive' | ''
  generatedAt: string | null;
}

export function shellHtml(o: ShellOpts): string {
  const { v } = o;
  const nav = [{ id: 'all', label: 'All', href: '/' }, ...v.categories.map((c) => ({ id: c.id, label: c.label, href: `/category/${c.id}/` })), { id: 'archive', label: 'Archive', href: '/archive/' }]
    .map((n) => `<li><a href="${esc(n.href)}"${o.activeNav === n.id ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`).join('');
  const name = o.isHome
    ? `<h1 class="mast-name">${esc(v.siteName)}</h1>`
    : `<p class="mast-name"><a href="/">${esc(v.siteName)}</a></p>`;
  const updated = o.generatedAt && Date.parse(o.generatedAt) > Date.parse('2000-01-01')
    ? `<p class="updated">Last updated <time datetime="${esc(o.generatedAt)}">${esc(formatDateTime(o.generatedAt))}</time> <span class="updated-rel" data-rel-of="${esc(o.generatedAt)}">(${esc(relativeTime(o.generatedAt, v.now))})</span></p>`
    : '<p class="updated">Waiting for the first update</p>';
  const edition = o.generatedAt && Date.parse(o.generatedAt) > Date.parse('2000-01-01') ? editionLabel(o.generatedAt) : 'Edition pending';
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(v.now);
  return `<a class="skip" href="#main">Skip to content</a>` +
    `<div class="stale" id="stale-banner" role="status" hidden data-updated="${esc(o.generatedAt ?? '')}">This page was last updated <span data-stale-rel></span>. A newer update may be on its way.</div>` +
    `<header class="site-header"><div class="wrap">` +
    `<div class="strip"><p>${esc(today)}</p><p>${esc(edition)}</p>` +
    `<button type="button" class="theme-toggle" id="theme-toggle" aria-pressed="false">Dark mode</button></div>` +
    `<div class="mast">${name}<p class="tagline">${esc(v.tagline)}</p>${updated}</div>` +
    `<nav class="nav" aria-label="Topics"><ul>${nav}</ul></nav>` +
    `<div class="search" data-search><form role="search" class="search-form"><label for="q" class="visually-hidden">Search stories</label>` +
    `<input id="q" type="search" name="q" placeholder="Search stories" autocomplete="off" enterkeyhint="search" spellcheck="false"></form>` +
    `<div class="search-results" id="search-results" hidden><p class="search-status" role="status" aria-live="polite"></p><ol class="results"></ol></div></div>` +
    `</div></header>` +
    `<main id="main" class="wrap main" tabindex="-1">${o.main}</main>` +
    `<footer class="site-footer"><div class="wrap"><ul class="footer-links">` +
    ['about:About', 'contact:Contact', 'privacy:Privacy policy', 'disclaimer:Disclaimer', 'remove:Publisher removal requests']
      .map((x) => { const [p, t] = x.split(':') as [string, string]; return `<li><a href="/${p}/">${esc(t)}</a></li>`; }).join('') +
    `</ul>` +
    `<p class="footer-note">${esc(v.siteName)} collects headlines and short excerpts from public sources. All rights belong to the original publishers. Summaries are written by AI and can contain mistakes.</p></div></footer>`;
}
