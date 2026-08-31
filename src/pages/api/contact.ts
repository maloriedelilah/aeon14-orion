// Tier 2: the actual contact-form submission endpoint. ContactForm.astro
// already POSTs here (both as a plain <form> for zero-JS visitors and via
// fetch() for the enhanced path) — this is the piece that was previously
// missing, per the README's "Contact form" section.
//
// Request shape: application/x-www-form-urlencoded or multipart/form-data
// (whatever the browser's native <form> submit sends) with fields:
//   name, email, message, hp_check (honeypot), cf-turnstile-response (widget).
//
// The honeypot field name deliberately does NOT match any real autofill
// category (originally named "company" with a "Company" label — Chrome's
// autofill heuristics match on field name/label text and will silently fill
// a field like that from a saved address/business profile even with
// autocomplete="off" set, which is a long-documented Chrome quirk. That's
// not a bot — that's a real visitor's browser defeating the honeypot on
// their own form submission, which looks identical to this endpoint: fake
// success returned, no Turnstile call, no Resend call, nothing in either
// dashboard. Keep this name arbitrary/non-semantic if it's ever renamed
// again.
//
// Anti-spam, in order (cheapest checks first so a bot pays as little of our
// runtime/Resend-quota as possible):
//   1. Honeypot ("hp_check") filled in -> fake success, no email sent, no
//      Turnstile call spent. Real users never see or fill this field.
//   2. Turnstile token missing/invalid -> real 400, no email sent.
//   3. Only THEN do we spend a Resend API call.
export const prerender = false;

import type { APIRoute } from 'astro';
// Runtime env vars/secrets on Cloudflare Workers — NOT `Astro.locals.runtime.env`,
// which was removed in this adapter's current major (see src/env.d.ts's comment
// and the adapter's own error message if you're tempted to bring that back).
import { env } from 'cloudflare:workers';
import { resend } from '../../lib/email/resend';
import { verifyTurnstile } from '../../lib/turnstile';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid form submission.' }, 400);
  }

  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const message = String(form.get('message') ?? '').trim();
  const honeypot = String(form.get('hp_check') ?? '').trim();
  const turnstileToken = form.get('cf-turnstile-response');

  // 1. Honeypot — real visitors never fill this (it's visually hidden and
  // has tabindex="-1"). Return a FAKE success so bots get no signal that
  // they were caught, but do nothing further.
  if (honeypot !== '') {
    return jsonResponse({ ok: true });
  }

  if (!name || !email || !message) {
    return jsonResponse({ ok: false, error: 'Name, email, and message are required.' }, 400);
  }

  // 2. Turnstile — verify BEFORE spending a Resend call.
  const remoteIp = request.headers.get('CF-Connecting-IP') ?? undefined;
  const turnstileResult = await verifyTurnstile(
    typeof turnstileToken === 'string' ? turnstileToken : null,
    env.TURNSTILE_SECRET_KEY,
    remoteIp
  );
  if (!turnstileResult.ok) {
    return jsonResponse(
      { ok: false, error: 'Spam check failed — please try again.' },
      400
    );
  }

  // 3. Send.
  const sender = resend(env.RESEND_API_KEY);
  try {
    await sender.send({
      to: env.CONTACT_TO_EMAIL,
      from: env.CONTACT_FROM_EMAIL,
      replyTo: email,
      subject: `Contact form: ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: 'Message could not be sent — please try again later.' },
      502
    );
  }

  return jsonResponse({ ok: true });
};
