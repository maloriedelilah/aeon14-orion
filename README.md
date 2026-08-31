# author-geo

**An author website that machines can read.** A clone-and-edit starter for a
book-focused author site whose books, series, themes, and identity are emitted as
first-class, validated **JSON-LD / schema.org** structured data — so search engines
and LLMs can understand who you are and what you've written. ("GEO" =
Generative Engine Optimization.)

You bring the content (Markdown files describing your books and yourself); the
engine turns it into a fast static site with correct, cross-linked structured data
baked into every page.

- **Tier 1:** a static site (`output: 'static'`) — books, series, themes, events,
  about, legal — deployed to **Cloudflare Workers** (static assets).
- **Tier 2 (contact form + newsletter signup -- both live):** the contact
  form's `/api/contact` endpoint is real and wired to **Resend** + **Cloudflare
  Turnstile** (see [Contact form](#contact-form)); the newsletter form's
  `/api/subscribe` endpoint is real too, wired to a pluggable **MailerLite** /
  **EmailOctopus** adapter with a downstream-extensible custom-provider slot
  (see [Newsletter signup](#newsletter-signup)). Everything else on the site
  stays a plain prerendered static page at zero per-request cost -- only
  `/api/*` runs on demand.

> **Deploy target note (2026-07-24):** this repo now deploys via Cloudflare's
> newer **Workers static-assets** model, not the classic Pages
> `pages_build_output_dir` config used before Tier 2's forms landed. That's a
> forced move, not a preference -- see the callout in
> [Deploying to Cloudflare](#deploying-to-cloudflare) for why.

> **Editing this site with an AI agent?** Point it at **[`SKILL.md`](./SKILL.md)** —
> a self-contained authoring procedure (the content contract, the per-type recipes,
> and the validation gate to run before committing). This README is the *reference*;
> `SKILL.md` is the *loop*.

---

## Table of contents

- [Quickstart](#quickstart)
- [How it's organized](#how-its-organized-engine-vs-content)
- [Adding your content](#adding-your-content) — the frontmatter contract
- [Configuration](#configuration) — site URL, leads, theme/nav/footer
- [SEO basics: robots.txt, sitemap, 404](#seo-basics-robotstxt-sitemap-404)
- [Social sharing: Open Graph & Twitter Cards](#social-sharing-open-graph--twitter-cards)
- [Theming guide](#theming-guide) — every CSS variable, what it controls, how to do a full palette swap
  (see also [`THEMING.md`](./THEMING.md) for selective component/layout overrides beyond tokens)
- [Legal pages](#legal-pages-privacy--terms) — Privacy Policy & Terms of Use
- [Contact form](#contact-form) — live, sends email via Resend + Turnstile
- [Newsletter signup](#newsletter-signup) — live, pluggable MailerLite/EmailOctopus/custom CRM adapter
- [Validating your structured data](#validating-your-structured-data)
- [Deploying to Cloudflare](#deploying-to-cloudflare)
- [For developers / AI editors](#for-developers--ai-editors) — architecture & the contract
- [The design decisions (DDs)](#the-design-decisions-that-govern-this-repo)

---

## Quickstart

```sh
npm install
npm run dev      # local dev server at http://localhost:4321
npm run build    # production build -> dist/
npm run preview  # serve the built dist/ locally
```

Requires **Node >= 22.12**.

Out of the box the site builds with **example content** (a fictional author,
four sample books, one series, one theme). Everything under `src/content/` is
placeholder — delete it and drop in your own. See [Adding your content](#adding-your-content).
One of the four sample books, `the-ember-horizon`, is a deliberately maximal
example that exercises every book field (including a future `datePublished`,
which is all it takes to make a book a **preorder** — see [Preorders](#preorders)).

---

## How it's organized (engine vs. content)

The repo is split into two zones on purpose:

| Zone | Path | Who owns it |
|------|------|-------------|
| **Engine** | `src/` (layouts, components, `lib/`, page templates, schemas) | The template. Pull upstream to get fixes/features. |
| **Content** | `src/content/` + `src/config.ts` | **You.** Your books, series, and identity. Stays conflict-free on upstream pulls. |

The one rule: **edit your content and `src/config.ts`; leave the rest to the engine.**
If you find yourself changing engine code to make content work, that's usually a
sign a field belongs in the schema instead — see [For developers](#for-developers--ai-editors).

---

## Adding your content

All content lives in `src/content/`, one folder per collection. Each file is
Markdown with a YAML frontmatter block (the structured part) and optional body
text below. **The frontmatter is validated by a Zod schema** (`src/content.config.ts`)
— an invalid or missing field **fails the build with a clear error**, by design.
That schema is the single source of truth; the tables below mirror it, but if the
two ever disagree, **the schema wins**.

> **Note for AI editors:** do not guess field names. Read `src/content.config.ts`,
> match it exactly, and then run the [validation gate](#validating-your-structured-data).
> A build can pass while emitting subtly wrong structured data (e.g. a canonical
> URL on the wrong node) — the gate, not the build, is what proves correctness.

### Author — `src/content/author/<slug>.md`

Your identity. This is where the **canonical `Person` node** lives (at
`{siteUrl}/about#<slug>`); every book references it by `@id`, never re-defining it.
Co-authors each get their own file here.

| Field | Required | Notes |
|-------|----------|-------|
| `slug` | ✅ | Drives the canonical `@id` (`{siteUrl}/about#<slug>`). Stable — don't change it casually. |
| `name` | ✅ | Display / legal author name. |
| `alternateName` | | Array of pen names / initials, e.g. `["S. Voss"]`. |
| `bio` | ✅ | Prose bio; also feeds the About page and the (truncated) homepage blurb. |
| `photo` | | Path to an image, e.g. `./sera.jpg`. Optional. |
| `url` | ✅ | Kept for backward compatibility, but **not currently used anywhere in generated output** (fixed 2026-07-23 — see rule 12 in [For developers](#for-developers--ai-editors)): the schema.org `Person.url` is now always the author's own canonical `/about` page, derived by the engine, not read from this field. Nothing else on the site renders it either. Safe to leave as-is or ignore. |
| `sameAs` | | Array of URLs that disambiguate you: Wikipedia/Wikidata, Goodreads author page, socials. Strongly recommended for GEO. |
| `email` | | Optional contact email. |

### Book — `src/content/books/<slug>.md` (or `<slug>/index.md` with a local cover)

```yaml
---
title: "The Long Dark Between"
subtitle: "A Novel of the Drift"        # optional
slug: "the-long-dark-between"
description: "When the last generation ship loses its ansible link..."  # the blurb — required
cover: "./cover.png"                     # required — every book has a cover
authors:                                 # ARRAY, min 1 — co-author-safe (DD-001)
  - "malorie"                            #   each entry is an author SLUG (references src/content/author/)
series: "the-cinder-cycle"               # optional — a series slug
seriesPosition: 2                        # optional — order within the series
datePublished: "2024-03-05"
language: "en"                           # default: en
genres: ["science fiction", "hard sci-fi"]
editions:                                # ARRAY, min 1 — at least one buy link
  - format: "ebook"                      #   ebook | paperback | hardcover | audiobook
    retailer: "Amazon"
    url: "https://.../buy/ebook"         #   the BUY LINK lives on the edition (-> schema Offer.url), NOT on the book (DD-005)
    price: "4.99"                        #   REQUIRED — plain decimal string, no currency symbols/commas
    currency: "USD"                      #   default USD — must be a 3-letter ISO 4217 code
    isbn: "978..."                       #   optional* (see below)
    asin: "B0..."                        #   optional*
    sku: "..."                           #   optional* — *at least ONE of isbn/asin/sku is required
comps:                                   # optional — "comparable titles", rendered inline on the book page
  - name: "The Expanse"
    hook: "found-family crew under existential ship-systems pressure"  # REQUIRED, min 20 chars — never a bare name
    sameAs: ["https://en.wikipedia.org/wiki/The_Expanse_novel_series"] # optional — disambiguates the real work
---
Optional long-form body copy about the book goes here.
```

Two rules the schema enforces that matter for structured data:
- **`authors` is always an array** (min 1). A solo book is `["you"]`; a two-hander
  is `["you", "coauthor"]`. This is DD-001 — the model is co-author-safe everywhere.
- **`editions` is always an array** (min 1), and each edition's `url` is its
  **buy link**. This becomes a schema.org `Offer.url`, *not* the Book's `url`.
  The Book's own canonical `url` is its page on your site (the engine sets it). This
  is DD-005 — a retailer link in `Book.url` would falsely claim the retailer as the
  canonical home of the work.
- **Every edition requires `price`** (plain decimal string like `"17.99"` — no
  `$`, no commas, no trailing text) **and `currency`** (3-letter ISO 4217 code,
  defaults to `USD`). This isn't cosmetic: a `schema.org` `Offer` with a link but
  no `price`/`priceCurrency` still builds and validates fine structurally, but is
  **ineligible for Google Merchant/Shopping rich results** — so a missing price
  would silently cost you real search-shopping visibility with no build-time
  warning, unless the schema itself refuses to build. It does: a malformed or
  missing price fails `npm run build` immediately with a message naming the
  exact book/edition/field, rather than shipping a book that can never surface
  in Shopping results.
- **Every edition also requires at least one of `isbn`, `asin`, or `sku`**
  (reviewer finding 2026-07-23) — without a canonical identifier, that
  edition's `Offer` can't be matched to "this exact product" by a shopping or
  answer-engine consumer, the same silent-hole shape as the missing-price
  bug. You don't need all three, and you don't need `isbn` specifically —
  plenty of indie ebook-only editions never get an ISBN assigned at all.
  Use whichever your retailer actually gives you: `isbn` for print/most
  ebook retailers, `asin` for Amazon/KDP, `sku` for anything else (Kobo,
  Apple Books, direct-sale storefronts) with its own product id. A missing
  edition-level identifier fails `npm run build` immediately, same as a
  missing price.

> **Want to see every field in one place?** `src/content/books/the-ember-horizon/`
> is a deliberately maximal example: all four edition formats, both `isbn` and
> `asin`, two comps, a subtitle, a series position, and a heavily commented
> frontmatter block explaining each field inline. It's also the site's example
> **preorder** — see the next section.

#### Preorders

There's no `isPreorder` flag. A book is a preorder purely because its
**`datePublished` is in the future** — that one fact, checked by
`isFutureRelease()` in `src/lib/date.ts`, is the single source of truth that
drives everything below. Set the date in the past (or just let time pass) and
a book quietly becomes "released" like any other, with no other edits needed.

What changes automatically while `datePublished` is still in the future:
- **JSON-LD**: every edition's `Offer.availability` emits
  `https://schema.org/PreOrder` instead of `https://schema.org/InStock`, and
  each `Offer` also gets `availabilityStarts` set to that same
  `datePublished` date (added 2026-07-23, reviewer finding). It looks
  redundant next to the Book's own `datePublished` -- same date, different
  node -- but it isn't: `availabilityStarts` describes *the Offer's own*
  availability window (when this particular purchase channel starts being
  deliverable), which is exactly what Google Merchant Center's required
  `availability_date` attribute for preorder/backorder listings maps onto.
  A shopping consumer checks the Offer for this, not the Book. Only emitted
  while the offer is actually a preorder -- it disappears automatically the
  moment `isFutureRelease` flips false, since an already-available Offer has
  no future "start" left to declare.
- **"Latest release"** on the homepage skips it — a preorder can never
  accidentally claim that slot ahead of an already-released book.
- **Hero slideshow** on the homepage gets a slide for it (soonest release
  first), rotating after the "Latest release" slide.
- **"Coming soon" row** on the homepage — a horizontal scroll strip of
  upcoming covers, title, series/book number, and release date.
- **A `Pre-order` badge** appears next to the title on series listing pages
  and on the book's own detail page.

`src/content/books/the-ember-horizon/index.md` is the worked example — its
`datePublished` is set well into the future so it exercises all of the above.
It will eventually pass and the book will just become normal-released content;
bump the date forward again if you want a live preorder example on hand.

### Series — `src/content/series/<slug>.md`

A named sequence of books. Membership is **derived from the books** (any book with
`series: "<this-slug>"`), so you don't list books here — you tag them on the book.

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ | Display name, e.g. "The Cinder Cycle". |
| `slug` | ✅ | Used in the URL (`/series/<slug>`) and referenced by books. |
| `description` | ✅ | |
| `authors` | ✅ | Array of author slugs (min 1). |
| `cover` | | Optional image. |
| `comps` | | Same shape as book comps. |

A series' own page also emits an `ItemList`/`ListItem` **reading order** in
JSON-LD (`seriesReadingOrder()`), built from each member book's `seriesPosition`
— the schema.org-valid way to express "book N in this series" (see rule 9 in
[For developers](#for-developers--ai-editors)).

### Theme (hub) — `src/content/hubs/<slug>.md`

A curated collection of books "about" a topic (a `CollectionPage` in schema.org).
Route is `/themes/<slug>` (the collection folder is named `hubs`; the URL says
`themes`).

```yaml
---
name: "Human-AI Partnership"
slug: "human-ai-partnership"
description: "Books exploring what it means when minds depend on each other..."
about:                                   # ARRAY, min 1 — the DefinedTerm(s) this hub is about
  - term: "Artificial intelligence in fiction"
    sameAs: "https://en.wikipedia.org/wiki/Artificial_intelligence_in_fiction"  # optional but recommended
  - term: "Human–AI collaboration"
books:                                   # ARRAY, min 1 — ORDERED list of book slugs (becomes an ItemList)
  - "the-cinder-reach"
  - "the-long-dark-between"
---
```

Unlike a series (membership derived from books), a hub's `books` list is **explicit
and ordered** — you're hand-curating a themed reading list.

Membership shows up on **both sides** automatically, with nothing extra to author:
- The hub's own page lists its member books (as it always has).
- Every member book's own page gets a **"Featured in"** section under "If you
  like...", linking back to each hub it belongs to (a book can be in more than
  one). In JSON-LD, this is the book's `isPartOf` array — the same property
  used for its series, just with a second (or third...) entry per hub it's a
  member of, each a `CollectionPage` named stub pointing at that hub's `@id`.
  There's no reverse field to fill in on the book itself; membership is looked
  up from the hub's `books` list at build time.

### Event — `src/content/events/<slug>.md`

Appearances, launches, signings. All events render on `/events`.

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ | |
| `slug` | ✅ | |
| `description` | ✅ | |
| `startDate` | ✅ | ISO date/datetime. |
| `endDate` | | Optional. |
| `location` | | Free text (venue / city). |
| `url` | | Event page / ticket link. |
| `eventAttendanceMode` | | `online` \| `offline` \| `mixed` (default `offline`). |

> The `events/` folder ships empty (just a `.gitkeep`). Add a file to populate `/events`.

---

## Configuration

A few things worth setting before deploying. The first is the classic
silent-failure trap — the build passes with placeholders, but your structured data
is wrong.

### 1. Your site URL (set it in TWO places)

Every canonical `@id` in the JSON-LD is built from your site URL. Left as
`https://example.com`, the build **succeeds** but emits `@id`s on the placeholder
domain — valid-looking, silently wrong. Set your real production URL in **both**:

- **`astro.config.mjs`** → `site: 'https://yourdomain.com'`
- **`src/config.ts`** → `siteConfig.siteUrl: 'https://yourdomain.com'`

Keep them identical.

### 2. Site slogan — `src/config.ts`

```ts
slogan: undefined,   // e.g. 'Hard science fiction for readers who like their futures plausible.'
```

A short line shown at the very top of the homepage, above "Latest release" —
plain display text, not a schema.org entity, so it lives in config rather than
`src/content/`. Optional — leave `undefined` to skip it. (Not to be confused
with `footer.tagline` below, which is a separate, shorter line under the footer
links.)

### 3. Lead-capture provider — `src/config.ts`

```ts
leads: {
  provider: 'mailerlite',   // 'mailerlite' | 'emailoctopus'
  doubleOptIn: true,        // single vs. double opt-in
  groups: [],               // provider list/group IDs
}
```

This selects which adapter the newsletter form uses. `mailerlite` and
`emailoctopus` ship as reference adapters (`src/lib/leads/`); the signup
**endpoint** (`/api/subscribe`) is live -- see
[Newsletter signup](#newsletter-signup) for the required secrets, the
anti-spam handling, and how to add a third/custom provider without touching
this repo's own files.

### 4. Site chrome — theme, header, nav, footer (`src/config.ts`)

Also in `src/config.ts`, alongside `siteUrl` and `leads`:

```ts
theme: {
  mode: 'dark',        // 'dark' | 'light' — the two built-in palettes
  accent: undefined,   // e.g. '#ffb454' — override just the accent color, optional
},
header: {
  logo: {
    src: undefined,    // e.g. '/logo.svg' — a path under public/. Omit for a text wordmark.
    alt: undefined,    // defaults to the author's name if unset
  },
  layout: 'left',      // 'left' (brand left, nav right) | 'centered' (brand centered, nav underneath)
},
nav: [
  { label: 'Series', href: '/series' },
  { label: 'About', href: '/about' },
  // add { label: 'Contact', href: '/contact' } once you have a contact page
],
footer: {
  tagline: undefined,  // optional one-line blurb under the footer links
  links: [],           // extra footer links beyond the built-in Privacy/Terms
},
```

This is an **author-time** choice, not a visitor-facing toggle — if you're an AI
building this site for an author, ask them light or dark, set `theme.mode`, and
optionally tweak `theme.accent` to taste. No CSS editing required. The palettes
themselves live in `src/styles/theme.css` as CSS custom properties, if you do
want to go further (e.g. add a third palette).

**Logo:** if the author has brand artwork, drop it in `public/` (e.g.
`public/logo.svg`) and point `header.logo.src` at it (`'/logo.svg'` — Astro serves
`public/` at the site root). Leaving `logo.src` unset is the default and needs no
asset at all — the header falls back to the author's name as a plain text
wordmark. Either way, `header.layout` controls whether the brand sits to the left
with the nav on the right (`'left'`, the classic look) or centered with the nav
stacked underneath it (`'centered'`).

`/privacy` and `/terms` are built in and always linked from the footer — see
[Legal pages](#legal-pages-privacy--terms) below to edit their text.

For anything beyond an accent tweak — a full palette swap, a third theme, or
changing the fonts — see [Theming guide](#theming-guide) below.

**A few things the engine handles automatically, with no config needed:**
- **Cover images are capped at 400px tall** (`.cover` in `theme.css`) wherever a
  full book/series cover renders — the raw source art is print-resolution and
  would otherwise blow out the layout. Series-list thumbnails are capped
  separately at 150px tall (`.book-thumb`).
- **Any book cover shown on the homepage or the series list page is clickable**,
  linking to the book's page — same destination as the adjacent title link (the
  cover's own link is marked `aria-hidden`/non-tabbable so screen readers don't
  announce the same link twice back to back).
- **Every page with real site hierarchy gets a breadcrumb trail** — Home,
  plus intermediate levels where they exist (Series -> a specific series,
  or a specific series -> its book), rendered above the title
  (`Base.astro`'s `breadcrumbs` slot) and emitted as a matching
  `BreadcrumbList` in JSON-LD (`breadcrumbNode()` in `src/lib/jsonld.ts`) —
  the visible trail and the structured-data one are built from the same
  array so they can't drift apart. A standalone book with no series just
  gets `Home / Book Title`.
- **Every off-site link opens in a new tab** with `rel="noopener noreferrer"` —
  retailer buy links, `sameAs` social/Wikipedia/Goodreads links, event ticket
  links. Internal links (nav, footer legal links, breadcrumbs) are untouched.
  The rule (`src/lib/links.ts`) is a simple one: any `http(s)://` absolute URL
  counts as off-site; every internal route in this repo is a root-relative path,
  so it never misfires.
- **Series listings (`/series` and a series' own `/series/<slug>` page) show
  each book as a row**: a clickable 150px thumbnail, the title, a "Book N"
  label (from the book's `seriesPosition`, omitted if unset), and the first
  ~70 words of the description with a "more" link to the book's own page for
  the rest. One shared component (`src/components/BookListItem.astro`) drives
  both surfaces, so they can't drift out of sync.
- **The author's `photo`** (if set — see the Author table above) renders at up
  to 220px tall next to their bio, in the same cover-left/body-right layout as
  a book card, on both the homepage's "About the author" teaser and their own
  section on `/about`. It's also already emitted as the schema.org `Person`'s
  `image` (`src/lib/jsonld.ts`) — no extra config needed for structured data,
  just add the `photo` field to the author's frontmatter.
- **The book detail page** shows the release date under the cover (formatted in
  UTC so the authored `YYYY-MM-DD` never rolls back a day depending on
  build/viewer timezone), and — for a book that belongs to a series — a
  "Book N of *Series Name*" line under the title, linking to that series' page.
  "Get the book" sits under the blurb, to the right of the cover; "If you
  like..." stays below the whole card. `.get-book-section` and `.comps-section`
  are separate classes if you want to style either independently.
- **The homepage's series teaser** shows a small overlapping "fan" of the
  series' first 3 covers to the right of its blurb/book list (decorative —
  the real links are in the list to the left), folding below the text on
  narrow screens.
- **A series' own blurb** (`.series-description`, wherever a series is
  introduced) and **a listed book's short teaser blurb** (`.book-blurb`, in
  the series-listing rows above) are deliberately separate CSS classes — the
  book blurb ships ~25% smaller by default since it sits next to a small
  thumbnail, but the two can be sized/styled independently either way.
- **Preorders need no separate flag** — a book with a `datePublished` in the
  future *is* a preorder, everywhere at once (`src/lib/date.ts`'s
  `isFutureRelease`, the single source of truth all of the below reads from):
  it emits schema.org `Offer.availability: PreOrder` instead of `InStock`
  (`src/lib/jsonld.ts`); it gets a **PRE-ORDER badge** next to its title on
  series listings and its own book detail page; it's excluded from the
  homepage's "Latest release" slide (which only ever considers already-released
  books); and it appears in the homepage's **Coming soon** row (a horizontal,
  scrollable strip of cover + title + series/Book N + release date, arrows
  auto-hide unless the row actually overflows) and as a "Coming soon" slide in
  the hero slideshow above it. The moment the authored date passes and the
  site rebuilds, all of this flips to "released" on its own — nothing to
  toggle back manually.
- **Book pages list the themed hub(s) they belong to** — a "Featured in"
  section under "If you like...", linking to each `/themes/<slug>` the book
  is a member of (see [Theme (hub)](#theme-hub--srccontenthubsslugmd) above).
  Nothing to configure; a book with no hub membership simply omits the
  section.

### 5. Homepage hero slideshow — `src/config.ts`

```ts
heroSlideshow: {
  intervalSeconds: 7,   // auto-advance interval; only matters with >1 slide
}
```

The homepage's top section is a slideshow: the most recently **released** book
first, then one slide per **upcoming** (preorder) book, soonest release first.
It auto-advances every `intervalSeconds`, pauses while the mouse or keyboard
focus is over it, and always shows arrows + dots once there's more than one
slide. See the preorder bullet below for how a book becomes "upcoming" in the
first place — there's no separate flag to set.

### 6. Secrets — `.env` (Tier 2)

Copy `.env.example` to `.env` for local dev/build-testing. Two independent
groups, at different stages:

- **Newsletter** (`MAILERLITE_API_KEY`, or `EMAILOCTOPUS_API_KEY` +
  `EMAILOCTOPUS_LIST_ID`) — **live**, consumed by `/api/subscribe` right now
  (see [Newsletter signup](#newsletter-signup) for which one is required,
  matching `siteConfig.leads.provider`).
- **Contact form** (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`,
  `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`) — **live**, consumed by
  `/api/contact` right now (see [Contact form](#contact-form) for the full
  table of which is a real secret vs. a public build-time value).

**Never commit real values** — set them as Cloudflare **Worker** environment
variables/secrets in production (see
[Deploying to Cloudflare](#deploying-to-cloudflare) for why it's "Worker",
not "Pages").

---

## SEO basics: robots.txt, sitemap, 404

Three crawlability basics that are easy to forget on a hand-rolled site, all
handled automatically — nothing to configure beyond the site URL above:

- **`robots.txt`** is generated at build time by `src/pages/robots.txt.ts`
  (not a static file in `public/`) so its `Sitemap:` line is always built from
  the SAME `site` value as every JSON-LD `@id` and the sitemap itself — one
  more static copy of the domain would just be a fourth place to forget to
  edit. Since `/api/contact` went live, it emits `Disallow: /api/` — those are
  form-submission endpoints, not content, and have no reason to be indexed.
- **`sitemap.xml`** comes from the official `@astrojs/sitemap` integration
  (wired into `astro.config.mjs`). It walks the actual static build output, so
  every page you add is picked up automatically — nothing to maintain by hand.
  It's emitted as `sitemap-index.xml` + `sitemap-0.xml` (Astro's default
  layout), which is what `robots.txt` points at.
- **A real 404.** `src/pages/404.astro` is a themed not-found page (same
  header/footer/chrome as everything else) that Astro's build special-cases
  into a flat `dist/client/404.html`. This repo deploys via Cloudflare's
  Workers static-assets product (see the deploy-model callout in
  [Deploying to Cloudflare](#deploying-to-cloudflare)), where getting a
  genuine `404` status for an unmatched URL — instead of a silent `200`
  serving `index.html` for everything — requires an **explicit**
  `assets.not_found_handling = "404-page"` in `wrangler.toml`. It's set
  there deliberately (with a comment explaining why); don't remove it when
  touching that file, or this exact gap reopens under a different deploy
  model than the one it was originally closed for.

---

## Social sharing: Open Graph & Twitter Cards

Every page emits Open Graph and Twitter Card meta tags (`src/layouts/Base.astro`)
— without these, a link shared on Facebook/Meta ads, X, Slack, iMessage, etc.
falls back to a bare gray card with no title, description, or image at all,
which is exactly the gap this closes. Nothing to configure beyond content you
already have:

- **`og:title` / `og:description` / `twitter:title` / `twitter:description`**
  come straight from the same `title`/`description` every page already passes
  to `<Base>` — no duplicate copy to maintain.
- **`og:image` / `twitter:image`** resolve to an absolute URL from whichever
  image is most relevant to that page: a book's own `cover` on its detail
  page, a series' `cover` (or its first book's, if the series has none) on
  series pages, the latest release's cover on the homepage — falling back to
  the primary author's `photo` (from `src/content/author`) everywhere else. If
  neither exists yet (e.g. a fresh clone with no author photo set), the image
  tags are simply omitted — previews still work, just without a thumbnail.
  `twitter:card` is `summary_large_image` when there's an image, `summary`
  otherwise.
- **`og:type`** is `book` on book detail pages (unlocking `book:isbn` and
  `book:release_date` — read from the edition that has an ISBN, and the
  book's own `datePublished`, respectively) and `website` everywhere else.
- **`og:site_name`** is the primary author's name — this is a single-author
  site template, so the "site" and the "author" are the same identity.
- **`twitter:site`** (optional, "via @handle" credit on X card previews) reads
  `siteConfig.social.twitterHandle` in `src/config.ts` — leave it `undefined`
  to omit; nothing else depends on it.

All of this lives in `Base.astro`'s `Props` (`image`, `type`, `bookIsbn`,
`bookReleaseDate`) — a page template opts in by passing whichever of those
it has; none are required.

---

## Theming guide

> **Need to change a component's actual markup/structure, not just colors,
> fonts, or spacing — or restructure the whole page shell?** This section
> covers the token layer only (the common case). For the full three-tier
> system — tokens, selective component/layout shadowing via `src/overrides/`,
> and the hard structured-data boundary that's never overridable — see
> **[`THEMING.md`](./THEMING.md)**.

`theme.mode` + `theme.accent` in `src/config.ts` (see [Configuration](#configuration)
above) cover the two things an author is likely to want without touching CSS at
all. Everything below is for going further — a full palette swap, a third theme,
or different fonts.

Both palettes live in **`src/styles/theme.css`** as CSS custom properties, scoped
under `:root[data-theme="dark"]` and `:root[data-theme="light"]`. `Base.astro` sets
`data-theme` on `<html>` from `siteConfig.theme.mode`, and inlines `--accent`/
`--accent-contrast` overrides in a `<style>` tag in `<head>` if `theme.accent` is
set — so an accent override always wins over the palette default, and nothing
else needs to change.

### The variables

| Variable | Controls | Dark default | Light default |
|---|---|---|---|
| `--bg` | Page background | `#0b0e14` | `#fbfaf7` |
| `--bg-elevated` | Header/footer bg, `.card` bg (book/series cards, etc.) | `#12161f` | `#ffffff` |
| `--text` | Body text, headings, wordmark | `#e8eaf0` | `#1b1f27` |
| `--text-muted` | Subtitles, footer text, legal "last updated" line | `#9aa3b5` | `#5b6472` |
| `--accent` | Links, nav hover, wordmark hover | `#5fd3ff` | `#1c5cff` |
| `--accent-contrast` | Text color drawn *on top of* an accent-colored fill (currently unused by any filled component, but kept so a future button/badge has a correct contrast color ready) | `#04141a` | `#ffffff` |
| `--border` | Header/footer border, `.card` border | `#232838` | `#e3e1da` |
| `--shadow` | Cover image drop shadow (`.card img`, `.cover`) | `0 8px 24px rgba(0,0,0,0.4)` | `0 8px 24px rgba(20,20,20,0.08)` |
| `--font-heading` | `h1`–`h4` heading font stack — same value in **both** themes (lives in a plain `:root { }` block, not per-theme) | `Georgia, "Iowan Old Style", "Times New Roman", serif` | *(same)* |

### Doing a full palette swap

Edit the values inside the relevant `:root[data-theme="..."] { ... }` block in
`theme.css` directly — e.g. to retheme dark mode around a purple accent instead
of cyan, change `--accent` and `--accent-contrast` together (contrast must stay
readable against the new accent, since nothing currently auto-computes it).
Keep `--bg` vs `--bg-elevated` and `--text` vs `--text-muted` each a step apart in
contrast — that's what gives the header/footer/cards visual separation from the
page body.

### Adding a third theme

The two palettes aren't hardcoded elsewhere — `Base.astro` just writes whatever
string is in `theme.mode` into `data-theme`. To add e.g. a `"sepia"` theme:

1. Add a `:root[data-theme="sepia"] { ... }` block to `theme.css` defining all
   eight variables above.
2. Loosen the `theme.mode` type in `src/config.ts` (and its Zod/TS type if one
   constrains it to `'dark' | 'light'`) to include `'sepia'`.
3. Set `theme.mode: 'sepia'`.

No component code needs to change — components only ever reference the CSS
variables, never a mode name directly.

### Fonts

Not yet a `config.ts` setting. The **heading** font (`h1, h2, h3, h4`) is a
token — change `--font-heading` in `theme.css` directly (see the variable
table above). The **body** font (UI/body text — currently a system-font
stack) is still a literal in `src/styles/base.css`'s `body` rule, not yet
promoted to a token; changing it means editing that upstream-owned file
directly (a `git pull upstream main` conflict risk) until it's promoted the
same way `--font-heading` was, or use the free-form CSS override slot
(`src/overrides/styles/site.css`, see [`THEMING.md`](./THEMING.md#tier-2b--free-form-css-override-srcoverridesstylessitecss))
to override `body`'s `font-family` without touching base.css at all. If you
want the body font configurable without a CSS edit too, that's a reasonable
follow-up: add `theme.fontBody` to `config.ts` and inline it the same way
`Base.astro` already inlines the accent override.

---

## Legal pages (Privacy & Terms)

`/privacy` and `/terms` ship built in, sourced from a `legal` content collection
(`src/content/legal/privacy.md`, `src/content/legal/terms.md`) — edit them like
any other content, no engine changes needed. They're plain long-form pages: no
JSON-LD is emitted for them (they aren't a schema.org entity), and their frontmatter
contract is just `title`, `slug` (`'privacy'` or `'terms'` — fixed, one file each),
and `updated` (a date, so a stale unreviewed policy is visible, not silent).

**Both ship with generic, GDPR-aware starter text and an explicit banner saying
so.** They are not legal advice and have not been reviewed by a lawyer — have them
reviewed for your jurisdiction and actual data practices (what your lead-capture
provider collects, your hosting provider, any analytics you add later) before
relying on them. Update the `updated` frontmatter date whenever you revise the text.

Both pages are always linked from the site footer automatically — nothing else to wire up.

---

## Contact form

**Live (2026-07-24).** `/contact` (`src/components/ContactForm.astro`) POSTs to
a real, working `src/pages/api/contact.ts` — an on-demand Cloudflare Workers
route (`export const prerender = false`) that sends the message via **Resend**,
gated by **Cloudflare Turnstile**. Nothing about the rest of the site changed:
every other route is still a plain prerendered static file (see the deploy-model
callout in [Deploying to Cloudflare](#deploying-to-cloudflare) for why only this
one route needed a real server).

**Why there's no `mailto:` link or visible email address anywhere on the
page:** any address in the page source gets scraped by spam bots within days.
The whole design point of routing this through a server-side endpoint is that
the destination inbox is a **secret**, never rendered to the browser and never
committed to the repo.

**Anti-spam, cheapest check first** (so a bot spends as little of your
Resend/Turnstile quota as possible):
1. **Honeypot** — the hidden `company` field. Filled in -> the endpoint returns
   a *fake* success (so a bot gets no signal it was caught) and does nothing
   further: no Turnstile call, no Resend call.
2. **Turnstile** — verified server-side (`src/lib/turnstile.ts`, calling
   Cloudflare's own `siteverify` endpoint) *before* Resend is ever touched.
   A missing/invalid token is a real `400`.
3. **Resend** (`src/lib/email/resend.ts`) — only reached once both of the above
   pass. Failures here return a real `502`, never a silent success.

**Required config, all in `.env.example`:**

| Var | Where it's set | Secret? | Notes |
|-----|----------------|---------|-------|
| `RESEND_API_KEY` | Cloudflare Worker env var | **yes** | From your Resend account. |
| `CONTACT_FROM_EMAIL` | Cloudflare Worker env var | no, but private | Must be a sender verified on a domain you've set up in Resend. |
| `CONTACT_TO_EMAIL` | Cloudflare Worker env var | no, but private | Your real inbox — never rendered to the browser or committed. |
| `TURNSTILE_SECRET_KEY` | Cloudflare Worker env var | **yes** | Verified server-side only, never sent to the browser. |
| `TURNSTILE_SITE_KEY` | **build-time** env var (`.env` locally, a plain build variable in Cloudflare's Git-integration build settings — NOT a Worker runtime secret) | no — meant to be public, same as reCAPTCHA's site key | Read in `ContactForm.astro`'s frontmatter (server/build-time render, embedded as `data-sitekey`) to render the widget. Missing it fails `npm run build` loudly rather than silently shipping a form with no spam gate. |

**Why Resend, not Postmark/MailChannels:** MailChannels' free integration for
Workers/Pages **ended June 2024** — don't follow older tutorials that assume
it's still free. Postmark was considered and rejected specifically for this
project: its free tier is 100 emails/month (explicitly dev/test-only), against
Resend's 3,000/month free tier — for a low-traffic author contact form, that's
the difference between "free indefinitely" and "paying from day one." The code
is written behind a small `EmailSender` interface (`src/lib/email/types.ts`,
mirroring the existing `LeadAdapter` pattern in `src/lib/leads/`) specifically
so a second provider is one new adapter file away if that calculus ever
changes — see [For developers](#for-developers--ai-editors).

**Why `Astro.locals.runtime.env` doesn't appear anywhere in this code:** it was
removed in this adapter's current major. Runtime env vars/secrets are read via
`import { env } from 'cloudflare:workers'` instead (see `src/env.d.ts` and
`src/pages/api/contact.ts` — the same pattern is used by
`src/pages/api/subscribe.ts`, see [Newsletter signup](#newsletter-signup)) —
if you're extending either endpoint or adding a new on-demand route, use that
pattern, not the older one you may find in older tutorials/AI training data.

---

## Newsletter signup

**See [`NEWSLETTER.md`](./NEWSLETTER.md) for the full standalone reference**
(request flow, configuration table, adding a custom CRM/ESP provider). Summary:

**Live.** The home page's `SubscribeForm` (`src/components/SubscribeForm.astro`,
imported via `@theme/components/SubscribeForm.astro` — see
[Theming guide](#theming-guide) / [`THEMING.md`](./THEMING.md) to restyle or
restructure it) POSTs to a real, working `src/pages/api/subscribe.ts` — an
on-demand Cloudflare Workers route (`export const prerender = false`) that
hands the submission to a pluggable lead-adapter factory. Same deploy model
as the contact form: every other route stays a plain prerendered static file
(see the deploy-model callout in
[Deploying to Cloudflare](#deploying-to-cloudflare)) — this is a second
on-demand route, not a new architecture switch.

**Anti-spam, cheapest check first** (mirrors the contact form's ordering —
see [Contact form](#contact-form) for why cheapest-first matters):
1. **Honeypot** — the hidden `hp_check` field. Filled in -> the endpoint logs
   the drop and returns a *fake* success (no signal to the bot it was caught),
   with no provider call made.
2. **Email format check** — a plain, deliberately-not-RFC-5322-complete regex
   (same bar as a browser's own `<input type="email">`), enforced server-side
   since this endpoint is reachable directly, not only through the browser
   form. A missing/malformed address is a real `400`.
3. **Provider call** (`src/lib/leads/factory.ts` → the configured adapter) —
   only reached once both of the above pass. A misconfigured provider (unset
   `siteConfig.leads.provider`, missing secret) is a real `500`, logged with a
   specific, actionable message; a real provider API rejection is a real
   `502`. Nothing here ever swallows an error into a fake `{ ok: true }`.

**Which provider is active is a CONFIG choice, not an env var** —
`siteConfig.leads.provider` in `src/config.ts` (`'mailerlite'` |
`'emailoctopus'` | a custom name, see below). You only need to fill in the
`.env` block matching whichever one you picked.

**Required config, all in `.env.example`:**

| Var | Where it's set | Secret? | Required when... |
|-----|----------------|---------|-------------------|
| `MAILERLITE_API_KEY` | Cloudflare Worker env var | **yes** | `siteConfig.leads.provider === 'mailerlite'` |
| `EMAILOCTOPUS_API_KEY` | Cloudflare Worker env var | **yes** | `siteConfig.leads.provider === 'emailoctopus'` |
| `EMAILOCTOPUS_LIST_ID` | Cloudflare Worker env var | no, but private | `siteConfig.leads.provider === 'emailoctopus'`, unless a per-form `listId` prop is supplied instead |

**The two shipped adapters** (`src/lib/leads/{mailerlite,emailoctopus}.ts`)
were re-checked against each provider's *current* API before this endpoint
was wired up (not assumed from older docs/training data):
- **EmailOctopus** — targets the current v2 API; supports `groups`/`tags`
  (`lead.groups`, resolved from a per-form `groupId`/`listId` prop or
  `siteConfig.leads.groups`) and single-vs-double opt-in via
  `siteConfig.leads.doubleOptIn` (`PENDING` vs `SUBSCRIBED` status).
- **MailerLite** — targets the current API; `doubleOptIn` has **no**
  per-request equivalent here — it's a group-dashboard setting in
  MailerLite's own UI, not something this endpoint can toggle per call.

**Adding a custom provider** (referenced from `src/config.ts` and
`src/lib/leads/factory.ts`'s own comments): a fork can add a third (fourth,
...) CRM/ESP with **zero edits to any upstream file**, by dropping ONE file
at `src/overrides/providers/<name>.ts` that exports a factory function named
`<name>` (matching the file's own base name) with the shape:

```ts
import type { LeadAdapter } from '../../lib/leads/types';
import type { LeadProviderEnv, LeadTargetOverrides } from '../../lib/leads/factory';

export function myCrm(
  env: LeadProviderEnv & Record<string, string | undefined>,
  overrides: LeadTargetOverrides,
): LeadAdapter {
  // read your own secret name(s) off `env`, return a LeadAdapter
}
```

then set `siteConfig.leads.provider = 'myCrm'` in `src/config.ts`. The
factory (`getLeadAdapter`) discovers every file under
`src/overrides/providers/` at **build time** via Vite's `import.meta.glob`
(not a runtime filesystem check like the `@theme/...` component-override
plugin uses — Cloudflare Workers have no runtime filesystem, so that
mechanism isn't available here) and picks whichever one's filename matches
the configured provider name. This survives `git pull upstream main`
exactly like a shadowed component under `src/overrides/components/` does —
your file, upstream's factory, never the same file.

**Why `Astro.locals.runtime.env` doesn't appear anywhere in this code:**
same reason as the contact form — see [Contact form](#contact-form)'s
writeup. Runtime env vars/secrets are read via
`import { env } from 'cloudflare:workers'` (see `src/env.d.ts` and
`src/pages/api/subscribe.ts`).

---

## Validating your structured data

The build catches *schema* errors (a missing required field). It does **not**
catch *structured-data* errors — a dangling reference, a canonical URL on the wrong
node, an author `@id` that resolves nowhere. Those pass `astro build` silently and
are exactly what breaks GEO.

The enforcement is a **SHACL validation gate** (see the companion `schema-validator`
setup). The workflow:

1. `npm run build`
2. For each built page in `dist/`, collect **all** `<script type="application/ld+json">`
   blocks on that page and merge them (a crawler reads them together — the page's
   `WebSite` node and its entity node live in separate blocks).
3. POST the merged per-page graph to the validator.
4. It must return **SUCCESS** with **zero dangling references** on every page type
   (home, about, book, series, theme, events).

The gate enforces the two rules that make this product work:
- **DD-001:** every `author`/`publisher` reference resolves to a `Person` (a named
  stub `{@type, @id, name}` is accepted — see the DDs).
- **DD-005:** the primary Book carries its own canonical `url`; retailer links are
  `Offer.url` on editions.

> If you change engine code that touches JSON-LD, **the gate is your proof**, not
> a green build. It is designed to fail loudly on the silent-failure classes above.

**A live-site review (2026-07-23) caught failure classes the gate
deliberately doesn't check (structural-only, not semantic/Rich-Results/
vocabulary — see the gate's own header comment), all now fixed at the source:**
- `image` fields were root-relative paths, invalid outside page context —
  now absolute everywhere (rule 7 in [For developers](#for-developers--ai-editors)).
- The shared `WebSite` node was asserting a different `name` per page (the
  page's own title) — split into a constant `WebSite` + a per-page `WebPage`
  node (rule 6).
- JSON-LD `url`/`@id`s omitted the trailing slash that `<link rel="canonical">`
  (and Cloudflare Pages' actual served URL) always has — now consistent
  (rule 8).
- No `BreadcrumbList` existed anywhere, and a book's position within its
  series was emitted as an invalid `position` property directly on the
  `Book` node (`position` only exists on `ListItem` in schema.org's
  vocabulary). Fixed by adding `breadcrumbNode()` (emitted, matching the
  visible breadcrumb trail, on book/series/theme pages and the series
  index) and `seriesReadingOrder()` (an `ItemList`/`ListItem` expressing
  reading order validly, replacing the invalid `Book.position`) — rule 9.

**A second review pass (2026-07-23, same day) caught a further batch, all now
fixed at the source too:**
- The `/events` page emitted a second, empty `{"@graph": []}` JSON-LD block
  even when its own body correctly said "No upcoming events" — a structured
  data block should never assert nothing while claiming to describe
  something. Fixed: the block is omitted entirely when there are no events,
  matching how `HeroSlideshow`/`ComingSoonRow` already render nothing at all
  when they have nothing to show.
- Theme pages carried **two** page-entity nodes for one URL — the generic
  `WebPage` node every page gets, and the hub's own `CollectionPage` node —
  both asserting the same `name`/`description`. Since `CollectionPage`
  **is-a** `WebPage` in schema.org's own hierarchy, this was the exact same
  "one entity, two sets of facts" contradiction as the old `WebSite.name` bug,
  just relocated onto a different node pair. Fixed: a hub page's own node is
  now `Base.astro`'s per-page node, typed `CollectionPage` instead of the
  default `WebPage` (rule 10).
- Cover images in **listing/carousel** contexts (`BookListItem`,
  `HeroSlideshow`, `ComingSoonRow`, the homepage's series cover stack) had
  empty `alt=""` — book/series detail pages already did this correctly
  (`alt="Cover of <title>"`); the listing components just hadn't been brought
  up to the same standard. Fixed across all four.
- The `Pre-order` badge was concatenating directly onto the adjacent heading
  text with no separator (`Tanis Richards: AgentPre-order`) on three
  headings (`BookListItem`, `HeroSlideshow`, the book detail page's `h1`) —
  Astro's compiler collapses the whitespace between the title expression and
  the badge's own `{...}` expression, so an explicit `{' '}` text node is
  needed. Fixed in all three, plus one non-heading occurrence on the
  homepage's series list found the same way while in there.
- **`og:image:alt` / `twitter:image:alt` now describe the image**, not the
  page — they were bound to the page `title` on every page (correct-by-luck
  only on a book's own page, where the title happens to include the book
  name; wrong everywhere else, e.g. the homepage's image is a book cover but
  its title is the author's name). Fixed via a new `imageAlt` prop on
  `<Base>`, resolved in lockstep with the `image` prop it describes (rule 12).
- `Person.url` and `WebSite.url` were the only two `url`/`@id` values left
  without the trailing slash every other one already has (rule 8) —
  `WebSite.url` now goes through `pageUrl()` like everything else. Beyond the
  slash, `Person.url` was also pointing at the bare site root rather than the
  author's own canonical page — now derived as `/about` (this site's
  canonical `Person` home, per DD-001), never read from authored content
  (rule 12 in [For developers](#for-developers--ai-editors)).
- **`seriesPosition: 0.5`** (encoding "this is a prequel" as a fractional
  reading-order slot) would silently produce a `ListItem.position` no
  ordering consumer can use, and could invalidate the whole reading-order
  `ItemList` in a strict validator — schema.org's own reading-order signal is
  exactly what fan-out sub-queries ("what order should I read this series
  in?") rely on. The content schema now **requires an integer** for
  `seriesPosition`, failing the build immediately with a clear message
  rather than shipping a fractional value that degrades silently (rule 13).
  A prequel that reads before book 1 should use `seriesPosition: 0` — an
  integer that's still correctly "before 1" without renumbering every other
  book in the series.

### Cross-page identity gate — `npm run validate:crossid`

The gate above (`validate-jsonld.mjs`) checks **references within one page** —
does every `{"@id": "..."}` pointer resolve to something defined on that same
page? It cannot see, and was never scoped to see, a different failure class:
the **same `@id` asserting contradictory data on different pages**. That's a
real bug this repo shipped: every page emitted the shared `WebSite` node under
one `@id` (`#website`), but that node's `name` was bound to the page's own
`<title>` — so the "same" entity had a different name on every page, and
`validate-jsonld.mjs` was structurally blind to it (on any single page, in
isolation, the node was perfectly well-formed).

`scripts/validate-crossid.mjs` closes that gap: it builds the site, walks
**every** page's JSON-LD, groups every node with both `@id` and `@type` by its
`@id`, and flags any `@id` where two pages disagree on a shared property
value (or on `@type` itself). Missing keys are **not** flagged — a minimal
named stub (`{@id, @type, name}`) referencing a fuller node defined elsewhere
is the normal, correct pattern used throughout this codebase, not a
contradiction.

```sh
npm run build
npm run validate:crossid
```

Run it alongside (not instead of) `validate:ld` — they catch different bugs:

| | `validate:ld` | `validate:crossid` |
|---|---|---|
| Scope | within one page | across all pages |
| Catches | dangling `{@id}` references, malformed JSON | the same `@id` asserting different data on different pages |
| Would've caught the `WebSite.name` bug? | No (well-formed on every single page) | Yes (exactly what it's built for) |

---

## Deploying to Cloudflare

Tier 1 stays a **static** build (`output: 'static'`) — books, series, themes,
events, about, legal are all still plain prerendered files, zero per-request
cost. Only `/api/contact` (Tier 2, live) runs on demand. What changed with
Tier 2's forms landing is **how that gets deployed**, not how much of the site
is dynamic.

> **Why this isn't "Cloudflare Pages" anymore (2026-07-24):** adding the
> contact form's on-demand `/api/contact` route required the Cloudflare
> adapter (`@astrojs/cloudflare`) so *that one route* has a real server to run
> in. The version of the adapter this repo is pinned to (v14, which this
> project's Astro major requires) has **"Removed: Cloudflare Pages support"**
> in its own changelog — the classic `pages_build_output_dir` config this repo
> used through all of Tier 1 no longer works with it at all, and hits a real,
> currently-open upstream bug if you try
> (wrangler 4.98+ rejects the adapter's own auto-generated `"ASSETS"` binding
> name specifically when `pages_build_output_dir` is present — see
> [cloudflare/workers-sdk#14226](https://github.com/cloudflare/workers-sdk/issues/14226)
> and [withastro/astro#16107](https://github.com/withastro/astro/issues/16107)).
> The supported path now is Cloudflare's newer **Workers static-assets** model
> instead — same idea (prerendered files served directly, one route
> on-demand), different deploy mechanics. If a future adapter/wrangler
> release restores Pages support, revisit this; don't assume it's permanent.

**Before you deploy:** set your real site URL in both places (see
[Configuration](#configuration)), and set the Tier 2 secrets (see
[Contact form](#contact-form)) as real Cloudflare **Worker** environment
variables/secrets (Settings → Variables and Secrets on the Worker, not a
Pages project — there is no Pages project anymore).

### Option A — Git integration (recommended for clone-and-edit)

Cloudflare builds and deploys on every push.

1. Push this repo to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Workers → Connect to Git**
   → pick the repo. (Not "Pages" — see the callout above.)
3. Build settings:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy` (this repo's `wrangler.toml`
     already has everything Wrangler needs — `main`/`assets.directory`/
     `assets.binding` are all adapter-managed automatically; see the comment
     block at the top of `wrangler.toml` before you're tempted to hand-add
     them, it explains why that breaks the build).
   - **Node version:** set an env var `NODE_VERSION` = `22.12` (or newer) so the
     build host matches the project's requirement.
4. Set the Tier 2 secrets (RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL,
   TURNSTILE_SECRET_KEY) as **Worker** environment variables/secrets, and
   `TURNSTILE_SITE_KEY` as a **build-time** environment variable (it's read at
   build time in `ContactForm.astro`, not a runtime secret — see
   [Contact form](#contact-form)).
5. **Save and Deploy.** Every push to the production branch redeploys; other
   branches get preview URLs.
6. Add your custom domain under the Worker's **Custom domains** tab.

### Option B — Direct upload with Wrangler (manual / CI)

```sh
npm install -g wrangler      # or npx wrangler
npm run build
wrangler deploy              # reads wrangler.toml + dist/server/wrangler.json
```

Use this for local one-off deploys or a custom CI pipeline.

---

## For developers / AI editors

The engine is small and layered. If you're modifying the code (or you're an AI
asked to), this is the map — and the contract you must not break.

```
src/
  content.config.ts     # THE CONTRACT: Zod schemas for every collection. Source of truth.
  config.ts             # author-editable behavior (site URL, leads provider, theme/nav/footer)
  styles/base.css        # UPSTREAM-owned structural/layout CSS (var()-consuming only)
  styles/theme.css       # IMPLEMENTER-owned tokens: the two built-in palettes (CSS custom
                         #   properties, colors/fonts/spacing) -- see THEMING.md (Tier 1)
  overrides/              # IMPLEMENTER's selective component/layout shadows, resolved via
                         #   the `@theme/...` Vite alias (vite-plugins/theme-override.mjs)
                         #   -- see THEMING.md (Tier 2) and src/overrides/README.md
  overrides/styles/       # IMPLEMENTER's optional free-form CSS override (site.css), resolved
                         #   via the `@theme-styles/site.css` virtual specifier (empty-stub
                         #   fallback if absent) -- see THEMING.md (Tier 2b) and
                         #   src/overrides/styles/README.md
  lib/
    ContentSource.ts     # the seam: the interface templates + JSON-LD depend on
    sources/FileSource.ts# reads content collections -> ContentSource (co-author aware)
    jsonld.ts            # THE ENGINE: builds the schema.org @graph (nodes + named stubs)
    leads/               # MailerLite / EmailOctopus adapters + factory.ts (Tier 2, live -- /api/subscribe)
    email/               # EmailSender interface + Resend adapter (Tier 2, live -- /api/contact)
    turnstile.ts         # Cloudflare Turnstile server-side verification (Tier 2, live)
  layouts/Base.astro     # emits the sitewide WebSite node (+ publisher named stub) AND a
                         #   per-page node (title/description, isPartOf -> WebSite; WebPage
                         #   by default, or a more specific @type like CollectionPage via
                         #   pageType/pageId/pageExtra -- see rule 10); wraps every page in
                         #   Header/Footer, applies theme.mode/accent
  components/            # JsonLd, SubscribeForm, ContactForm, CompsBlock, Header, Footer
  pages/                 # route templates: index, about, books/[slug], series/[slug],
                         #   series/index (nav landing page), themes/[slug], events/index,
                         #   privacy, terms (legal collection, no JSON-LD), contact (static
                         #   form shell, no JSON-LD)
    api/contact.ts        # LIVE Tier 2 endpoint: on-demand (prerender=false), Resend + Turnstile
  env.d.ts                # types the `cloudflare:workers` env import (Tier 2 runtime vars/secrets)
```

**The rules that make the structured data correct** (violating them is a silent
failure the build won't catch — run the gate):

1. **One canonical definition, referenced everywhere else (DD-001).** Each entity
   (a `Person`, a `Book`) is fully defined **once**, at its canonical `@id`. Every
   other reference to it is a **named stub** — `{@type, @id, name}` — never a bare
   `@id` (which dangles for consumers that don't chase `@id`), and never a second
   full definition (which creates two competing authorities). The canonical `Person`
   lives on `/about`; the homepage shows the author blurb as **display text only** and
   emits no second Person node.

2. **Authors are always an array** (co-author-safe), everywhere — schema, seam,
   and emission.

3. **Canonical URL discipline (DD-005).** A Book's `url` is its page on this site.
   Retailer buy-links are `Offer.url` on editions, never `Book.url`.

4. **`site` is load-bearing.** `jsonld.ts` builds every absolute `@id` from
   `import.meta.env.SITE`. A wrong/placeholder `site` produces wrong `@id`s that
   pass the build.

5. **Prove changes with the gate, not the build.** Merge all `ld+json` blocks per
   page and validate; require SUCCESS + zero dangling refs across every page type.

6. **One entity, one set of facts — never asserted two ways.** The `WebSite`
   node's `@id` (`{siteUrl}/#website`) is emitted **identically on every page**,
   so its properties (`name` in particular) must be the same every time — it's
   the same real-world entity, not a new one per page. Page-specific facts
   (the page's own title/description) belong on a separate `WebPage` node
   instead (own `@id`, `isPartOf` pointing back at the `WebSite`), never
   folded into the shared `WebSite` node. This is why `WebSite.name` is the
   site's author name, not `title` — see `Base.astro`.

7. **Every `image` in JSON-LD is an absolute URL** (`src/lib/jsonld.ts`'s
   `absImage()`), never a root-relative path. An `<img src="/covers/x.png">`
   is fine — it resolves against the page it's on — but a JSON-LD consumer
   (a feed reader, a scraper, an API) may have no page context to resolve a
   relative path against, so schema.org effectively requires absolute image
   URLs to be safe.

8. **Every page's own `url`/`@id` (and any `@id` built off it, like a
   fragment reference) is trailing-slash-normalized** (`pageUrl()` in
   `jsonld.ts`). This isn't cosmetic: Astro's static build emits directory-style
   output (`/foo/index.html`), and Cloudflare Pages serves that at `/foo/`
   while 308-redirecting the slash-less `/foo` to it — so `/foo` is not this
   site's real, final URL. Asserting it in JSON-LD would put a
   redirect-then-resolve hop between a crawler's citation and the actual
   page, and would also mismatch `<link rel="canonical">` (which is always
   the real, already-slash-correct `Astro.url`) — the exact "canonical and
   JSON-LD disagree" failure class this rule exists to prevent.

9. **`position` only ever appears on a `ListItem`, never on a `Book`.**
   Schema.org declares `position` as a property of `ListItem` (and nothing
   else usable here) — a Book has no such property, so putting "book 3 in
   this series" directly on the `Book` node is invalid structured data, even
   though nothing in the build or the gate would have caught it (it's a
   *vocabulary* error, not a dangling reference). The valid pattern for "this
   thing is item N in an ordered list of things" is always a dedicated
   `ItemList`/`ListItem` node that wraps a **named stub** reference — see
   `seriesReadingOrder()` (a book's position within its series) and
   `breadcrumbNode()` (a page's position in the breadcrumb trail) in
   `jsonld.ts`, and `hubPageExtra()`'s `mainEntity`, which already used this
   pattern correctly. When you need to express an order or rank of
   something, reach for this pattern rather than bolting a `position` field
   onto whatever node feels closest.

10. **A page gets exactly ONE node describing the page itself, never two.**
    `Base.astro`'s per-page node is `WebPage` by default — but if a page's
    real subject is a more specific kind of page (e.g. a themed hub is a
    `CollectionPage`, which **is-a** `WebPage` in schema.org's own hierarchy),
    that page must override the per-page node's own `@type`/`@id`/extra
    properties (`pageType`/`pageId`/`pageExtra` props) rather than ALSO
    emitting its own separate full node. Two nodes asserting the same
    `name`/`description` for the one URL is the same contradiction as rule 6,
    just between a page's generic and specific representations instead of
    between `WebSite` and `WebPage`. See `hubPageExtra()` in `jsonld.ts` and
    `themes/[slug].astro`.

11. **Never emit a structured-data block with nothing in it.** A
    `{"@graph": []}` (or any node with no real content) asserts nothing while
    implying there's something to read — if a page has nothing to describe
    (e.g. `/events` with zero events), omit the `<JsonLd>` block entirely,
    the same way `HeroSlideshow`/`ComingSoonRow` already render nothing at
    all rather than an empty shell.

12. **Every image reference — `alt` text, `og:image:alt`/`twitter:image:alt`,
    and `Person.url`/similar identity fields — must describe the actual thing
    it's attached to, resolved from the SAME source as whatever it sits next
    to, never a generic fallback that happens to be convenient.** Concretely:
    an `<img>` in a listing/carousel needs its own real `alt` (`"Cover of
    <title>"`), not `alt=""`, even when a visible title link sits right next
    to it. An OG/Twitter image's `alt` describes the image (pass `imageAlt`
    alongside `image` to `<Base>`) — never reuse the page `title`, which
    describes the page, not necessarily the picture (the homepage's `title`
    is the author's name; its image is a book cover — those are not the same
    fact). `Person.url` is this site's own `/about` page (`pageUrl('/about')`
    in `authorNode()`), derived by the engine — not read from the author
    content collection's own `url` field, which has no other job on the site
    and was the one value not conforming to this rule.

13. **Any authored value that becomes a `ListItem.position` (or is compared
    for ordering) must be validated as a genuine integer at the content-schema
    layer**, the same discipline already applied to `price`/`currency` (see
    the edition schema). `seriesPosition: z.number().int(...)` in
    `content.config.ts` — a fractional "placeholder" position (e.g. `0.5` for
    a prequel) builds fine right up until a strict validator rejects the
    whole `ItemList` it lands in, silently costing you the reading-order
    signal the node exists to provide. If something genuinely reads before
    position 1, give it position `0` — schema.org doesn't require lists to
    start at 1 — rather than inventing a non-integer slot.

14. **Every edition needs at least one canonical identifier** (`isbn`, `asin`,
    or `sku`) — enforced by a schema `.refine()` on the edition object, same
    discipline as required `price` (reviewer finding 2026-07-23: ebook
    editions in particular were shipping with none of the three, leaving
    that `Offer` with no stable identity a shopping/answer-engine consumer
    can match). Don't assume `isbn` alone is enough to require: many indie
    ebook-only editions never get an ISBN assigned at all, so the schema
    accepts `asin` (Amazon/KDP) or `sku` (any other storefront's own
    product id) as equally valid alternatives. Also note where each one is
    emitted in JSON-LD, since they're NOT interchangeable there: `isbn` is a
    native `Book` property (lives on the `workExample` node), while `asin`
    and `sku` are `Offer`/`Product` properties per schema.org's own
    domain — they belong on the `offers` node, never on the Book. (A real,
    live bug existed here before this fix: `asin` was defined in the schema
    and authored in real content since PR #22, but `jsonld.ts` never
    actually emitted it anywhere — it was silently dropped from every page's
    structured data.)

**When you pull upstream:** engine changes land in `src/` (outside `src/content/`);
your content stays untouched. If an upstream schema change requires a content
migration, it'll be called out — re-run the gate after migrating.

---

## The design decisions that govern this repo

The authoritative design decisions (DD-001 … DD-005) are recorded in the project's
documentation. Two you'll meet immediately:

- **DD-001 — Identity model.** Canonical `Person` at `/about#<slug>`; reference by
  `@id` + **named stub** everywhere else; authors are arrays (co-author-safe).
- **DD-005 — Editions & offers.** Primary Book owns the single on-site canonical
  `url`; editions carry `bookFormat`/`isbn` and `offers`, with the retailer link as
  `Offer.url`.

Where a DD and any older doc/scaffold disagree, **the DD wins.**

---

## License

See [LICENSE](LICENSE).
