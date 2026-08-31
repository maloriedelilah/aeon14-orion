# Page audit — inline presentation in `src/pages/*` (2026-07-27)

**Status: report only. Nothing in this document has been acted on beyond the
one extraction (SeriesTeaser) called out explicitly below and already done in
this same PR.** Tier 3 (`src/pages/*`) is deliberately excluded from the
`@theme` alias on the theory that page files stay thin — data-fetch plus
component composition, with any real presentational layout living in a
`@theme`-reachable component instead. This is a sweep of every page file to
find where that theory doesn't currently hold, so each spot can be triaged
case-by-case rather than guessed at in bulk.

For each file: what inline presentational markup (if any) it carries, and a
recommendation. "Extract" means: pull the markup into a new `src/components/`
file, import it via `@theme/components/...`, and leave the page with only
data-fetch + composition (the SeriesTeaser pattern, see below). "Leave"
means the markup is either trivial or genuinely page-specific (see the
per-file reasoning) and forcing it into a shared component would add
indirection without a real theming payoff.

---

## Done in this PR

### `src/pages/index.astro` — Series section → extracted ✅

**Was:** an inline `<section aria-label="Series">` block — per-series card
(title + description + member-book list with pre-order badges) plus a
decorative overlapping 3-cover "fan" (`series-covers-stack` / `stacked-cover`).
No shadow point existed for it; an implementer could only change it by editing
`index.astro` directly (fighting every upstream pull) or losing the change on
the next merge.

**Recommendation:** extract. **Done** — see `src/components/SeriesTeaser.astro`,
imported via `@theme/components/SeriesTeaser.astro`. `index.astro` now only
computes `seriesWithBooks` (with an `isUpcoming` flag precomputed per book,
so the component carries no date logic) and passes it as the `entries` prop.
Confirmed byte-for-byte identical `dist/client/index.html` before/after (not
just whitespace-equivalent) — see PR body / commit message for the diff
result. index.astro has no JSON-LD of its own (DD-001: Base.astro carries the
sitewide WebSite graph), so there was no structured-data entanglement to
worry about here at all.

---

## Findings — no action taken, for discussion

### `src/pages/about.astro` — per-author "author card" — candidate for extraction

Inline markup: for each author, a `<div class="author-card">` with photo,
truncated-free full bio, and a `sameAs` link list. Structurally the same
shape as the exact section just extracted from the homepage (the homepage's
own "About the author" block reuses these same `author-card`/`author-photo`/
`author-card-body` classes, just with a truncated bio and a single author
instead of all of them).

Not entangled with JSON-LD: the page's `pageGraph` (built from `authorNode`)
is assembled entirely separately from this markup, from the same `authors`
array — extracting the markup into e.g. `AuthorCard.astro` would not touch
structured-data assembly at all.

**Recommendation:** genuine extraction candidate — likely worth doing as a
follow-up, since it would also let the homepage's own author-card block (in
`index.astro`, still inline — see below) share the same component instead of
two near-duplicate markup blocks living in two different Tier-3 pages. Not
done in this PR per Architect's "decide case-by-case, don't auto-extract
beyond SeriesTeaser" instruction.

### `src/pages/index.astro` — "About the author" section — candidate for extraction (paired with the above)

Inline markup: photo + truncated bio + "More about X" link, in a
`.author-card` wrapper. Same classes/shape as `about.astro`'s per-author
card, just single-author and pre-truncated. Flagging this alongside
`about.astro` rather than as its own separate case, since a shared
`AuthorCard` component (parameterized on `bio` text and whether to show the
"More about" link) would cover both call sites at once rather than being
extracted twice independently.

**Recommendation:** extraction candidate, paired with `about.astro` above —
same reasoning, not done in this PR (scope was SeriesTeaser only).

### `src/pages/books/[slug].astro` — the book-detail "book card" — flag as page-specific, do NOT extract as-is

Inline markup: the whole `.book-card` layout (cover image + release-date
line, title + pre-order badge, subtitle, series-position line, description,
byline, and a "Get the book" editions list), plus a separate "Featured in"
hubs list below it.

This is the single largest inline block in any page file, but recommend
**against** extracting it wholesale: it's tightly interleaved with per-field
conditionals that are specific to what a *book* is (pre-order badge tied to
`isFutureRelease`, series-position line only when `series &&
seriesPosition != null`, edition price/currency formatting) rather than a
reusable layout shape shared with any other page. Unlike SeriesTeaser (which
had a near-identical twin nowhere else) or the author-card (which has two
near-identical call sites right now), this markup has no sibling to share
with — `series/[slug].astro`'s own header block is structurally different
(no editions list, no pre-order badge, no byline-with-Get-the-book pattern).
Extracting it into a component would mostly just relocate the same
book-detail-specific logic one file over, without giving an implementer
anything they couldn't already reach by overriding the smaller pieces that
already exist (`CompsBlock`, `BookListItem` elsewhere). If a real
implementer migration hits a wall here (wanting to reskin the book-card
layout specifically without touching the page), that would be the trigger to
revisit — not this audit alone.

**Recommendation:** leave as page-specific composition. Revisit only if a
real migration surfaces a concrete need to override this specific layout.

### `src/pages/series/[slug].astro` — series header block — minor, low-priority candidate

Inline markup: `<h1>` + optional cover image + description + byline, above
the (already-delegated-to-`BookListItem`) member-book list. Small — four
lines — and structurally close to (but not identical to) the truncated
author-card shape elsewhere (no photo, no "more about" link, different
tag structure). Low value to extract on its own.

**Recommendation:** leave. Small enough that extraction would add an import +
a props interface for four lines of markup with no reuse target; revisit only
if it grows or a real duplicate shape appears elsewhere.

### `src/pages/series/index.astro` — per-series "listing card" — distinct from SeriesTeaser, minor candidate

Inline markup: per series, a `<section class="card">` with `h2` (linked
title) + description, wrapping a `<ul class="book-thumb-list">` of
`BookListItem`s. **Not a duplicate of the homepage's SeriesTeaser** — this
page already delegates the actual book rendering to `BookListItem`, and has
no cover-fan decoration; it's a plain listing-page card, structurally closer
to `about.astro`'s per-author section wrapper (`aria-labelledby` + `h2`) than
to SeriesTeaser's cover-fan card. The remaining inline markup (the card
wrapper + heading + description paragraph) is thin.

**Recommendation:** leave as-is for now; low value in isolation. Worth
reconsidering only as part of a broader "listing-card wrapper" pass if
similar wrapper markup keeps appearing (it does not currently exist anywhere
else in exactly this shape).

### `src/pages/events/index.astro` — event list item — minor, low-priority candidate

Inline markup: a `<li>` per event with name, formatted `<time>`, optional
location, description, optional external link. Thin, single call site, no
duplicate shape elsewhere in the codebase (Tier 1 has no per-event detail
page).

**Recommendation:** leave. Not worth a component for a single-use, four-field
list item; revisit only if a per-event detail page is ever added (Tier 2+).

### `src/pages/themes/[slug].astro` — book list — trivial, no action

Inline markup: a bare `<ol>` of `<li><a>` book links. About as thin as
presentational markup gets.

**Recommendation:** leave. Nothing here to extract.

### `src/pages/404.astro`, `src/pages/contact.astro`, `src/pages/privacy.astro`, `src/pages/terms.astro` — already clean

No undelegated inline presentation found. `contact.astro` already delegates
to `@theme/components/ContactForm.astro`; `privacy.astro`/`terms.astro` render
Markdown content collections through `<Content />` with only a one-line date
stamp around it; `404.astro` is a few lines of static copy. Nothing to do.

---

## Summary table

| Page | Inline presentation found | Recommendation |
|---|---|---|
| `index.astro` (Series section) | yes | **extracted this PR** (`SeriesTeaser.astro`) |
| `about.astro` (author card) | yes | candidate — pair with index.astro's author-card below |
| `index.astro` (About-the-author section) | yes | candidate — pair with `about.astro` above |
| `books/[slug].astro` (book card) | yes, large | leave — page-specific, no sibling shape |
| `series/[slug].astro` (header block) | yes, small | leave — too thin to be worth it alone |
| `series/index.astro` (listing card) | yes, small | leave — distinct from SeriesTeaser, low value alone |
| `events/index.astro` (list item) | yes, small | leave — single call site, no duplicate |
| `themes/[slug].astro` (book list) | yes, trivial | leave |
| `404.astro`, `contact.astro`, `privacy.astro`, `terms.astro` | no | clean |
