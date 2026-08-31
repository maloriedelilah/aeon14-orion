// Builds schema.org JSON-LD as ONE @graph with stable @ids so entities cross-reference
// instead of duplicating. Derived from ContentSource -> can't drift from visible content.
//
// Identity spine (DD-001): every entity has ONE canonical @id anchored to its own
// home page, where its FULL node is defined exactly once. Everywhere else it is
// referenced by that @id PLUS a minimal named stub (namedStub) — never a bare @id
// (which dangles the moment the referencing page doesn't also happen to supply the
// full node) and never a re-inlined full node (which would duplicate + drift).
import type { Author, Book, Series, Hub, EventItem } from './ContentSource';
import { isFutureRelease } from './date';

const SITE = (path = '') => new URL(path, import.meta.env.SITE).toString();

// Absolute URL to a page's OWN canonical location — trailing-slash-normalized.
// Astro's static build emits directory-style output (`/foo/index.html`), and
// Cloudflare Pages serves that at `/foo/` while 308-redirecting the
// slash-less `/foo` to it (verified against Cloudflare's own docs — this is
// their documented, non-optional behavior for this build layout, not a
// config choice we made). So `/foo` is NOT this site's real, final URL for
// that page; `/foo/` is. Every @id/url built off a page's own path uses this,
// so JSON-LD never asserts a URL that immediately redirects elsewhere —
// which is exactly what `<link rel="canonical">` (Astro.url, already
// trailing-slash-correct) resolves to, keeping the two in agreement.
//
// Exported so page templates can build BreadcrumbList item URLs off the same
// single source of truth (trailing-slash-normalized, absolute) rather than
// re-deriving their own — see breadcrumbNode() below.
export const pageUrl = (path: string) => SITE(path.endsWith('/') ? path : `${path}/`);

// Absolute URL for an image field. Covers/photos are stored as root-relative
// paths (see FileSource.ts) — fine for an <img src> (resolves against the
// PAGE), but schema.org/Google require ImageObject/image URLs to be
// ABSOLUTE, since a consumer reading JSON-LD out of context (a feed, an
// API response) has no page to resolve a relative path against.
const absImage = (src?: string) => (src ? SITE(src) : undefined);

// Per-author, About-anchored — the About page is the canonical Person home (DD-001).
export const authorId = (slug: string) => `${pageUrl('/about')}#${slug}`;
export const bookId = (slug: string) => `${pageUrl(`/books/${slug}`)}#book`;
export const seriesId = (slug: string) => `${pageUrl(`/series/${slug}`)}#series`;
// Route is /themes/<slug> (see src/pages/themes/[slug].astro) even though the
// content collection + TS type are named "Hub" — matches the live aeon14.com
// URL convention per that page's own comment. Added 2026-07-23 alongside
// wiring Book -> Hub cross-links; hubGraph() previously emitted no @id at all
// (nothing referenced a hub from elsewhere yet, so it went unnoticed).
export const hubId = (slug: string) => `${pageUrl(`/themes/${slug}`)}#hub`;

// Minimal cross-reference: `{@type, @id, name}`. Just enough that the page's JSON-LD
// is valid + useful STANDALONE, while the shared @id unifies with the full node at
// its canonical home for a consumer that reads the whole site. Used for every
// reference site (WebSite.publisher, Book.author, Series.author, ...) — never a bare @id.
export function namedStub(id: string, name: string, type = 'Person') {
  return { '@type': type, '@id': id, name };
}

// FULL Person node — emitted EXACTLY ONCE, on the About page (each author/co-author's
// canonical home per DD-001). Every other reference site uses namedStub(authorId(slug), name)
// instead of calling this again.
export function authorNode(a: Author) {
  return { '@type': 'Person', '@id': authorId(a.slug), name: a.name,
    alternateName: a.alternateName, description: a.bio,
    // Person.url is the About page (DD-001's own canonical Person home),
    // NOT the author-authored content field of the same name (fixed
    // 2026-07-23). That field is a bare site-root URL with no trailing
    // slash in practice and is never rendered anywhere on the site itself
    // (checked: about.astro only renders `sameAs`) -- it was doing nothing
    // but duplicating, and disagreeing on trailing slash with, the one
    // value that already has a real job: this Person's own canonical page.
    // Deriving it here instead means it can never drift from @id's own
    // page again, on this site or any fork of it.
    url: pageUrl('/about'),
    image: absImage(a.photo), sameAs: a.sameAs };
}

export function bookNode(
  b: Book,
  opts: {
    series?: { slug: string; name: string };
    authors: { slug: string; name: string }[];
    // Themed hub(s) this book is a member of (Hub.books includes it) — the
    // reverse direction of hubGraph's mainEntity ItemList, which already
    // lists this book from the HUB's side. Optional + defaults to none so
    // every existing call site (and any book in no hub) is unaffected.
    hubs?: { slug: string; name: string }[];
  },
) {
  // isPartOf is multi-valued here: a book can simultaneously be part of its
  // BookSeries AND any number of themed hubs (CollectionPage) — schema.org's
  // isPartOf is not cardinality-limited to one, and reusing it (rather than
  // inventing a new ad hoc property) keeps this on standard vocabulary. Named
  // stubs only (DD-001) — never a bare @id, never the full node re-inlined.
  // Always emitted as an ARRAY when non-empty (never a bare single object)
  // so a consumer never has to branch on shape depending on how many a book
  // happens to have.
  const isPartOf = [
    ...(opts.series ? [namedStub(seriesId(opts.series.slug), opts.series.name, 'BookSeries')] : []),
    ...(opts.hubs ?? []).map((h) => namedStub(hubId(h.slug), h.name, 'CollectionPage')),
  ];
  return { '@type': 'Book', '@id': bookId(b.slug), name: b.title,
    // DD-005/#3: the primary Book owns the single on-site CANONICAL url (its own
    // page). Editions do NOT carry url — their retailer buy-links live in Offer.url.
    url: pageUrl(`/books/${b.slug}`),
    ...(b.subtitle ? { alternateName: b.subtitle } : {}),
    // Co-author-safe: an ARRAY of named stubs, one per author (DD-001) — never a
    // bare @id, never the full Person node re-inlined here.
    author: opts.authors.map((a) => namedStub(authorId(a.slug), a.name)),
    description: b.description,
    inLanguage: b.language, datePublished: b.datePublished.toISOString().slice(0, 10),
    genre: b.genres, image: absImage(b.cover),
    // NOTE: deliberately does NOT carry `position` here (fixed 2026-07-23).
    // `position` is only a valid property of `ListItem` in schema.org's
    // vocabulary (confirmed against schema.org/ListItem) — Book has no such
    // property, so putting it directly on the Book node is invalid structured
    // data that a strict validator flags. The book's position within its
    // series is instead expressed validly via seriesReadingOrder()'s
    // ItemList/ListItem, emitted once on the series' own page.
    ...(isPartOf.length > 0 ? { isPartOf } : {}),
    workExample: b.editions.map((e) => ({ '@type': 'Book', bookFormat: e.format,
      // isbn lives on the Book/workExample node — schema.org/Book has its own
      // native `isbn` property. asin/sku do NOT belong here (fixed
      // 2026-07-23): schema.org/asin's domain is Demand/Offer/Product, never
      // CreativeWork/Book, and `sku` is likewise an Offer/Product property —
      // both are emitted on the `offers` node below instead. Previously asin
      // was defined in the content schema and authored in real content
      // (the-ember-horizon's ebook/audiobook editions) but never actually
      // reached the JSON-LD at all — this was a real, live silent-drop bug,
      // not just a missing feature.
      isbn: e.isbn, potentialAction: undefined,
      // Preorder support: derived from datePublished, never a separate field
      // (see isFutureRelease's doc comment in lib/date.ts) — a future-dated
      // book automatically emits PreOrder here and flips to InStock on its
      // own the moment the site rebuilds after that date passes.
      offers: { '@type': 'Offer', url: e.url, price: e.price, priceCurrency: e.currency,
        ...(e.asin ? { asin: e.asin } : {}),
        ...(e.sku ? { sku: e.sku } : {}),
        availability: isFutureRelease(b.datePublished)
          ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
        // availabilityStarts: the OFFER's own availability window, distinct
        // from Book.datePublished even though the two values are equal for
        // a preorder (added 2026-07-23, reviewer finding). schema.org scopes
        // this to the Offer, not the Book — it answers "when does THIS
        // purchase channel become available for delivery", which a shopping
        // consumer (Google Merchant's own required `availability_date`
        // attribute for preorder/backorder listings maps directly to this)
        // checks on the Offer itself rather than inferring from the work's
        // own publication date. Only emitted while the offer is actually a
        // preorder — once isFutureRelease flips false on rebuild, this key
        // is correctly absent (an already-available Offer has no future
        // "start" left to declare).
        ...(isFutureRelease(b.datePublished)
          ? { availabilityStarts: b.datePublished.toISOString().slice(0, 10) } : {}) } })) };
}

export function seriesNode(
  s: Series,
  members: { id: string; name: string }[],
  authors: { slug: string; name: string }[],
) {
  return { '@type': 'BookSeries', '@id': seriesId(s.slug), name: s.name,
    description: s.description,
    author: authors.map((a) => namedStub(authorId(a.slug), a.name)),
    // Named stubs (DD-001), not bare @ids — resolves standalone even for a
    // consumer that only fetches this one page's graph. Order within `hasPart`
    // is NOT sufficient to convey reading order on its own (schema.org's own
    // guidance on itemListElement: markup order alone isn't reliable) — that's
    // the job of seriesReadingOrder() below, a separate node.
    hasPart: members.map((m) => namedStub(m.id, m.name, 'Book')) };
}

// Reading-order ItemList — the VALID home for "book N in this series", instead
// of an invalid `position` directly on a Book node (fixed 2026-07-23: Book has
// no such property; `position` only exists on ListItem per schema.org). Mirrors
// hubGraph's mainEntity ItemList below exactly — same working pattern, reused
// rather than inventing a second convention. Emitted once, alongside
// seriesNode(), on the series' own page. Books with no seriesPosition set are
// filtered out rather than guessing a position for them.
export function seriesReadingOrder(
  s: Series,
  members: { id: string; name: string; position?: number | null }[],
) {
  return { '@type': 'ItemList', '@id': `${seriesId(s.slug)}-reading-order`,
    name: `${s.name} reading order`, numberOfItems: members.length,
    itemListElement: members
      .filter((m) => m.position != null)
      .map((m) => ({ '@type': 'ListItem', position: m.position, item: namedStub(m.id, m.name, 'Book') })) };
}

// BreadcrumbList — position is VALID here (it's ListItem's own property,
// unlike the old invalid usage directly on Book). `url` is omitted on the
// last crumb (the current page) per Google's own BreadcrumbList examples —
// the current page doesn't need to link to itself. Emit this alongside a
// MATCHING visible breadcrumb trail (Base.astro's `breadcrumbs` slot) on any
// page with real hierarchy — a BreadcrumbList that disagrees with what a
// visitor actually sees is its own kind of contradiction (same family of bug
// as the WebSite/WebPage name issue fixed in PR #26).
export function breadcrumbNode(items: { name: string; url?: string }[]) {
  return { '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name,
      ...(it.url ? { item: it.url } : {}) })) };
}

// Hub = CollectionPage.about[DefinedTerm] + mainEntity: ItemList of positioned books.
// Confirmed from live aeon14.com/themes pattern.
// members carry {id, name} so each ItemList entry emits a NAMED STUB (@type+@id+
// name), never a bare @id — DD-001: the reference must resolve standalone on this
// page (the full Book node lives once on its own /books/<slug> page).
//
// NOTE (fixed 2026-07-23): this used to return a STANDALONE full node
// (@type/@id/url/name/description + about/mainEntity) — but Base.astro
// ALSO emits a generic WebPage node for every page, with its OWN @id, for
// the SAME url, asserting the SAME name/description. That's two page
// entities contradicting/duplicating each other for one URL — the exact
// same bug class as the old WebSite-name issue, just relocated onto
// CollectionPage (which IS-A WebPage in schema.org's own hierarchy, so it's
// not even two different kinds of thing, just two competing nodes for one).
// Fix: a hub page's own node is now Base.astro's per-page node, TYPED as
// CollectionPage instead of the WebPage default (via its `pageType`/`pageId`
// props — `pageId` passed as this exact hubId() so the @id book pages already
// reference via bookNode()'s isPartOf keeps working unchanged). This
// function now returns ONLY the CollectionPage-specific extra properties
// (about, mainEntity) to be merged onto that single shared node — see
// themes/[slug].astro.
export function hubPageExtra(h: Hub, members: { id: string; name: string }[]) {
  return {
    about: h.about.map((t) => ({ '@type': 'DefinedTerm', name: t.term, sameAs: t.sameAs })),
    mainEntity: { '@type': 'ItemList', numberOfItems: members.length,
      itemListElement: members.map((m, i) => ({ '@type': 'ListItem',
        position: i + 1, item: namedStub(m.id, m.name, 'Book') })) },
  };
}

// Events currently have no standalone per-event page (Tier-1 scope: one listing
// page at /events), so each Event's canonical @id is anchored to that listing
// page rather than its own route — same "one canonical home" discipline as the
// other builders (DD-001), just with a shared home instead of a per-entity one.
export const eventId = (slug: string) => `${pageUrl('/events')}#${slug}`;

// FULL Event node. location is a plain string on EventItem (no separate content
// collection to key a Place off of), so it is embedded directly. If a future
// revision adds an organizer/performer Person reference, it MUST use
// namedStub(authorId(slug), name) — never a bare @id or a second full Person node.
export function eventNode(e: EventItem) {
  return { '@type': 'Event', '@id': eventId(e.slug), name: e.name,
    description: e.description,
    startDate: e.startDate.toISOString(),
    ...(e.endDate ? { endDate: e.endDate.toISOString() } : {}),
    ...(e.location ? { location: { '@type': 'Place', name: e.location } } : {}),
    ...(e.url ? { url: e.url } : {}),
    eventAttendanceMode: `https://schema.org/${
      e.eventAttendanceMode === 'online' ? 'OnlineEventAttendanceMode'
        : e.eventAttendanceMode === 'mixed' ? 'MixedEventAttendanceMode'
          : 'OfflineEventAttendanceMode'
    }` };
}

export function graph(nodes: unknown[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}
