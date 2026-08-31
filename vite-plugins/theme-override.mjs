// theme-override Vite plugin — the resolver behind the `@theme/...` import
// alias used across src/layouts and src/pages for PRESENTATION imports only
// (layouts + components; never pages or the JSON-LD engine — see
// src/overrides/README.md for the full contract).
//
// WHY A PLUGIN AND NOT A PLAIN `resolve.alias` ENTRY:
// A static alias can only ever map one path to one other path 1:1. What this
// needs is a FALLBACK: "if an implementer has shadowed this file in
// src/overrides/, resolve to their copy; otherwise resolve to the base file
// in src/". That's conditional on what exists on disk at build time, which a
// plain alias table can't express -- hence a small custom resolveId hook.
//
// SEMANTICS: an import of `@theme/<rel-path>` (e.g.
// `@theme/components/BookCard.astro` or `@theme/layouts/Base.astro`)
// resolves to:
//   1. src/overrides/<rel-path>  -- if that file exists, OR
//   2. src/<rel-path>            -- the upstream base file, otherwise.
//
// This is what makes shadowing SELECTIVE: an implementer who wants to
// restyle just one component copies it into src/overrides/components/ and
// edits that copy; every other `@theme/...` import in the codebase keeps
// resolving straight through to its unmodified upstream base file, so
// `git pull upstream main` only ever touches files the implementer never
// created a shadow for.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALIAS_PREFIX = '@theme/';

export function themeOverridePlugin() {
  // Resolved once per plugin instance against THIS file's own location,
  // so it works regardless of the cwd the build is invoked from.
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  const srcDir = path.join(projectRoot, 'src');
  const overridesDir = path.join(srcDir, 'overrides');

  return {
    name: 'theme-override-resolver',
    // 'pre' so this runs before Vite/Astro's own resolvers get a chance to
    // (incorrectly) treat `@theme/...` as a bare package specifier.
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (!source.startsWith(ALIAS_PREFIX)) return null;

      const rel = source.slice(ALIAS_PREFIX.length);
      const overridePath = path.join(overridesDir, rel);
      const basePath = path.join(srcDir, rel);
      const target = fs.existsSync(overridePath) ? overridePath : basePath;

      // Hand the concrete, resolved absolute path back through the normal
      // resolution pipeline (skipSelf so we don't re-enter this same hook)
      // so every other plugin (notably Astro's own, which compiles .astro
      // files by resolved file path/extension, not by which plugin produced
      // the id) still runs exactly as if the import had named that path
      // directly.
      return this.resolve(target, importer, { ...options, skipSelf: true });
    },
  };
}
