// theme-styles-override -- a Vite plugin providing the FREE-FORM CSS override
// slot (Tier B in THEMING.md): an OPTIONAL, implementer-owned stylesheet that
// loads LAST in the cascade (after base.css AND theme.css), for structural/
// layout CSS that isn't a token (theme.css is tokens-ONLY, see its own header
// comment) and isn't safe to hand-edit into base.css (upstream-owned --
// editing it directly is a guaranteed `git pull upstream main` conflict).
//
// WHY A SEPARATE PLUGIN FROM theme-override.mjs:
// theme-override.mjs resolves `@theme/<rel-path>` IMPORT SPECIFIERS (JS/Astro
// component references) to a real file that's guaranteed to exist somewhere
// (either the override or the upstream original) -- a plain resolve-and-
// passthrough. A free-form CSS override has a different shape: there is only
// ONE possible file (`src/overrides/styles/site.css`), it's OPTIONAL (no
// upstream fallback file to resolve to), and Astro/Vite can't cleanly express
// "import this file only if it exists" as a static `import '...'` at the
// Base.astro layer -- a static import of a path that doesn't exist on disk is
// a hard build error, and there's no conditional-import syntax for CSS. So
// this needs an EMPTY-STUB-FALLBACK, not a resolve-to-something-else
// fallback -- different enough behavior to warrant its own small plugin
// rather than overloading theme-override.mjs's resolveId with a second,
// differently-shaped case.
//
// MECHANISM: Base.astro unconditionally imports a fixed virtual specifier,
// `@theme-styles/site.css`. This plugin resolves that specifier to one of two
// things at build time:
//   1. src/overrides/styles/site.css -- if an implementer has created it
//      (resolved to the REAL file on disk, so it gets normal handling like
//      any other imported stylesheet), OR
//   2. an EMPTY virtual module -- if they haven't.
// Either way the import always succeeds, so the build can never break over
// the override file's mere absence/presence. When the file DOES exist, its
// rules load after theme.css (by Base.astro's import order), so they win by
// cascade -- the same selective-shadowing shape as the @theme component
// alias, just for one free-form stylesheet instead of a tree of component
// files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VIRTUAL_SPECIFIER = '@theme-styles/site.css';
// Vite convention: prefix a resolved *virtual* module id with `\\0` so other
// plugins (source-map tooling etc.) know not to try to treat it as a real
// file path on disk.
const RESOLVED_EMPTY_ID = '\\0' + VIRTUAL_SPECIFIER;

export function themeStylesOverridePlugin() {
  // Resolved once per plugin instance against THIS file's own location, so it
  // works regardless of the cwd the build is invoked from (same approach as
  // theme-override.mjs).
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  const overrideCssPath = path.join(projectRoot, 'src', 'overrides', 'styles', 'site.css');

  return {
    name: 'theme-styles-override-resolver',
    // 'pre' so this runs before Vite/Astro's own resolvers get a chance to
    // (incorrectly) treat `@theme-styles/site.css` as a bare package
    // specifier -- same reasoning as theme-override.mjs.
    enforce: 'pre',
    resolveId(source) {
      if (source !== VIRTUAL_SPECIFIER) return null;

      if (fs.existsSync(overrideCssPath)) {
        // Real file -- resolve straight to it so it's handled exactly like
        // any other imported stylesheet (normal CSS pipeline, sourcemaps).
        return overrideCssPath;
      }

      // No override present: hand back the virtual id so the load() hook
      // below can supply an empty stylesheet. The import still succeeds; it
      // just contributes zero CSS.
      return RESOLVED_EMPTY_ID;
    },
    load(id) {
      if (id !== RESOLVED_EMPTY_ID) return null;
      return '/* @theme-styles/site.css: no src/overrides/styles/site.css present -- empty stub, contributes no rules. */';
    },
  };
}
