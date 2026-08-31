import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

const edition = z.object({
  format: z.enum(['ebook', 'paperback', 'hardcover', 'audiobook']),
  isbn: z.string().optional(),
  asin: z.string().optional(),
  // Catch-all for retailers that use neither ISBN nor ASIN (Kobo, Apple
  // Books, Google Play, direct-sale/D2D-style storefronts each mint their
  // own store-specific product id). Maps to schema.org's own generic
  // Offer.sku — the standard "merchant-specific identifier" property.
  sku: z.string().optional(),
  retailer: z.string(),          // e.g. 'Amazon', 'Kobo', 'Apple Books'
  url: z.string().url(),          // buy link lives on the EDITION, not the work
  // REQUIRED, not optional. schema.org/Offer needs BOTH `price` and
  // `priceCurrency` to be eligible for Google Merchant/Shopping rich results —
  // a missing price still builds a structurally-valid Offer node, so nothing
  // upstream would ever catch it. This regex also rules out the other silent
  // failure mode: a price string that LOOKS filled in but isn't machine-usable
  // (currency symbols, commas, trailing text) — plain decimal only, e.g. "17.99".
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'price must be a plain decimal number as a string, e.g. "17.99" (no currency symbols or commas)'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code, e.g. "USD"').default('USD'),
}).refine(
  // Every edition needs AT LEAST ONE canonical identifier. Without one, its
  // Offer/workExample node has no stable id a shopping/answer-engine
  // consumer can use to match "this exact edition" across sources — the
  // same silent-hole shape as the missing-price bug (structurally valid
  // JSON-LD, just useless for the thing it exists to enable). Deliberately
  // NOT requiring isbn specifically: many indie ebook editions (KDP-only,
  // no print run) never get assigned an ISBN at all — asin (Amazon) or sku
  // (any other storefront's own product id) are equally valid canonical
  // identifiers for THAT edition. Reviewer finding 2026-07-23: ebook
  // editions in particular were shipping with none of the three set.
  (e) => Boolean(e.isbn || e.asin || e.sku),
  { message: 'edition needs at least one canonical identifier (isbn, asin, or sku) — an ebook with no ISBN should set asin (Amazon/KDP) or sku (any other storefront\'s own product id) instead of shipping with none' },
);

const comp = z.object({
  name: z.string(),
  // REQUIRED descriptive hook — never a bare name. Discipline borrowed from the
  // Andromeda GEO comp skill, but note THIS is public answer-engine JSON-LD.
  hook: z.string().min(20, 'Comps need a descriptive hook, not a bare name.'),
  sameAs: z.array(z.string().url()).optional(), // Wikidata/Goodreads to disambiguate the real entity
});

const author = defineCollection({
  loader: glob({ pattern: '**/*.{md,yaml}', base: './src/content/author' }),
  schema: ({ image }) => z.object({
    slug: z.string(), // drives the canonical @id ({site}/about#slug) — DD-001
    name: z.string(),
    alternateName: z.array(z.string()).optional(),
    bio: z.string(),
    photo: image().optional(),
    url: z.string().url(),
    sameAs: z.array(z.string().url()).default([]), // socials, Wikidata, Goodreads author page
    email: z.string().email().optional(),
  }),
});

const books = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/books' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    slug: z.string(),
    description: z.string().min(1),      // required — the blurb
    cover: image(),                       // required — no book ships coverless
    authors: z.array(reference('author')).min(1), // co-author-safe — DD-001
    series: reference('series').optional(),
    // MUST be a whole number. schema.org/ListItem's `position` (the valid home
    // for "book N in this series" -- see jsonld.ts's seriesReadingOrder()) is
    // typed Integer-or-Text; a fractional placeholder like 0.5 for "this is a
    // prequel" produces a value no ordering consumer can actually use for
    // sequence, and is exactly the kind of thing that can silently invalidate
    // the whole ItemList in a strict validator. If a book reads BEFORE the
    // series' book 1, give it position 0 (schema.org places no floor at 1;
    // 0 < 1 already expresses "comes first" without renumbering every other
    // book in the series) rather than inventing a fractional slot.
    seriesPosition: z.number().int('seriesPosition must be a whole number (e.g. 0 for a prequel that reads before book 1) -- fractional values like 0.5 are not valid ListItem.position values').optional(),
    datePublished: z.coerce.date(),
    language: z.string().default('en'),
    genres: z.array(z.string()).default([]),
    editions: z.array(edition).min(1),   // required — at least one buy link
    comps: z.array(comp).default([]),     // inline only; rendered on the book page
  }),
});

const series = defineCollection({
  loader: glob({ pattern: '**/*.{md,yaml}', base: './src/content/series' }),
  schema: ({ image }) => z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    cover: image().optional(),
    authors: z.array(reference('author')).min(1), // co-author-safe — DD-001
    // book membership + order derived from books' series/seriesPosition (isPartOf/hasPart)
    comps: z.array(comp).default([]),
  }),
});

const hubs = defineCollection({
  loader: glob({ pattern: '**/*.{md,yaml}', base: './src/content/hubs' }),
  schema: () => z.object({
    name: z.string(),                     // e.g. 'Human-AI Partnership'
    slug: z.string(),
    description: z.string(),
    // DefinedTerm(s) this hub is ABOUT — becomes CollectionPage.about
    about: z.array(z.object({ term: z.string(), sameAs: z.string().url().optional() })).min(1),
    // ordered book membership -> mainEntity: ItemList of positioned entries
    books: z.array(reference('books')).min(1),
    comps: z.array(comp).default([]),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: '**/*.{md,yaml}', base: './src/content/events' }),
  schema: () => z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    location: z.string().optional(),
    url: z.string().url().optional(),
    eventAttendanceMode: z.enum(['online', 'offline', 'mixed']).default('offline'),
  }),
});

// Site-chrome legal pages (Privacy Policy, Terms of Use). These carry no
// schema.org identity of their own (no JSON-LD emitted) — they're plain
// long-form content, validated the same way as everything else (Zod) so a
// missing `updated` date fails the build loudly rather than shipping silently
// stale. `slug` must be 'privacy' or 'terms' — those are the only two routes
// that read this collection (src/pages/privacy.astro, src/pages/terms.astro).
const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: () => z.object({
    title: z.string(),
    slug: z.enum(['privacy', 'terms']),
    updated: z.coerce.date(),
  }),
});

export const collections = { author, books, series, hubs, events, legal };
