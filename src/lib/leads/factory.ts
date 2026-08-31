// Lead-adapter FACTORY: the one seam that turns siteConfig.leads.provider +
// the matching Cloudflare Worker secret(s) into a real, ready-to-call
// LeadAdapter for src/pages/api/subscribe.ts. This is what actually wires
// the two previously-dead adapters (emailoctopus.ts / mailerlite.ts) up to
// anything -- before this file, nothing in the codebase ever imported them.
//
// PROVIDER SELECTION: `siteConfig.leads.provider` (src/config.ts), NOT an
// env var. This deliberately reuses an ALREADY-ESTABLISHED convention in
// this repo rather than inventing a new one: .env.example and README.md's
// "Lead-capture provider" section already document `siteConfig.leads.provider`
// as the selector, in the same "config.ts is the one file an author edits"
// spirit as `theme.mode`/`header.layout`/every other author-facing choice.
// Provider choice isn't a secret -- only the API key/list/group IDs are --
// so a build-time config value (not a Worker runtime env var) is the right
// shape for it, and it's already what every doc in this repo describes.
//
// DOWNSTREAM-EXTENSIBLE PROVIDERS (the contract): a fork can add a brand
// new CRM/ESP by dropping ONE file at `src/overrides/providers/<name>.ts`
// exporting a factory function named `<name>` (matching the file's base
// name) that returns a LeadAdapter, then setting
// `siteConfig.leads.provider = '<name>'` -- with ZERO edits to this file or
// any other upstream file, so it survives `git pull upstream main` exactly
// like a shadowed component under src/overrides/components/ does.
//
// WHY NOT THE SAME MECHANISM AS `@theme/...` (vite-plugins/theme-override.mjs):
// that plugin resolves a KNOWN, single import specifier per call site
// (`@theme/components/Header.astro` always means "the Header component") to
// one of two fixed file paths. Provider selection is different in kind: the
// specific provider to load is a RUNTIME STRING (`siteConfig.leads.provider`),
// not a specifier baked into any one import statement, and there can be an
// open-ended number of override files (not a fixed 1:1 shadow). A resolveId
// hook can't express "pick one of N files by a string I only know at
// runtime" -- so instead this uses Vite's `import.meta.glob` (eager, at BUILD
// time) to pull in every file under src/overrides/providers/ up front, then
// picks the one whose filename matches the configured provider name at
// request time. This has to happen at BUILD time either way: Cloudflare
// Workers have no runtime filesystem, so an `fs.existsSync` check (the
// mechanism theme-override.mjs uses) is simply not available once this code
// is actually running in production -- import.meta.glob sidesteps that by
// having Vite do all the file discovery during `astro build`, leaving only
// an in-memory lookup at request time.
import type { LeadAdapter } from './types';
import { emailoctopus } from './emailoctopus';
import { mailerlite } from './mailerlite';
import { siteConfig } from '../../config';

// Minimal shape of the Worker secrets this factory itself reads for the two
// upstream reference providers. A downstream override provider is handed the
// FULL env object (see below) and is free to read whatever secret names IT
// needs -- this interface only documents the two shipped adapters' needs.
export interface LeadProviderEnv {
  EMAILOCTOPUS_API_KEY?: string;
  EMAILOCTOPUS_LIST_ID?: string;
  MAILERLITE_API_KEY?: string;
}

// Per-request/per-form-instance overrides (decision #2: SubscribeForm's
// optional listId/groupId props travel here from src/pages/api/subscribe.ts
// so ONE form component can target different lists/groups without a second
// adapter or a config fork). Falls back to siteConfig.leads.groups when unset.
export interface LeadTargetOverrides {
  listId?: string;
  groupId?: string;
}

// A downstream override provider factory receives the raw Worker env (so it
// can read its own secret names -- this repo has no way to know what a
// fork's custom CRM needs) plus the same target overrides used by the
// shipped providers, and must return a LeadAdapter, exactly like
// emailoctopus()/mailerlite() do.
export type LeadProviderFactory = (
  env: LeadProviderEnv & Record<string, string | undefined>,
  overrides: LeadTargetOverrides,
) => LeadAdapter;

// Eager build-time glob of every file dropped under src/overrides/providers/.
// Empty on a fresh clone (the folder ships with only a .gitkeep + README) --
// that's fine, the loop below simply finds nothing and every provider name
// falls through to the two upstream cases.
const overrideModules = import.meta.glob('/src/overrides/providers/*.ts', {
  eager: true,
}) as Record<string, Record<string, unknown>>;

function findOverrideFactory(providerName: string): LeadProviderFactory | undefined {
  for (const [filePath, mod] of Object.entries(overrideModules)) {
    const baseName = filePath.split('/').pop()?.replace(/\.ts$/, '');
    if (baseName !== providerName) continue;
    // Accept either a named export matching the file name (the documented
    // convention, mirroring emailoctopus.ts/mailerlite.ts's own
    // `export const <name> = (...) => ...` shape) or a default export, so an
    // implementer copying the upstream adapters' style "just works".
    const candidate = mod[providerName] ?? mod.default;
    if (typeof candidate === 'function') return candidate as LeadProviderFactory;
  }
  return undefined;
}

/**
 * Build the configured LeadAdapter for this request. FAIL-LOUD by design:
 * an unset/unknown provider, or a provider missing its required secret(s),
 * throws synchronously with a specific, actionable message -- src/pages/api/
 * subscribe.ts is responsible for catching that and turning it into a
 * logged, non-2xx response, never a swallowed error or a fake success.
 */
export function getLeadAdapter(
  env: LeadProviderEnv & Record<string, string | undefined>,
  overrides: LeadTargetOverrides = {},
): LeadAdapter {
  // Widened at the call site on purpose -- see src/config.ts's LeadsProvider
  // type comment for why this isn't just 'mailerlite' | 'emailoctopus'.
  const providerName = siteConfig.leads.provider;

  const override = findOverrideFactory(providerName);
  if (override) return override(env, overrides);

  switch (providerName) {
    case 'emailoctopus': {
      const apiKey = env.EMAILOCTOPUS_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Newsletter misconfigured: siteConfig.leads.provider is "emailoctopus" but ' +
            'EMAILOCTOPUS_API_KEY is not set as a Cloudflare Worker secret.',
        );
      }
      const listId = overrides.listId ?? env.EMAILOCTOPUS_LIST_ID;
      if (!listId) {
        throw new Error(
          'Newsletter misconfigured: siteConfig.leads.provider is "emailoctopus" but no ' +
            'list ID is available -- set EMAILOCTOPUS_LIST_ID as a Worker secret, or pass ' +
            'a listId prop on this SubscribeForm instance.',
        );
      }
      return emailoctopus(apiKey, listId, { doubleOptIn: siteConfig.leads.doubleOptIn });
    }

    case 'mailerlite': {
      const apiKey = env.MAILERLITE_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Newsletter misconfigured: siteConfig.leads.provider is "mailerlite" but ' +
            'MAILERLITE_API_KEY is not set as a Cloudflare Worker secret.',
        );
      }
      return mailerlite(apiKey);
    }

    default:
      throw new Error(
        `Newsletter misconfigured: siteConfig.leads.provider is ${JSON.stringify(providerName)}, ` +
          'which matches neither a built-in provider ("mailerlite" | "emailoctopus") nor a file ' +
          `at src/overrides/providers/${String(providerName)}.ts. See README.md's ` +
          '"Adding a custom provider" section.',
      );
  }
}

// Resolve the groups/tags array a subscribe request should use: a per-form
// groupId override (single value) wins if given, else siteConfig.leads.groups
// (the site-wide default), else nothing. Shared here since both shipped
// adapters (and most custom ones) want this same precedence.
export function resolveGroups(overrides: LeadTargetOverrides): string[] {
  if (overrides.groupId) return [overrides.groupId];
  return siteConfig.leads.groups ?? [];
}
