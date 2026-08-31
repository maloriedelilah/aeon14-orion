# src/overrides/ — selective presentation overrides

This folder is where **you** (the implementer) put customized copies of
components/layouts. It ships empty on purpose — it's an extension point,
not a place with anything active in it yet.

## Why this exists

You'll periodically want to pull upstream improvements:

```
git pull upstream main
```

For that to stay conflict-free, upstream needs to own the base files and you
need to own your changes, with the two never landing in the same file. This
folder — plus the `theme.css` tokens file — is that split:

- **Upstream owns:** everything in `src/` except `src/styles/theme.css` and
  this folder's contents. That includes `src/styles/base.css`,
  `src/components/*`, `src/layouts/*`, and (never touch these) the
  structured-data engine (`src/lib/jsonld.ts`) and the page routes
  (`src/pages/*`).
- **You own:** `src/styles/theme.css` (colors/fonts/spacing — see its own
  header comment) and anything you create under `src/overrides/`.

## How it works: the `@theme/...` alias

Layouts and components that import OTHER components/layouts for
presentation do it through a `@theme/...` specifier instead of a relative
path, e.g. `@theme/components/Header.astro` rather than
`../components/Header.astro`. A small Vite plugin
(`vite-plugins/theme-override.mjs`) resolves that specifier at build time:

1. If `src/overrides/<rel-path>` exists, that file is used.
2. Otherwise, `src/<rel-path>` (the upstream base file) is used.

So to change **only** one component, you create your own copy under
`src/overrides/` at the matching path — you do NOT need to duplicate every
file, only the ones you actually want to change. Everything else keeps
resolving straight through to the untouched upstream file, so a future
`git pull upstream main` only ever touches files you never shadowed.

### Worked example (illustrative only — not an active file)

To override `BookCard`'s markup/behavior without touching the upstream copy:

```sh
mkdir -p src/overrides/components
cp src/components/BookCard.astro src/overrides/components/BookCard.astro
# now edit src/overrides/components/BookCard.astro to taste
```

From that point on, every `@theme/components/BookCard.astro` import in the
codebase resolves to your copy instead of the upstream one — no other file
needs to change, and upstream can keep editing its own `BookCard.astro`
without ever conflicting with yours.

The same mechanism covers layouts: `src/overrides/layouts/Base.astro` would
shadow `src/layouts/Base.astro` in full, if you ever want to restructure the
page shell itself rather than just one component inside it.

> **⚠️ If you shadow `layouts/Base.astro`, you MUST keep its `<JsonLd
> graph={siteGraph} />` render.** `Base.astro` is where the site-wide
> `WebSite` (+ per-page `WebPage`/`CollectionPage`) JSON-LD graph is built
> and rendered — it is the ONE place that structured data is emitted on
> every single page. A full copy under `src/overrides/layouts/Base.astro`
> is free to restructure the `<head>`/`<Header>`/`<Footer>`/chrome markup
> however you like (that's legitimate presentation, and exactly what this
> extension point is for), but if you delete or forget to carry over the
> `<JsonLd .../>` render while editing your copy, every page on the site
> silently stops emitting its site-wide schema.org data — a real, easy
> mistake to make when restructuring a big file, and one `npm run build`
> will NOT catch (it's a valid, buildable page either way). Always re-run
> `npm run validate:ld` / `npm run validate:crossid` after shadowing
> `Base.astro`, same as after any other structured-data-adjacent change.
> More generally: never remove a `<JsonLd .../>` render from ANY shadowed
> presentation file that has one.

## What is deliberately NOT overridable

Two things are excluded from the `@theme` alias on purpose, and always
resolve to the real upstream file no matter what exists in
`src/overrides/`:

- **`src/lib/jsonld.ts`** (and anything that assembles a JSON-LD graph) —
  the structured-data engine. Authors have no opinions on schema.org, and
  shadowing this would risk silently breaking the site's validated
  structured-data contract (`npm run validate:ld` / `validate:crossid`).
- **`src/pages/*`** (page routes) — routing/data-fetching, not presentation.
  Pages themselves are never routed through `@theme`; only the
  components/layouts a page renders can be shadowed.
- **`src/components/JsonLd.astro`** specifically — even though it lives in
  `components/`, it's a thin renderer for the structured-data engine above,
  so `Base.astro` imports it directly rather than through `@theme`.

If you need different structured data for your content, that's a content
question (see `src/content/`), not a presentation one.

## Tokens vs. overrides — which do you actually need?

Most re-theming (colors, fonts, spacing) needs **no file in this folder at
all** — see `src/styles/theme.css` instead, which is the Tier 1 mechanism
and covers the large majority of "make it look like mine" requests. Reach
for `src/overrides/` when you need to change a component's actual markup,
structure, or behavior, not just its colors/fonts/spacing.
