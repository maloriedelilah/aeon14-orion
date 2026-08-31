# Theming & the override system

This is the full picture of how to make an author-geo site look and feel
like *yours* — from a quick palette swap to restructuring a whole layout —
without ever touching, forking, or fighting the upstream engine on your next
`git pull upstream main`.

There are **three tiers**, each a bigger hammer than the last. Reach for the
smallest one that does the job:

| Tier | What it's for | What you touch |
|---|---|---|
| **1. Tokens** | Recolor / refont / respace the whole site | `src/styles/theme.css` only |
| **2. Selective override** | Change one component or layout's actual markup/behavior | a copy under `src/overrides/` |
| **2b. Free-form CSS** | Structural/layout CSS that isn't a token and doesn't belong in a shadowed component | `src/overrides/styles/site.css` (optional) |
| **3. Hard boundary** | The structured-data contract | **never** — not overridable, by design |

### The CSS load order, explicitly

`Base.astro` imports exactly three stylesheets, always in this order:

1. **`src/styles/base.css`** — Tier 3, upstream-owned, structural/layout CSS.
   Never edit this directly (see its own header comment) — it's the one CSS
   file with no shadow/override point at all, by design, so upstream can
   keep improving it with zero conflict risk.
2. **`src/styles/theme.css`** — Tier 1, implementer-owned, **tokens only**
   (`:root`/`:root[data-theme=...]` custom-property declarations, nothing
   else — see its own header comment).
3. **`src/overrides/styles/site.css`** — Tier 2b, implementer-owned,
   **free-form**, **optional**. Loads only if you create it; if you don't,
   the import resolves to an empty stub and contributes nothing (see below).

Cascade order means each later file's declarations win over the earlier
ones' for the same property/selector — theme.css's tokens win over base.css's
defaults, and a Tier 2b override (if present) wins over both.

---

## Tier 1 — Tokens (`src/styles/theme.css`)

This is the mechanism that covers the large majority of "make it look like
mine" requests, and needs **no new files at all**.

`src/styles/theme.css` contains, and should only ever contain, `:root`
custom-property (CSS variable) declarations — the two built-in palettes,
`:root[data-theme="dark"]` and `:root[data-theme="light"]`, each defining the
same eight tokens (`--bg`, `--bg-elevated`, `--text`, `--text-muted`,
`--accent`, `--accent-contrast`, `--border`, `--shadow`). `Base.astro` sets
`data-theme` on `<html>` from `siteConfig.theme.mode` (`src/config.ts`), so
whichever palette block matches wins.

One token isn't theme-dependent and lives in a plain `:root { }` block
instead (same value regardless of `data-theme`): **`--font-heading`** — the
`h1`–`h4` heading font stack, consumed by `base.css`. Any token whose value
shouldn't differ between palettes belongs in that plain `:root { }` block
rather than being duplicated into both `[data-theme=...]` blocks.

**To recolor/refont/respace the site:** edit the values inside the relevant
`:root[data-theme="..."] { ... }` block directly. That's it — no component
file anywhere references a color/spacing literal; every one of them reads a
`var(--token)` defined here, so changing the value here changes it
everywhere at once.

Why this is conflict-free on `git pull upstream main`: `src/styles/base.css`
(upstream-owned — structural/layout CSS, `var()`-*consuming* only, never
`var()`-*defining*) is imported **first**; `theme.css` (yours) is imported
**last**. Cascade order means any token you redeclare in `theme.css` always
wins over whatever `base.css` assumes as a default — you never need to edit
`base.css` to retheme, so upstream can keep improving `base.css` and you can
keep editing `theme.css`, and the two files never touch each other.

See the main [README's Theming guide](./README.md#theming-guide) for the
full variable reference table, adding a third palette, and changing fonts.

---

## Tier 2 — Selective override (`src/overrides/`)

Reach for this when Tier 1 isn't enough — you need to change a component's
actual **markup, structure, or behavior**, not just its colors/fonts/spacing.

### The mechanism: the `@theme/...` import alias

Layouts and components that import *other* components/layouts for
presentation do it through a `@theme/...` specifier instead of a relative
path — e.g. `import Header from '@theme/components/Header.astro'` rather
than `'../components/Header.astro'`. A small Vite plugin
(`vite-plugins/theme-override.mjs`) resolves that specifier at build time:

1. If `src/overrides/<rel-path>` exists, **that file** is used.
2. Otherwise, `src/<rel-path>` (the upstream base file) is used.

So overriding is genuinely *selective*: you only ever create a shadow copy
for the ONE file you actually want to change. Every other `@theme/...`
import in the codebase keeps resolving straight through to its untouched
upstream file — so a later `git pull upstream main` only ever touches files
you never shadowed, and can never conflict with a file you did shadow
(upstream's copy lives at `src/<rel>`; yours lives at
`src/overrides/<rel>` — two different paths, never the same file).

### Worked example

To override just `Header.astro`'s markup:

```sh
mkdir -p src/overrides/components
cp src/components/Header.astro src/overrides/components/Header.astro
# now edit src/overrides/components/Header.astro to taste
```

From that point on, every `@theme/components/Header.astro` import in the
codebase resolves to your copy — nothing else needs to change, and upstream
can keep editing its own `Header.astro` without ever conflicting with yours.

The same mechanism covers layouts in full: `src/overrides/layouts/Base.astro`
shadows `src/layouts/Base.astro` entirely, if you want to restructure the
whole page shell (head/header/footer wrapper) rather than just one component
inside it. **If you do this, see the safety warning in the next section —
it is the one thing you must not drop.**

This is the same mechanism `ContactForm.astro` (`/contact`) and
`SubscribeForm.astro` (home page) are already routed through — both are
imported as `@theme/components/{Contact,Subscribe}Form.astro`, so restyling
or restructuring either one's markup (e.g. reordering fields, changing the
honeypot approach, adding a consent checkbox) is the exact same
copy-to-`src/overrides/components/`-and-edit workflow as the `Header.astro`
example above. Their actual submit behavior (which endpoint they POST to,
anti-spam checks, provider wiring) lives server-side in
`src/pages/api/{contact,subscribe}.ts` and `src/lib/{email,leads}/` — see
[NEWSLETTER.md](./NEWSLETTER.md) and the README's Contact form section for
that side of things. Shadowing the component doesn't touch the endpoint,
and vice versa — the two are independent seams by design.

Full contract (what's aliasable, what a shadow file needs to preserve) lives
in [`src/overrides/README.md`](./src/overrides/README.md) — read it before
your first override.

---

## Tier 2b — Free-form CSS override (`src/overrides/styles/site.css`)

Reach for this when you have **structural/layout CSS that isn't a token**
(so it doesn't belong in `theme.css`, which is tokens-only) **and isn't
worth a full component shadow** (e.g. a layout tweak like `.series-list-row`
gap/alignment, or resizing `.get-book-section h2` — a rule, not a markup
change). Editing `base.css` directly for this is a guaranteed
`git pull upstream main` conflict; this tier exists so you never have to.

### The mechanism: an empty-stub-fallback virtual module

`Base.astro` unconditionally imports a fixed specifier, `@theme-styles/site.css`.
Astro/Vite can't cleanly express "import this file only if it exists" as a
static `import '...'` — a static import of a path that doesn't exist on disk
is a hard build error, and there's no conditional-import syntax for CSS. So
instead, a small Vite plugin (`vite-plugins/theme-styles-override.mjs`)
resolves that specifier at build time to:

1. `src/overrides/styles/site.css` — if you've created it, or
2. an **empty virtual stylesheet** — if you haven't.

Either way the import always succeeds — the build can never break over the
override file's mere absence or presence — and because Base.astro imports it
**after** both `base.css` and `theme.css`, your rules (if you have any) win
by cascade over both.

### Worked example

```sh
mkdir -p src/overrides/styles
cat > src/overrides/styles/site.css <<'EOF'
.series-list-row {
  gap: 2rem;
}
EOF
```

No other file needs to change, and `git pull upstream main` never touches
`src/overrides/**`, so this stays conflict-free the same way Tier 2 does.

See [`src/overrides/styles/README.md`](./src/overrides/styles/README.md) for
the full contract (this folder ships empty, same as
`src/overrides/components/` and `src/overrides/layouts/`).

---

## Tier 3 — The hard boundary (never overridable)

Two things are **deliberately excluded** from the `@theme` alias, and always
resolve to the real upstream file no matter what exists in
`src/overrides/`:

- **`src/lib/jsonld.ts`** (and anything that assembles a JSON-LD `@graph`) —
  the structured-data engine. This is the whole product: the validated,
  cross-referenced schema.org data that makes the site machine-readable.
  Authors have no opinions on schema.org vocabulary, and shadowing this
  would risk silently breaking the site's validated structured-data
  contract (`npm run validate:ld` / `npm run validate:crossid`).
- **`src/pages/*`** (page routes) — routing/data-fetching, not presentation.
  Pages are never routed through `@theme`; only the components/layouts a
  page renders can be shadowed.
- **`src/components/JsonLd.astro`** specifically, as a corollary of the
  above — even though it lives in `components/`, it's a thin renderer for
  the structured-data engine, so every layout imports it directly rather
  than through `@theme`.

**Why layouts/components are fair game but this isn't:** presentation
(what the page *looks like* — header/footer structure, card markup, colors)
is a legitimate, expected customization point. The structured-data contract
(what the page *asserts to machines* — the `Person`/`Book`/`WebSite` graph,
its `@id`s, its cross-page identity guarantees) is the actual reason this
template exists, validated by two gates (`validate:ld`, `validate:crossid`)
that every PR against this repo must keep green. Letting an implementer
silently fork that engine would defeat the product's whole purpose with no
guardrail catching it.

### The one safety property this boundary depends on

`Base.astro` — which **is** shadowable (Tier 2) — is also where the
site-wide `WebSite` (+ per-page `WebPage`/`CollectionPage`) JSON-LD graph is
built and rendered via `<JsonLd graph={siteGraph} />`. That's the ONE
place this graph gets emitted, on every page, so a fully-shadowed
`src/overrides/layouts/Base.astro` **must keep that render** — see the
explicit warning in [`src/overrides/README.md`](./src/overrides/README.md).
Restructure the chrome around it however you like; just don't delete the
`<JsonLd .../>` line, and re-run the validation gates after any Base.astro
shadow to confirm you didn't.

---

## The clean-update workflow

Because the three tiers above are strict file-level splits (yours vs.
upstream's, never the same file), pulling upstream improvements stays
conflict-free by construction:

```sh
# once, after cloning your fork/copy:
git remote add upstream https://github.com/<upstream-org>/author-geo.git

# whenever you want the latest engine fixes/features:
git fetch upstream
git pull upstream main
```

Why this doesn't blow away your customizations:
- **Tier 1:** upstream never touches `src/styles/theme.css` — only
  `src/styles/base.css`. Your tokens stay yours.
- **Tier 2:** upstream never touches anything under `src/overrides/` — it
  only adds/improves files under `src/` proper. Your shadow copies stay
  yours; unshadowed files silently pick up upstream's improvements for free
  the next time you build, because `@theme/...` still resolves through to
  them.
- **Tier 2b:** same story — upstream never touches
  `src/overrides/styles/site.css`; it's yours if you create it, and the
  build is unaffected either way if you don't.
- **Tier 3:** `src/lib/jsonld.ts` and `src/pages/*` are entirely upstream's,
  always — there is nothing of yours in them to lose.
- **Content:** `src/content/**` and `src/config.ts` are yours and were
  never in scope for this system in the first place (see the main README's
  "How it's organized" section) — same story, different files.

See [`.gitattributes`](./.gitattributes) at the repo root for the same
ownership boundary expressed as a machine-readable comment block (plus one
`merge=union` convenience attribute on `theme.css` specifically).

### Quick reference — what can I edit?

| You may edit | You may NOT edit |
|---|---|
| `src/styles/theme.css` | `src/styles/base.css` |
| `src/overrides/**` (your shadow copies, incl. `src/overrides/styles/site.css`) | `src/components/**` / `src/layouts/**` (the upstream originals — copy, don't edit in place) |
| `src/content/**` | `src/lib/jsonld.ts` |
| `src/config.ts` | `src/pages/**` |

**After any Tier 2/3-adjacent change:** run the gate.

```sh
npm run build
npm run validate:ld
npm run validate:crossid
```

All three must stay green (see the main README's
[Validating your structured data](./README.md#validating-your-structured-data)
section for what each one actually checks).
