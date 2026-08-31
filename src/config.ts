// The ONE file a cloning author edits for behavior (content lives in src/content).
//
// Site chrome (theme / nav / footer) lives HERE, not in src/content/, on purpose:
// it isn't a schema.org entity with its own JSON-LD identity (unlike author/books/
// series/hubs/events) — it's presentational config, same tier as `leads` below.
// An AI building a site for an author should ask them light/dark + tweak the
// accent, then edit this block. No code changes required.
export interface NavItem {
  label: string;
  href: string;
}

export const siteConfig = {
  siteUrl: 'https://orion.aeon14.com',

  // --- Slogan ----------------------------------------------------------
  // A short line describing the site, shown at the very top of the homepage
  // (above "Latest release") — e.g. "Hard science fiction for readers who
  // like their futures plausible." Plain display text, not a schema.org
  // entity, so it lives here rather than in src/content/. Optional — leave
  // undefined to skip it entirely.
  slogan: 'Space opera on a galactic scale — the Orion War era of the Aeon 14 universe.' as string | undefined,

  // --- Theme -----------------------------------------------------------
  // `mode` picks one of the two built-in palettes (see src/styles/theme.css).
  // `accent` is optional — override just the accent color without touching CSS.
  // This is an AUTHOR-TIME choice baked in at build (no visitor-facing toggle,
  // no JS/localStorage) — ask the author which they want, set it here.
  theme: {
    mode: 'dark' as 'dark' | 'light',
    accent: undefined as string | undefined, // e.g. '#ffb454' — omit to use the mode's default
  },

  // --- Header --------------------------------------------------------------
  // `logo.src` is a path under public/ (e.g. '/logo.svg') for authors who want
  // a wordmark image instead of plain text — omit it (leave undefined) to fall
  // back to the author's name as a text wordmark, which is the default and
  // needs no asset at all. `logo.alt` defaults to the author's name if unset.
  //
  // `layout` picks how the brand (logo/wordmark) and nav sit relative to each
  // other: 'left' is the classic header — brand on the left, nav on the right,
  // one row. 'centered' stacks them — brand centered on its own row, nav
  // centered underneath. Ask the author which they'd like, same as theme.mode.
  header: {
    logo: {
      src: undefined as string | undefined, // e.g. '/logo.svg'
      alt: undefined as string | undefined,
    },
    layout: 'left' as 'left' | 'centered',
  },

  // --- Homepage hero slideshow ---------------------------------------------
  // The homepage's top section (Latest release, then one slide per upcoming
  // preorder book, soonest first) auto-advances every `intervalSeconds`,
  // pauses while the mouse/keyboard focus is over it, and always has arrows.
  // Only relevant when there's more than one slide to rotate through.
  heroSlideshow: {
    intervalSeconds: 7,
  },

  // --- Header nav --------------------------------------------------------
  // Rendered in the header per `header.layout` above, after the brand
  // (logo/wordmark). /contact ships as a static form (Tier 1); it doesn't
  // actually deliver mail until the /api/contact endpoint is wired in Tier 2
  // — see README "Contact form". Remove this nav entry if you'd rather hide
  // the page until that's live.
  nav: [
    { label: 'Series', href: '/series' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ] as NavItem[],

  // --- Footer --------------------------------------------------------------
  footer: {
    tagline: undefined as string | undefined, // short line under the copyright, optional
    // Extra links alongside the auto-added Privacy Policy / Terms of Use.
    links: [] as NavItem[],
  },

  leads: {
    // 'mailerlite' | 'emailoctopus' ship as reference adapters (src/lib/leads/).
    // A fork can add a third (fourth, ...) provider by dropping ONE file at
    // src/overrides/providers/<name>.ts (see src/lib/leads/factory.ts's own
    // header comment + README's "Adding a custom provider" section) and
    // setting provider to that same <name> here -- no upstream file edited.
    // The `(string & {})` union member keeps 'mailerlite'/'emailoctopus'
    // autocompleting as before while still accepting any custom name.
    provider: 'mailerlite' as 'mailerlite' | 'emailoctopus' | (string & {}),
    doubleOptIn: true,        // config option — single vs double opt-in (EmailOctopus:
                               // PENDING vs SUBSCRIBED status; MailerLite has no per-call
                               // equivalent -- it's a group-level dashboard setting there)
    groups: [] as string[],   // provider list/group IDs (MailerLite group IDs directly;
                               // for EmailOctopus these become contact tags)
  },

  // --- Social sharing --------------------------------------------------
  // Purely cosmetic attribution for Twitter/X's `twitter:site` meta tag on
  // link-preview cards (see Base.astro's OG/Twitter Card block). Optional —
  // Open Graph and Twitter Card previews render correctly without it; this
  // just adds "via @handle" credit on X. Include or omit the leading '@',
  // either works.
  social: {
    twitterHandle: '@MDCooperAuthor' as string | undefined,
  },
};
