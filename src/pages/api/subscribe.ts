// Tier 2: the newsletter/CRM signup endpoint. SubscribeForm.astro already
// POSTs here (both as a plain <form> for zero-JS visitors and via fetch()
// for the enhanced path) — this is the piece that was previously missing;
// the form, the two lead adapters, and this route were three disconnected
// parts until this file wired them together via src/lib/leads/factory.ts.
//
// Request shape: application/x-www-form-urlencoded or multipart/form-data
// (whatever the browser's native <form> submit sends) with fields:
//   name (optional), email, hp_check (honeypot),
//   listId (optional, EmailOctopus-style per-form list override),
//   groupId (optional, MailerLite-style / generic per-form group override).
//
// FAIL-LOUD, every hop — this route exists specifically to close the exact
// silent-failure class this project has been burned by before (see
// contact.ts's own honeypot/Turnstile/Resend writeup): a bot gets a fake
// success (so it has no signal it was caught), but every OTHER failure —
// bad input, missing/misconfigured provider secrets, a real provider API
// error — is logged (so it's visible in Cloudflare Workers Logs, see
// wrangler.toml's [observability] block) and returns a real non-2xx status.
// Nothing here ever swallows an error into a fake `{ ok: true }`.
export const prerender = false;

import type { APIRoute } from 'astro';
// Runtime env vars/secrets on Cloudflare Workers — NOT `Astro.locals.runtime.env`,
// which was removed in this adapter's current major (see src/env.d.ts's comment
// and contact.ts's fuller writeup).
import { env } from 'cloudflare:workers';
import { getLeadAdapter, resolveGroups } from '../../lib/leads/factory';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Deliberately simple (not RFC 5322-complete) — same bar as a browser's own
// <input type="email">, just enforced again server-side since this endpoint
// is reachable directly (curl/bots), not only through the browser's form.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid form submission.' }, 400);
  }

  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const honeypot = String(form.get('hp_check') ?? '').trim();
  const listId = String(form.get('listId') ?? '').trim() || undefined;
  const groupId = String(form.get('groupId') ?? '').trim() || undefined;

  // 1. Honeypot — real visitors never fill this (visually hidden + tabindex
  // -1, excluded from autofill; see SubscribeForm.astro). Bots get a FAKE
  // success so they get no signal they were caught — but unlike leaving this
  // silent, we LOG the drop so a real human (via Workers Logs) can still see
  // honeypot hits happened, rather than this being invisible everywhere.
  if (honeypot !== '') {
    console.log('[subscribe] honeypot triggered — dropping silently, no provider call made');
    return jsonResponse({ ok: true });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return jsonResponse({ ok: false, error: 'A valid email address is required.' }, 400);
  }

  // 2. Resolve + call the configured provider (siteConfig.leads.provider).
  // getLeadAdapter throws LOUDLY and SPECIFICALLY (unset/unknown provider,
  // missing secret, missing list ID) rather than ever returning something
  // that looks like a working adapter when it isn't.
  let adapter;
  try {
    adapter = getLeadAdapter(env, { listId, groupId });
  } catch (err) {
    console.error('[subscribe] provider misconfigured:', err instanceof Error ? err.message : err);
    return jsonResponse(
      { ok: false, error: 'Newsletter signup is temporarily unavailable — please try again later.' },
      500,
    );
  }

  // 3. Send. Any adapter failure (both shipped adapters throw on a non-ok
  // provider response) is logged and surfaced as a real error to the
  // client — never swallowed into a fake success.
  try {
    await adapter.subscribe({
      email,
      name: name || undefined,
      groups: resolveGroups({ listId, groupId }),
    });
  } catch (err) {
    console.error(
      `[subscribe] ${adapter.name} rejected the subscribe request:`,
      err instanceof Error ? err.message : err,
    );
    return jsonResponse(
      { ok: false, error: 'Could not complete signup — please try again later.' },
      502,
    );
  }

  return jsonResponse({ ok: true });
};
