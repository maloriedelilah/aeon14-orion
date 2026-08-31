# src/overrides/providers/ — custom newsletter/CRM adapters

This folder is where **you** (the implementer) drop a custom lead-capture
adapter if neither shipped provider (MailerLite, EmailOctopus) fits. It ships
empty on purpose — same extension-point pattern as `src/overrides/components/`
and `src/overrides/styles/`, just for a piece of LOGIC instead of presentation.

## Why this exists (and why it's separate from `@theme/...`)

`src/lib/leads/` ships two reference `LeadAdapter` implementations
(`emailoctopus.ts`, `mailerlite.ts`) plus `factory.ts`, which reads
`siteConfig.leads.provider` (`src/config.ts`) and builds the matching adapter
for `src/pages/api/subscribe.ts` to call. Those three files are upstream —
don't edit them to add a provider, for the same `git pull upstream main`
conflict-avoidance reason `src/overrides/` exists at all.

This is a **different** extension mechanism from the `@theme/...` component
alias (see `src/overrides/README.md`), because it's solving a different
shaped problem: `@theme/...` shadows ONE fixed file per import specifier.
A custom provider isn't shadowing anything that already exists — it's a
NEW option added to an open-ended set, selected by a runtime config STRING
(`siteConfig.leads.provider`), not a static import path. `factory.ts` handles
this with a build-time `import.meta.glob` over this folder (Cloudflare
Workers have no runtime filesystem, so an `fs.existsSync`-style check —
`@theme`'s mechanism — isn't available once this is actually deployed).

## How to add a provider

1. Implement the `LeadAdapter` interface (`src/lib/leads/types.ts`) — copy
   `src/lib/leads/emailoctopus.ts` or `mailerlite.ts` as your starting point,
   they're the worked examples.
2. Export a factory function from `src/overrides/providers/<name>.ts`, named
   either `<name>` (matching the file name, the documented convention) or as
   the file's `default` export:

   ```ts
   // src/overrides/providers/customcrm.ts
   import type { LeadAdapter } from '../../lib/leads/types';

   export const customcrm = (
     env: Record<string, string | undefined>,
     overrides: { listId?: string; groupId?: string },
   ): LeadAdapter => ({
     name: 'customcrm',
     async subscribe(lead) {
       const res = await fetch('https://api.example-crm.com/v1/contacts', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           Authorization: `Bearer ${env.CUSTOMCRM_API_KEY}`,
         },
         body: JSON.stringify({ email: lead.email, name: lead.name }),
       });
       // FAIL LOUD — never swallow a non-ok response into a fake success.
       if (!res.ok) throw new Error(`customcrm ${res.status}: ${await res.text()}`);
       return { ok: true };
     },
   });
   ```
3. Set `provider: 'customcrm'` in `siteConfig.leads` (`src/config.ts`).
4. Set whatever secret(s) your adapter reads (`CUSTOMCRM_API_KEY` above) as
   Cloudflare Worker environment variables/secrets — `factory.ts` hands your
   provider function the **entire** raw env object, since upstream has no way
   to know what secret names a custom CRM integration needs.

No file outside this folder + `siteConfig.leads.provider` needs to change.
`factory.ts` finds your file automatically (by matching its filename against
the configured provider name) and prefers it over the two built-in cases —
so this survives `git pull upstream main` indefinitely.

## What you get "for free"

`src/pages/api/subscribe.ts` already handles honeypot rejection, email
validation, and turning your adapter's thrown errors into a logged, real
non-2xx response — your adapter only needs to implement `subscribe()` and
throw on failure. It does not need to touch the request/response layer at all.
