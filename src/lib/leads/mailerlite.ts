// MailerLite adapter. API key comes from the Worker env via
// src/lib/leads/factory.ts (never client-side).
//
// API VERSION CHECK (done as part of wiring this adapter up for real):
// confirmed current against developers.mailerlite.com/api/subscribers --
// POST https://connect.mailerlite.com/api/subscribers with `email` +
// `fields` + `groups` (an array of existing group IDs), Bearer auth. This
// is the current API; the OLD "classic" MailerLite API
// (developers-classic.mailerlite.com, subscriber-by-id/email GETs, a
// different auth scheme) is a separate, older surface this adapter never
// used -- nothing to fix here, already correct.
//
// Double opt-in: MailerLite has no per-request opt-in flag on this endpoint
// -- whether a group requires confirmation is a setting on the group itself
// in the MailerLite dashboard, not something this API call can toggle. So
// siteConfig.leads.doubleOptIn (wired into emailoctopus.ts's `status` field)
// intentionally has no effect here; set double opt-in on the target group
// in MailerLite's own UI instead.
import type { LeadAdapter, Lead } from './types';
export const mailerlite = (apiKey: string): LeadAdapter => ({
  name: 'mailerlite',
  async subscribe(lead: Lead) {
    const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ email: lead.email, fields: { name: lead.name },
        groups: lead.groups }),
    });
    if (!res.ok) throw new Error(`MailerLite ${res.status}: ${await res.text()}`);
    return { ok: true };
  },
});
