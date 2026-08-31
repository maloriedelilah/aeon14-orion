# Newsletter / CRM signup module

The home page's `SubscribeForm` → `/api/subscribe` → a pluggable lead-capture
adapter. This is the standalone reference for that whole path — what's live,
how the pieces fit together, and how to extend it. For the analogous contact
form, see the main [README's Contact form section](./README.md#contact-form).

## What's live

- **`src/components/SubscribeForm.astro`** — the form itself. Progressive
  enhancement: a plain `<form method="post" action="/api/subscribe">` works
  with zero JS; an inline `<script>` AJAX-submits instead and shows an inline
  status message when JS is available. Imported on the home page via
  `@theme/components/SubscribeForm.astro` (see [THEMING.md](./THEMING.md)) so
  it's shadow-overridable exactly like every other presentation component.
- **`src/pages/api/subscribe.ts`** — the on-demand endpoint
  (`export const prerender = false`; every other route on the site stays a
  zero-cost prerendered static file — see the README's
  [Deploying to Cloudflare](./README.md#deploying-to-cloudflare) deploy-model
  callout for why only `/api/*` routes need a real server).
- **`src/lib/leads/factory.ts`** — the seam: turns
  `siteConfig.leads.provider` (`src/config.ts`) + the matching Cloudflare
  Worker secret(s) into a ready-to-call `LeadAdapter`.
- **`src/lib/leads/{mailerlite,emailoctopus}.ts`** — the two shipped
  reference adapters, each re-checked against that provider's *current* API
  (not assumed from older docs/training data) as part of wiring this up.

## Request flow, fail-loud at every hop

1. **Honeypot** (`hp_check`, hidden field, excluded from autofill — see
   `SubscribeForm.astro`'s own comment for why the field name is deliberately
   non-semantic, mirroring the same fix on the contact form). Filled in ->
   the endpoint **logs** the drop (so a human can see honeypot hits happened
   via Cloudflare Workers Logs) and returns a *fake* success — no signal to
   the bot, no provider call made.
2. **Email format check** — a plain regex (same bar as `<input
   type="email">`), enforced server-side since this endpoint is reachable
   directly (curl/bots), not only through the browser form. Missing/invalid
   -> a real `400`.
3. **Provider call**, via `getLeadAdapter(env, { listId, groupId })`:
   - An unset/unknown `siteConfig.leads.provider`, or a provider missing its
     required secret(s), throws **synchronously** with a specific, actionable
     message. `subscribe.ts` catches it and returns a real `500`, logged.
   - A real provider API rejection (both shipped adapters throw on a
     non-`ok` response) returns a real `502`, logged.
   - Nothing on this path is ever swallowed into a fake `{ ok: true }` —
     that's reserved *only* for the honeypot case, where a fake success is
     the deliberate anti-spam behavior, not a bug.

## Configuration

| What | Where | Notes |
|---|---|---|
| Which provider is active | `src/config.ts` → `siteConfig.leads.provider` | `'mailerlite'` \| `'emailoctopus'` \| a custom name (see below). A **config** choice, not an env var — provider choice isn't secret, only the API key/list/group IDs are. |
| Single vs. double opt-in | `src/config.ts` → `siteConfig.leads.doubleOptIn` | EmailOctopus: `PENDING` vs `SUBSCRIBED` status. MailerLite: **no per-request equivalent** — it's a group-dashboard setting in MailerLite's own UI, this flag has no effect there. |
| Default groups/tags | `src/config.ts` → `siteConfig.leads.groups` | Used when a `SubscribeForm` instance doesn't pass its own `groupId`/`listId` prop. |
| `MAILERLITE_API_KEY` | Cloudflare Worker secret | Required when provider is `'mailerlite'`. |
| `EMAILOCTOPUS_API_KEY` | Cloudflare Worker secret | Required when provider is `'emailoctopus'`. |
| `EMAILOCTOPUS_LIST_ID` | Cloudflare Worker secret | Required when provider is `'emailoctopus'`, unless a per-form `listId` prop supplies it instead. |

Copy `.env.example` to `.env` for local dev/build — only fill in the block
matching your chosen provider.

**Per-form targeting:** `SubscribeForm` doesn't currently expose `listId`/
`groupId` as component props, but `subscribe.ts` and the factory already
accept them as form fields (`listId`, `groupId`) and resolve them via
`resolveGroups()` — so one form component *can* target different
lists/groups per instance (e.g. a book-specific ARC-readers list vs. the
site-wide newsletter) by rendering an extra hidden `<input>` in a page that
needs it, without any endpoint or adapter change.

## Adding a custom CRM/ESP provider

Referenced from both `src/config.ts` and `factory.ts`'s own header comments
— this is the doc they point to. A fork can add a third (fourth, ...)
provider with **zero edits to any upstream file**:

1. Create `src/overrides/providers/<name>.ts`, exporting a factory function
   named `<name>` (matching the file's own base name — the accepted
   convention, mirroring `emailoctopus.ts`/`mailerlite.ts`'s own
   `export const <name> = (...) => ...` shape; a `default` export also
   works):

   ```ts
   import type { LeadAdapter } from '../../lib/leads/types';
   import type { LeadProviderEnv, LeadTargetOverrides } from '../../lib/leads/factory';

   export function myCrm(
     env: LeadProviderEnv & Record<string, string | undefined>,
     overrides: LeadTargetOverrides,
   ): LeadAdapter {
     // Read your own secret name(s) off `env` (whatever your Worker secrets
     // are called — this repo has no way to know what a fork's CRM needs).
     return {
       name: 'myCrm',
       async subscribe(lead) {
         // call your provider's API; throw on a non-ok response so the
         // fail-loud contract above holds for custom providers too.
       },
     };
   }
   ```

2. Set `siteConfig.leads.provider = 'myCrm'` in `src/config.ts`.
3. Set whatever Worker secret(s) your adapter reads off `env`.

**Why this is a different mechanism from the `@theme/...` component-override
plugin** (`vite-plugins/theme-override.mjs`): that plugin resolves a *known*,
single import specifier (`@theme/components/Header.astro` always means "the
Header component") to one of two fixed paths via a `resolveId` hook backed by
`fs.existsSync`. Provider selection is different in kind — the specific
provider to load is a **runtime string**
(`siteConfig.leads.provider`), not a specifier baked into any import
statement, and there can be an open-ended number of override files, not a
fixed 1:1 shadow. Cloudflare Workers also have **no runtime filesystem**, so
`fs.existsSync` isn't even available once this code is actually running in
production. Instead, `factory.ts` uses Vite's `import.meta.glob` (eager, at
**build** time) to pull in every file under `src/overrides/providers/` up
front, then picks the one whose filename matches the configured provider
name at request time — all the file-discovery work happens during
`astro build`, leaving only an in-memory lookup once the Worker is live.

This survives `git pull upstream main` exactly like a shadowed component
under `src/overrides/components/` does: your file lives at
`src/overrides/providers/<name>.ts`; upstream's factory lives at
`src/lib/leads/factory.ts`. Two different paths, never the same file, so
upstream can keep editing `factory.ts` and your custom provider never
conflicts.

## Runtime env note

`Astro.locals.runtime.env` does **not** appear anywhere in this code — it was
removed in this adapter's current major (`@astrojs/cloudflare`). Runtime env
vars/secrets are read via `import { env } from 'cloudflare:workers'` instead
(see `src/env.d.ts` and `src/pages/api/subscribe.ts`) — the same pattern used
by `src/pages/api/contact.ts`. If you're extending this endpoint or adding a
new on-demand route, use that pattern, not the older one you may find in
older tutorials/AI training data.

## Restyling the form

`SubscribeForm.astro`'s markup/behavior (field order, honeypot approach,
adding a consent checkbox, etc.) is a **Tier 2 selective override** — copy it
to `src/overrides/components/SubscribeForm.astro` and edit that copy; see
[THEMING.md](./THEMING.md#tier-2--selective-override-srcoverrides). This is
independent of everything above: shadowing the component never touches the
endpoint/adapter wiring, and vice versa.
