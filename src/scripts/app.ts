// Small progressive-enhancement script. The site is fully readable without it.
import { freshness, isStale, relativeTime } from '../lib/format';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
const safeGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: fine */ } };

// ----- Theme toggle (the initial theme is applied by a tiny inline script in <head>, so there is no flash) -----
function initTheme(): void {
  const btn = $<HTMLButtonElement>('#theme-toggle');
  if (!btn) return;
  const root = document.documentElement;
  const render = () => {
    const dark = root.dataset.theme === 'dark';
    btn.textContent = dark ? 'Light mode' : 'Dark mode';
    btn.setAttribute('aria-pressed', String(dark));
  };
  btn.hidden = false;
  render();
  btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    safeSet('theme', next);
    render();
  });
}

// ----- Relative times, freshness flags and the "may be out of date" banner -----
function refreshTimes(): void {
  const now = new Date();
  $$<HTMLTimeElement>('time[data-rel]').forEach((el) => {
    const t = relativeTime(el.dateTime, now);
    if (t) el.textContent = t;
  });
  $$<HTMLElement>('.fresh[data-published]').forEach((el) => {
    el.hidden = freshness(el.dataset.published ?? '', now) !== 'new';
  });
  $$<HTMLElement>('[data-rel-of]').forEach((el) => {
    el.textContent = `(${relativeTime(el.dataset.relOf ?? '', now)})`;
  });
  const banner = $<HTMLElement>('#stale-banner');
  const updated = banner?.dataset.updated;
  if (banner && updated) {
    const stale = isStale(updated, now);
    banner.hidden = !stale;
    const rel = $('[data-stale-rel]', banner);
    if (stale && rel) rel.textContent = relativeTime(updated, now);
  }
}

// ----- Images: fade in when loaded, show a placeholder if they fail -----
function initImages(): void {
  const done = (img: HTMLImageElement, ok: boolean) => {
    const box = img.closest('.media');
    if (!box) return;
    box.classList.add(ok ? 'is-loaded' : 'is-empty');
  };
  $$<HTMLImageElement>('.media img').forEach((img) => {
    if (img.complete) done(img, img.naturalWidth > 0);
    else {
      img.addEventListener('load', () => done(img, true), { once: true });
      img.addEventListener('error', () => done(img, false), { once: true });
    }
  });
}

// ----- Publisher filter -----
function initFilter(): void {
  const bar = $<HTMLElement>('[data-filter]');
  const select = $<HTMLSelectElement>('#source-filter');
  const grid = $<HTMLElement>('[data-filterable]');
  if (!bar || !select || !grid) return;
  bar.hidden = false;
  const status = $('.filter-status', bar);
  const empty = $('[data-filter-empty]');
  select.addEventListener('change', () => {
    const want = select.value;
    let shown = 0;
    $$<HTMLElement>('.card', grid).forEach((card) => {
      const match = !want || (card.dataset.sources ?? '').split(' ').includes(want);
      card.hidden = !match;
      if (match) shown++;
    });
    if (empty) empty.hidden = shown > 0;
    if (status) status.textContent = want ? `Showing ${shown} ${shown === 1 ? 'story' : 'stories'}` : '';
  });
}

// ----- Search (Pagefind, loaded only when the visitor starts typing) -----
interface PfResult { data: () => Promise<{ url: string; excerpt: string; meta: Record<string, string> }> }
interface Pagefind { debouncedSearch: (q: string, o?: object, ms?: number) => Promise<{ results: PfResult[] } | null> }

let pagefind: Promise<Pagefind> | null = null;
function loadPagefind(): Promise<Pagefind> {
  if (!pagefind) {
    const url = '/pagefind/pagefind.js';
    pagefind = import(/* @vite-ignore */ url) as Promise<Pagefind>;
  }
  return pagefind;
}

// Pagefind excerpts may only contain <mark>. Everything else is removed before display.
const safeExcerpt = (html: string): string =>
  html.replace(/<(?!\/?mark>)[^>]*>/gi, '').replace(/<mark>/gi, '\u0001').replace(/<\/mark>/gi, '\u0002')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
const text = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function initSearch(): void {
  const box = $<HTMLElement>('[data-search]');
  const input = $<HTMLInputElement>('#q');
  const panel = $<HTMLElement>('#search-results');
  if (!box || !input || !panel) return;
  box.hidden = false;
  const status = $<HTMLElement>('.search-status', panel) as HTMLElement;
  const list = $<HTMLElement>('.results', panel) as HTMLElement;
  let seq = 0;

  const close = () => { panel.hidden = true; list.innerHTML = ''; status.textContent = ''; };
  const run = async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 2) return close();
    panel.hidden = false;
    status.textContent = 'Searching';
    list.innerHTML = '<li class="sk" aria-hidden="true"></li><li class="sk" aria-hidden="true"></li><li class="sk" aria-hidden="true"></li>';
    try {
      const pf = await loadPagefind();
      const res = await pf.debouncedSearch(q, {}, 200);
      if (res === null || mine !== seq) return; // a newer search replaced this one
      const items = await Promise.all(res.results.slice(0, 10).map((r) => r.data()));
      if (mine !== seq) return;
      status.textContent = items.length === 0 ? `No stories match "${q}". Try fewer or different words.` : `${items.length} ${items.length === 1 ? 'story' : 'stories'} found`;
      list.innerHTML = items.map((d) =>
        `<li><a href="${text(d.url)}" target="_blank" rel="noopener noreferrer">${text(d.meta.title ?? d.url)}<span class="visually-hidden"> (opens in a new tab)</span></a>` +
        `<p class="r-meta">${text(d.meta.source ?? '')} ${text(d.meta.date ?? '')}</p><p class="r-excerpt">${safeExcerpt(d.excerpt)}</p></li>`).join('');
    } catch {
      if (mine !== seq) return;
      list.innerHTML = '';
      status.textContent = 'Search is not available yet. It appears after the first full site build.';
    }
  };
  input.addEventListener('input', () => { void run(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; close(); } });
  box.addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); input.focus(); }
  });
}

// ----- Removal request form: builds an email for the visitor to review and send -----
function initRemovalForm(): void {
  const form = $<HTMLFormElement>('#removal-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const body = `Domain: ${f.get('domain') ?? ''}\nName and role: ${f.get('name') ?? ''}\n\n${f.get('note') ?? ''}\n\nPlease remove this publisher from your site.`;
    location.href = `mailto:${form.dataset.mailto ?? ''}?subject=${encodeURIComponent('Publisher removal request')}&body=${encodeURIComponent(body)}`;
  });
}

initTheme();
refreshTimes();
initImages();
initFilter();
initSearch();
initRemovalForm();
setInterval(refreshTimes, 60_000);
