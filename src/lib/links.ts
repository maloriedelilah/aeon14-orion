// Small shared helper: any link pointing off-site (retailer buy links, author
// social/sameAs URLs, event registration links, ...) should open in a new tab
// so a reader doesn't lose the site they were on, and should carry
// rel="noopener noreferrer" — the standard mitigation for the tabnabbing/
// window.opener issue that bare target="_blank" introduces.
//
// Heuristic: an absolute http(s) URL is treated as offsite; every internal
// route in this repo is a root-relative path (e.g. '/series', '/about') and
// never starts with a scheme, so this never misfires on internal nav/footer
// links even when they're spread through this same helper indiscriminately.
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

// Spread this directly onto an <a>: {...externalAttrs(url)}
// Returns {} for internal links, so it's safe to apply unconditionally.
export function externalAttrs(href: string): Record<string, string> {
  return isExternalHref(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}
