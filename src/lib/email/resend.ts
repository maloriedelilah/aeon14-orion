// Resend adapter. API key comes from the Cloudflare Workers runtime env
// (context.locals.runtime.env), never client-side — same pattern as
// src/lib/leads/mailerlite.ts's `apiKey` param.
import type { EmailSender, EmailMessage } from './types';

export const resend = (apiKey: string): EmailSender => ({
  name: 'resend',
  async send(message: EmailMessage) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: [message.to],
        from: message.from,
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return { ok: true };
  },
});
