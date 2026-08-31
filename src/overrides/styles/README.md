# src/overrides/styles/ — free-form CSS override slot (Tier B)

This folder is where **you** (the implementer) put structural/layout CSS that
is NOT a token (`src/styles/theme.css` is tokens-ONLY — see its own header
comment and `.gitattributes`' `merge=union` note) and isn't safe to hand-edit
into `src/styles/base.css` (upstream-owned — editing it directly is a
guaranteed `git pull upstream main` conflict; see base.css's own header
comment, Tier 3 in THEMING.md).

It ships empty on purpose — like `src/overrides/components/` and
`src/overrides/layouts/`, it's an extension point, not a place with anything
active in it yet.

## How it works

Create `src/overrides/styles/site.css` and put whatever CSS you want in it —
plain rules, no special format required. `Base.astro` unconditionally imports
a virtual `@theme-styles/site.css` specifier, which
`vite-plugins/theme-styles-override.mjs` resolves to:

1. `src/overrides/styles/site.css` — if you've created it, or
2. an empty virtual stylesheet — if you haven't.

Either way the import always succeeds (no build break either way), and when
your file DOES exist, its rules load **after** both `base.css` and
`theme.css` in the cascade, so they win over both by source order.

### Worked example (illustrative only — not an active file)

```sh
mkdir -p src/overrides/styles
cat > src/overrides/styles/site.css <<'EOF'
/* Example: widen the series-list layout beyond base.css's default. */
.series-list-row {
  gap: 2rem;
}
EOF
```

From that point on, `@theme-styles/site.css` resolves to your file and its
rules apply site-wide, on top of base.css and theme.css, with zero edits to
either of those files.

## When to use this vs. the other tiers

- **Just a color/font/spacing value that's already a `var(--token)`?** Edit
  `src/styles/theme.css` instead (Tier 1) — no file needed here at all.
- **A component's actual markup/structure/behavior, not just its CSS?**
  Shadow the component under `src/overrides/components/` or
  `src/overrides/layouts/` instead (Tier 2) — see the sibling
  `src/overrides/README.md`.
- **Structural/layout CSS that isn't a token and doesn't belong in a
  shadowed component (e.g. a page-wide layout tweak, sizing a heading in a
  specific section)?** This folder is for exactly that.
