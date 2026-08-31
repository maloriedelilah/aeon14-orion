# Author-Geo Authoring Skill

**Audience: an AI (or human) editing content in this repo.** This is a *procedure*,
not a tour. The `README.md` is the reference (what the fields mean, how to deploy);
this file is the **loop you run** to add or change content correctly and prove it
before you commit.

If you read nothing else, read these five rules and the validation gate.

---

## The five rules (the contract)

This site's value is machine-readable, schema.org-clean JSON-LD that answer engines
trust. A wrong edit usually still *builds green* and *looks fine* — it fails silently
in the JSON-LD. These rules exist because each one is a silent-failure trap that has
actually bitten:

1. **The JSON-LD shape is a deliberate contract — don't "improve" it.** The identity
   model and the editions/offers model below are locked decisions, encoded in
   `src/lib/jsonld.ts` and enforced by the validator. If a shape it emits looks wrong
   to you, that's a decision for the maintainer to make, not an edit to slip in — your
   job is to author *content* that fits the contract, not to reshape the contract.
   Changing an emitter to match your intuition will usually pass the build and quietly
   break the machine-readable graph the whole site exists to produce.

2. **Never guess a frontmatter field name — read `src/content.config.ts`.** It is the
   single source of truth for every collection's schema (Zod). Field names are exact
   (`authors` not `author`; `editions` with `retailer`/`url`/`format`; hub `about` is
   `[{term, sameAs?}]`; hub membership is `books`, series membership is *derived from
   books*, not listed on the series). A guessed field name is dropped or rejected.

3. **One canonical identity, referenced by named stub everywhere else.**
   Each Person/Book/Series is *defined in full exactly once* at its canonical page
   (the author on `/about`, a book on `/books/<slug>`, a series on `/series/<slug>`).
   *Every other place* that mentions it emits a **named stub** — `{"@type": ...,
   "@id": "<canonical @id>", "name": "..."}` — **never a bare `{"@id": ...}`**. A bare
   `@id` that points at a node not defined *on the same page* is a **dangling
   reference**: it resolves to nothing for a crawler that reads only that page. This
   is the #1 trap. The engine builders already do this correctly; if you add a new
   reference site, it must emit a named stub too.

4. **The canonical Person lives on `/about`, and nowhere else.** The homepage and
   every other page reference the author by `@id` + named stub. Do **not** emit a
   second full `Person` node anywhere — two authoritative definitions of the same
   identity is a duplication error (which "wins"?). Author bylines elsewhere are
   *display text* + a link to `/about`, plus the stub in the JSON-LD.

5. **Editions carry the buy-links, the work carries the canonical URL.** A
   book's retailer links live on its **editions** as `Offer.url` (`editions[].url` in
   frontmatter). The book's own `url` is its canonical on-site page, emitted
   automatically — never put a retailer link there. One work, many editions, many
   buy-links; one canonical page.

---

## The loop (do this for every content change)

```
1. read src/content.config.ts for the collection you're touching
2. add / edit the content file (see per-type recipes below)
3. npm run build              # must succeed — Zod validates frontmatter here
4. npm run validate:ld        # THE GATE — must print "N/N pages passed"
5. only if the gate passes: git add / commit / open a PR
```

**Do not commit content whose page fails the gate.** If the gate reports a dangling
reference, you introduced a bare `@id` or referenced an entity that isn't defined —
fix the content or the reference, don't suppress the check. See "Validation gate"
below for what it does and doesn't cover.

---

## Per-type recipes

All content lives under `src/content/<collection>/`. Slugs are set explicitly in
frontmatter (`slug:`) and drive the canonical `@id`/URL. Read a neighboring file in
the same folder as a live template before writing a new one.

### Add / edit the author (`src/content/author/`)
The canonical Person. `slug` drives `/about#<slug>`. Required: `slug`, `name`, `bio`,
`url`. Optional: `alternateName[]`, `photo`, `sameAs[]` (socials/Wikidata/Goodreads —
strongly recommended, they disambiguate you to answer engines), `email`.
There is normally **one** author per site (co-authors get their own author files and
are referenced per-book).

### Add / edit a book (`src/content/books/`)
Required: `title`, `slug`, `description` (the blurb), `cover` (a real image path —
no book ships coverless), `authors` (**array** of author slugs — co-author-safe,
min 1), `datePublished`, `editions` (**array**, min 1 — each with `format`,
`retailer`, `url` (the buy-link), optional `isbn`/`asin`/`price`/`currency`).
Optional: `subtitle`, `series` (a series slug) + `seriesPosition` (number),
`genres[]`, `comps[]`.
- **`comps`** are inline "if you like X" hooks: `{name, hook, sameAs?}`. `hook` is
  **required and must be a real descriptive sentence** (min 20 chars) — never a bare
  title. `sameAs` (Wikidata/Goodreads) is encouraged to pin the real entity.
- To put a book in a series: set `series: "<series-slug>"` and `seriesPosition: N` on
  the **book**. Series membership is derived from this — you do *not* list books on
  the series file.

### Add / edit a series (`src/content/series/`)
Required: `name`, `slug`, `description`, `authors` (array, min 1). Optional: `cover`,
`comps`. Members and their order come from the books' `series`/`seriesPosition` — the
series page lists them automatically and emits each as a named stub.

### Add / edit a theme / hub (`src/content/hubs/`)
Route is `/themes/<slug>` (the collection is named `hubs`). Required: `name`, `slug`,
`description`, `about` (**array**, min 1, of `{term, sameAs?}` — the DefinedTerm(s)
the hub is *about*, e.g. a topic; `sameAs` links Wikipedia/Wikidata), `books`
(**array**, min 1, of book slugs — ordered membership). Optional: `comps`.

### Add / edit an event (`src/content/events/`)
Required: `name`, `slug`, `description`, `startDate`. Optional: `endDate`,
`location`, `url`, `eventAttendanceMode` (`online`/`offline`/`mixed`, default
`offline`). All events render on the single `/events` listing page.

### Site chrome: theme / nav / footer / legal pages — NOT part of this loop
`src/config.ts` (theme mode/accent, nav links, footer text) and the `legal`
collection (`src/content/legal/privacy.md`, `terms.md`) are presentational —
they carry no schema.org identity and emit no JSON-LD, so they're outside the
five rules above and outside the validation gate's scope. Edit them freely;
`npm run build` (Zod) is the only check that applies. See `README.md` §
Configuration and § Legal pages.

---

## Validation gate

`npm run validate:ld` (script: `scripts/validate-jsonld.mjs`) is an **offline,
dependency-free structural gate**. It builds nothing itself — run `npm run build`
first — then for every page in `dist/`:

- parses every `<script type="application/ld+json">` block (fails on malformed JSON);
- **merges all blocks on a page into one graph** (a crawler reads them together, so
  cross-references resolve across blocks on the same page);
- **fails on any dangling `@id`** — a reference to a node not defined on that page.
  This is Rule 3 (the named-stub rule) enforced.

Exit code is non-zero if any page fails, so it drops straight into CI.

**What it does NOT check:** schema.org *vocabulary* validity (is `Book.author` a real
property? is a value the right type?) and the full DD shape contract (is a primary
Book missing its canonical `url`? does an edition Offer lack a buy-link?). Those are
checked by the **SHACL validator** (the `schema-validator` companion service /
`resources/authorgeo/shapes/`), which is a separate, networked, container-based
check. If you have that validator reachable, POST each page's merged JSON-LD to it
for the authoritative verdict; if you don't, the offline gate + a clean `npm run
build` (Zod frontmatter validation) is the minimum bar before committing.

**Rule of thumb:** a green `npm run build` proves your *frontmatter* is valid; a green
`npm run validate:ld` proves your *references resolve*; the SHACL validator proves the
*full schema.org + DD contract*. Clear all three you can reach before you open a PR.

---

## When you're unsure

- Field name or shape? → `src/content.config.ts` (never guess).
- What JSON-LD a page emits? → build it, open the `dist/.../index.html`, read the
  `ld+json` blocks. Ground truth beats assumption.
- A design rule? → the five rules above and `README.md`. If a rule seems wrong to you,
  surface it to the maintainer — don't edit around it.
- Deployment? → `README.md` (Cloudflare Workers static assets, mostly-static
  build — only `/api/*` runs on demand; see the deploy-model callout there).
