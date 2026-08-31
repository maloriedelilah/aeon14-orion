// Small text-shaping helpers shared by listing pages (series index, series
// detail) that show many books at once and need a SHORT blurb + a "more" link
// to the book's own page, rather than the book's full description inline.
//
// Word-based (not character-based) so we never cut mid-word and the truncation
// point is stable across languages that don't use fixed-width characters.
export function truncateWords(text: string, maxWords = 70): { text: string; truncated: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return { text, truncated: false };
  }
  return { text: `${words.slice(0, maxWords).join(' ')}…`, truncated: true };
}
