// Text pages. All wording is generated from config, so a new niche needs no edits here.
import type { ViewCtx } from './views';
import { esc } from './views';

const mail = (v: ViewCtx, subject = '') => `mailto:${esc(v.contactEmail)}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
const times = (v: ViewCtx) => v.publishTimesIST.join(' and ');

export function aboutMain(v: ViewCtx, topics: string[]): string {
  return `<article class="prose"><h1 class="page-title">About ${esc(v.siteName)}</h1>
<p>${esc(v.siteName)} is an automated news briefing about ${esc(topics.join(', '))}. It updates itself twice a day, at ${esc(times(v))} IST, with no editor choosing stories by hand.</p>
<h2>How a story gets here</h2>
<p>Several times a day, software searches public news sources and feeds for the topics above. It removes duplicates, groups reports about the same event, and ranks each group by how many different publishers covered it, how recent it is, and how reliable the sources are. The strongest stories become the lead and the top stories for each topic.</p>
<h2>What we show</h2>
<p>For every story we keep only the headline, the publisher's name, the date, a short excerpt and a link. We never copy full articles. Every headline opens the original article on the publisher's own site, and every publisher that covered a story is credited and linked.</p>
<h2>AI-written summaries</h2>
<p>For top stories, an AI model writes a short summary and a line on why the story matters, using only the headlines and excerpts of the linked reports. AI can make mistakes. Read the original reports before relying on a summary. When no summary is available, we show the publisher's own excerpt instead.</p>
<h2>Publisher requests</h2>
<p>If you publish news and want your site removed, use the <a href="/remove/">removal request page</a>.</p>
<h2>Contact</h2>
<p>Questions or corrections: <a href="${mail(v)}">${esc(v.contactEmail)}</a>.</p></article>`;
}

export function privacyMain(v: ViewCtx): string {
  return `<article class="prose"><h1 class="page-title">Privacy policy</h1>
<p>This policy explains what happens to your information when you use ${esc(v.siteName)}. We have no accounts, no sign-up and no advertising.</p>
<h2>What we collect</h2>
<p>We do not run analytics, and we do not set cookies. Your theme choice (light or dark) is saved in your own browser's local storage so the site remembers it. It never leaves your device.</p>
<h2>Hosting</h2>
<p>This site is served by a hosting provider (Cloudflare Pages). Like any web host, it processes technical data such as your IP address and browser details to deliver pages and protect against abuse. We do not control that processing; see the provider's privacy policy.</p>
<h2>Search</h2>
<p>Search runs inside your browser using an index downloaded with the site. Your search terms are not sent to us.</p>
<h2>Images and links</h2>
<p>Story images load directly from the publishers' servers, so a publisher can see your IP address and browser details when an image loads. We ask your browser not to tell them which page you came from. Links open the publishers' own sites in a new tab, where their privacy policies apply.</p>
<h2>Email you send us</h2>
<p>If you email us, we use your message and address only to reply. We do not sell or share them.</p>
<h2>Changes</h2>
<p>If we change how the site works, we will update this page. Questions: <a href="${mail(v)}">${esc(v.contactEmail)}</a>.</p></article>`;
}

export function disclaimerMain(v: ViewCtx): string {
  return `<article class="prose"><h1 class="page-title">Disclaimer</h1>
<p>${esc(v.siteName)} is an aggregator. The headlines, excerpts and images shown here come from other publishers, and all rights in that material belong to the original publishers.</p>
<h2>Not our reporting</h2>
<p>We do not write, edit or verify the news we link to. A story appearing here is not an endorsement of the publisher or its claims.</p>
<h2>AI summaries</h2>
<p>Summaries and "why it matters" lines are produced automatically by an AI model from the linked headlines and excerpts. They may be incomplete or wrong. Always check the linked sources.</p>
<h2>Accuracy and availability</h2>
<p>Updates are automatic, so errors can appear and be corrected only at the next update. We make no promise that the site is complete, current or always available. Nothing here is professional, legal or financial advice.</p>
<h2>External links</h2>
<p>We are not responsible for the content or practices of other websites.</p>
<h2>Removal</h2>
<p>Publishers can ask to be removed on the <a href="/remove/">removal request page</a>.</p></article>`;
}

export function contactMain(v: ViewCtx): string {
  return `<article class="prose"><h1 class="page-title">Contact</h1>
<p>Email <a href="${mail(v)}">${esc(v.contactEmail)}</a> for corrections, questions or press enquiries.</p>
<p>Publishers who want to be removed should use the <a href="/remove/">removal request page</a> so we can handle the request quickly.</p></article>`;
}

export function removeMain(v: ViewCtx, removed: string[]): string {
  const list = removed.length
    ? `<h2>Publishers already removed</h2><ul class="plain">${removed.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`
    : '<h2>Publishers already removed</h2><p>No publisher has asked to be removed so far.</p>';
  return `<article class="prose"><h1 class="page-title">Publisher removal requests</h1>
<p>If you publish news and do not want ${esc(v.siteName)} to link to your site, tell us. Once your domain is added to our removal list, it is excluded from every later update and none of its stories appear again.</p>
<h2>How to ask</h2>
<p>Fill in the form. It opens an email to <a href="${mail(v, 'Publisher removal request')}">${esc(v.contactEmail)}</a> that you can review and send. You can also write to that address directly.</p>
<form class="form" id="removal-form" data-mailto="${esc(v.contactEmail)}">
<p><label for="rf-domain">Your website domain</label><input id="rf-domain" name="domain" type="text" inputmode="url" autocomplete="url" placeholder="example.com" required></p>
<p><label for="rf-name">Your name and role</label><input id="rf-name" name="name" type="text" autocomplete="name" required></p>
<p><label for="rf-note">Anything else we should know (optional)</label><textarea id="rf-note" name="note" rows="4"></textarea></p>
<p><button type="submit" class="button">Open email to send request</button></p>
<p class="form-note">Requests are handled by a person, so they are not instant. We will reply by email.</p>
</form>
${list}</article>`;
}

export function notFoundMain(): string {
  return `<section class="empty" role="status"><h1 class="page-title">Page not found</h1><p>This address does not exist. Go to the <a href="/">front page</a> or browse the <a href="/archive/">archive</a>.</p></section>`;
}
