// The single seam between the two tiers. Templates + JSON-LD depend ONLY on this.
// Tier 1 implements it with astro:content (FileSource). Tier 2 implements it with D1 (D1Source).
//
// Identity spine (DD-001): author identity is per-book/per-series (co-author-safe,
// hence the *Slugs arrays below), never a hardcoded sitewide singleton. Each Author's
// canonical full node lives once at its own home (the /about page); everywhere else
// it is referenced by @id + slug. `slug` on Author drives that canonical @id.
export interface Author { slug: string; name: string; bio: string; url: string; sameAs: string[]; photo?: string; alternateName?: string[]; email?: string; }
export interface Edition { format: string; isbn?: string; asin?: string; sku?: string; retailer: string; url: string; price?: string; currency: string; }
export interface Comp { name: string; hook: string; sameAs?: string[]; }
export interface Book { title: string; subtitle?: string; slug: string; description: string; cover: string; datePublished: Date; language: string; genres: string[]; editions: Edition[]; comps: Comp[]; authorSlugs: string[]; seriesSlug?: string; seriesPosition?: number; }
export interface Series { name: string; slug: string; description: string; cover?: string; comps: Comp[]; authorSlugs: string[]; }
export interface Hub { name: string; slug: string; description: string; about: { term: string; sameAs?: string }[]; bookSlugs: string[]; comps: Comp[]; }
export interface EventItem { name: string; slug: string; description: string; startDate: Date; endDate?: Date; location?: string; url?: string; eventAttendanceMode: string; }

export interface ContentSource {
  getAuthors(): Promise<Author[]>;
  getAuthorBySlug(slug: string): Promise<Author | undefined>;
  getBooks(): Promise<Book[]>;
  getBook(slug: string): Promise<Book | undefined>;
  getSeries(): Promise<Series[]>;
  getSeriesBySlug(slug: string): Promise<Series | undefined>;
  getHubs(): Promise<Hub[]>;
  getHub(slug: string): Promise<Hub | undefined>;
  getEvents(): Promise<EventItem[]>;
}
