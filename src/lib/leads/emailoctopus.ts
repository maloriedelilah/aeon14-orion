// EmailOctopus adapter. API key + list id come from the Worker env via
// src/lib/leads/factory.ts (never client-side).
//
// API VERSION CHECK (done as part of wiring this adapter up for real): this
// already targets EmailOctopus's CURRENT v2 API, not the legacy v1
// (`/api/1.6/...`, api_key-as-query-param) that EmailOctopus's own docs now
// label "legacy... no longer actively maintained". v2 confirmed via
// emailoctopus.com/api-documentation/v2: base URL `https://api.emailoctopus.com`,
// Bearer-token auth (not an api_key body/query param), POST
// `/lists/{list_id}/contacts` with `email_address` + `fields` + `tags` +
// `status`. This adapter already had the right base URL and Bearer auth
// (nothing to fix there) but was silently NEVER sending `tags` -- lead.groups
// had nowhere to go before this pass, even though the Lead type has always
// carried it and MailerLite's sibling adapter already used it. Fixed here.
import type { LeadAdapter, Lead } from './types';

export interface EmailOctopusOptions {
  // true (default): status 'PENDING' -- EmailOctopus sends its own
  // confirmation email before the contact counts as subscribed (double
  // opt-in). false: status 'SUBSCRIBED' -- added immediately, no
  // confirmation step (single opt-in). Wired from siteConfig.leads.doubleOptIn
  // via factory.ts -- this was a declared-but-previously-unused config field.
  doubleOptIn?: boolean;
}

export const emailoctopus = (
  apiKey: string,
  listId: string,
  options: EmailOctopusOptions = {},
): LeadAdapter => ({
  name: 'emailoctopus',
  async subscribe(lead: Lead) {
    const res = await fetch(`https://api.emailoctopus.com/lists/${listId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        email_address: lead.email,
        fields: lead.name ? { FirstName: lead.name } : undefined,
        // EmailOctopus has no separate "group" concept within a list -- tags
        // are its segmentation mechanism, so lead.groups maps to `tags` here
        // (see mailerlite.ts, where the same field maps to real group IDs).
        tags: lead.groups && lead.groups.length > 0 ? lead.groups : undefined,
        status: options.doubleOptIn === false ? 'SUBSCRIBED' : 'PENDING',
      }),
    });
    if (!res.ok) throw new Error(`EmailOctopus ${res.status}: ${await res.text()}`);
    return { ok: true };
  },
});
