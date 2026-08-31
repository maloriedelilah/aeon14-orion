import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import { themeOverridePlugin } from './vite-plugins/theme-override.mjs';
import { themeStylesOverridePlugin } from './vite-plugins/theme-styles-override.mjs';

// `site` MUST be a real absolute URL — jsonld.ts builds every absolute @id
// (author, book, series) off `import.meta.env.SITE`. An unset/placeholder
// site silently produces broken @ids that pass `astro build` but are wrong.
// It's ALSO what @astrojs/sitemap and src/pages/robots.txt.ts key off of
// (via Astro.site) — so fixing this one value up top is what keeps JSON-LD
// @ids, the sitemap, and robots.txt's Sitemap: line all in agreement.
//
// Tier 2 (contact form, now subscribe later): deliberately KEEPING
// `output: 'static'` rather than flipping to `output: 'server'` (contra an
// earlier plan noted here). Astro's own docs: 'static' mode "prerenders all
// pages by default... if none opt out." With the Cloudflare adapter
// installed, an individual route can still opt into on-demand rendering via
// `export const prerender = false` (see src/pages/api/contact.ts). That
// gives the form endpoints a real server to run in WITHOUT quietly turning
// every book/series/theme/hub page into a per-request Workers render —
// this repo's whole value proposition (a static site, zero origin-server
// cost for content pages) stays intact; only /api/* pays the SSR cost,
// because only /api/* actually needs it.
export default defineConfig({
  site: 'https://orion.aeon14.com',
  output: 'static',
  adapter: cloudflare({
    // This site never uses Astro's <Image>/astro:assets transforms (every
    // cover is a plain <img> at its already-final size) — 'passthrough'
    // stops the adapter auto-provisioning a Cloudflare Images "IMAGES"
    // binding for a feature nothing here actually calls.
    imageService: 'passthrough',
    // Default ('workerd') spins up a local workerd instance during `astro
    // build` to prerender static routes in an environment matching
    // production as closely as possible. None of this repo's prerendered
    // content uses any Cloudflare-specific runtime API (no bindings, no
    // `Astro.locals.runtime` on any prerendered page — only the two
    // on-demand /api/* routes touch that), so there's nothing workerd-
    // specific for prerendering to actually need here. 'node' prerenders
    // with plain Node instead, which sidesteps that local-workerd step
    // entirely — worth it since it also avoids the extra moving part
    // (a local server astro spins up and fetches from) some sandboxed/CI
    // environments' network restrictions can trip up.
    prerenderEnvironment: 'node',
  }),
  integrations: [sitemap()],
  // Backs the `@theme/...` import alias (layouts + components import
  // presentation this way instead of a relative path) -- resolves to an
  // implementer's src/overrides/<rel> shadow if one exists, else falls back
  // to the upstream src/<rel> base file. See vite-plugins/theme-override.mjs
  // and src/overrides/README.md for the full contract. Deliberately NOT a
  // plain `resolve.alias` entry -- a static alias can't express the
  // override-if-present-else-base fallback this needs.
  //
  // themeStylesOverridePlugin backs the separate `@theme-styles/site.css`
  // virtual specifier -- the free-form CSS override slot (Tier B, THEMING.md)
  // -- which resolves to src/overrides/styles/site.css if it exists, else an
  // empty virtual stylesheet, so Base.astro can import it unconditionally
  // with no build break when the override is absent. See
  // vite-plugins/theme-styles-override.mjs for the full reasoning.
  vite: {
    plugins: [themeOverridePlugin(), themeStylesOverridePlugin()],
  },
});
