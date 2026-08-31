// Small date-display helper. Content dates (`datePublished`) are authored as
// plain "YYYY-MM-DD" strings and coerced to Date via z.coerce.date() in
// content.config.ts, which parses them as UTC midnight. Formatting with the
// runtime's LOCAL timezone (the default for toLocaleDateString/Intl without an
// explicit timeZone) can therefore roll the displayed date back a day for
// anyone building or viewing west of UTC — so this always formats in UTC to
// match the authored calendar date exactly, regardless of build/viewer TZ.
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

// Single source of truth for "is this a preorder" across the whole site: a
// book with a `datePublished` in the future IS a preorder, full stop — no
// separate boolean field to keep in sync in content.config.ts. This drives
// three independent things that must never drift from each other:
//   1. jsonld.ts's Offer.availability (PreOrder vs InStock)
//   2. the homepage's Latest release / Coming soon split + hero slideshow
//   3. the PRE-ORDER badge on series listings (BookListItem) and book detail
// Once the authored date passes and the site rebuilds, a book automatically
// flips to "released" everywhere at once — no manual toggle to remember.
export function isFutureRelease(date: Date, now: Date = new Date()): boolean {
  return date.getTime() > now.getTime();
}
