// robots.txt as a generated ENDPOINT rather than a static public/robots.txt file.
//
// Why: the site's real domain is already a two-place edit per the README
// (astro.config.mjs `site` + src/config.ts `siteUrl`) — a static robots.txt
// would make that a THIRD place to remember, and it's exactly the kind of
// file people forget to touch since it's easy to overlook in `public/`.
// Generating it from `Astro.site` means the `Sitemap:` line can never drift
// out of sync with the domain actually baked into every JSON-LD @id and the
// sitemap itself — one source of truth, same pattern as canonical URLs.
//
// Tier 2: /api/* routes (src/pages/api/*.ts) are now online — those are
// form-submission endpoints, not content, and have no reason to be crawled
// or indexed, hence the Disallow below.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error(
      'robots.txt.ts: Astro.site is unset — set `site` in astro.config.mjs to the real domain first.'
    );
  }
  const sitemapUrl = new URL('sitemap-index.xml', site).toString();
  const body = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${sitemapUrl}\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
