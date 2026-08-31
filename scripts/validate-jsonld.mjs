#!/usr/bin/env node
/**
 * validate-jsonld.mjs
 *
 * OFFLINE structural JSON-LD validation gate for the author-geo site.
 *
 * WHAT THIS CHECKS
 * -----------------
 * For every built HTML page under the site output directory (default: dist/):
 *
 *   1. Every `<script type="application/ld+json">...</script>` block on the
 *      page must contain WELL-FORMED JSON. A parse error is a FAILURE.
 *
 *   2. All JSON-LD blocks on a single page are MERGED into one logical graph
 *      before checking references. This matters because a crawler reads a
 *      page's structured data as one connected graph, even though authors
 *      may (and often do) split it across several <script> tags — e.g. one
 *      block for the Book, one for the Person, one for the BreadcrumbList.
 *      A reference in block A to a node defined in block B is perfectly
 *      valid and must NOT be flagged as dangling.
 *
 *   3. Every node that is "defined" on the page — i.e. any object anywhere
 *      in the merged graph that has BOTH an `@type` and an `@id` — is
 *      recorded as available. This includes minimal "named stub" nodes
 *      (just `@type` + `@id` + e.g. `name`), which are a normal and valid
 *      way to reference an entity without repeating its full definition.
 *
 *   4. Every node that is "referenced" — i.e. any object anywhere in the
 *      merged graph that has an `@id` but NO `@type` (a bare
 *      `{"@id": "..."}` pointer) — must resolve to a node that was
 *      DEFINED somewhere on the same page. Any referenced `@id` with no
 *      matching defined node is a DANGLING REFERENCE and is a FAILURE.
 *      This is the DD-001 failure class this gate exists to catch: a
 *      content edit that renames/removes an entity's canonical node while
 *      other JSON-LD blocks still point at its old `@id`.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHECK
 * --------------------------------------
 * - schema.org vocabulary validity (is `@type: Book` even a real type? are
 *   the properties used on it valid for that type?).
 * - Full SHACL / shape validation against schema.org's real ontology.
 * - Any of Google's Rich Results eligibility rules.
 * These require network access to schema.org's vocabulary (or a cached
 * copy of it) and are the job of the separate, optional, networked ITB
 * (schema.org validator) tooling. This script is intentionally offline,
 * dependency-free, and fast: it is a structural sanity gate an AI or
 * human editor runs locally before committing, not a substitute for full
 * semantic validation.
 *
 * USAGE
 * -----
 *   node scripts/validate-jsonld.mjs [dist-dir]
 *
 * Exit code 0 = every page passed. Exit code 1 = at least one page failed
 * (or the site directory doesn't exist / contains no HTML files).
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** Recursively collect every *.html file under `dir`. */
async function findHtmlFiles(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findHtmlFiles(full)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// JSON-LD extraction
// ---------------------------------------------------------------------------

/**
 * Extract the raw text content of every
 * `<script type="application/ld+json">...</script>` block in an HTML string.
 * Uses a regex rather than a full HTML parser — sufficient here since we
 * only need the contents of a specific, well-formed tag, and keeps this
 * script dependency-free.
 */
function extractJsonLdBlocks(html) {
  const blocks = [];
  // Match the opening tag with type="application/ld+json" (allowing other
  // attributes / attribute order / single or double quotes), non-greedy
  // capture of the body, up to the closing </script>.
  const scriptTagRe =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = scriptTagRe.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Graph walking: collect defined @ids and referenced @ids
// ---------------------------------------------------------------------------

/**
 * Recursively walk a parsed JSON-LD value, collecting:
 *  - defined:   Set of @id strings on nodes that have BOTH @type and @id.
 *  - referenced: array of { id, path } for nodes that have @id but NO @type
 *                (bare reference pointers).
 *
 * `path` is a human-readable breadcrumb (best-effort) for error reporting.
 */
function walkGraph(value, { defined, referenced }, pathHint = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkGraph(item, { defined, referenced }, `${pathHint}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    const hasId = Object.prototype.hasOwnProperty.call(value, "@id");
    const hasType = Object.prototype.hasOwnProperty.call(value, "@type");

    if (hasId && hasType) {
      defined.add(value["@id"]);
    } else if (hasId && !hasType) {
      referenced.push({ id: value["@id"], path: pathHint });
    }

    // Recurse into every property value (nodes can nest defined/referenced
    // nodes arbitrarily deep — e.g. author.worksIn.publisher...).
    for (const [key, val] of Object.entries(value)) {
      if (key === "@id" || key === "@type") continue;
      walkGraph(val, { defined, referenced }, `${pathHint}.${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-page validation
// ---------------------------------------------------------------------------

/**
 * Validate a single HTML file. Returns { ok, errors: string[] }.
 */
async function validatePage(filePath) {
  const errors = [];
  const html = await readFile(filePath, "utf8");
  const blockTexts = extractJsonLdBlocks(html);

  if (blockTexts.length === 0) {
    // No JSON-LD on this page at all is not itself a structural failure of
    // THIS gate (some pages may legitimately carry none) — nothing to
    // merge/check. Report as pass with zero blocks.
    return { ok: true, errors, blockCount: 0 };
  }

  const parsedBlocks = [];
  for (let i = 0; i < blockTexts.length; i++) {
    const raw = blockTexts[i].trim();
    try {
      parsedBlocks.push(JSON.parse(raw));
    } catch (err) {
      errors.push(`JSON-LD block #${i} is not well-formed JSON: ${err.message}`);
    }
  }

  // If any block failed to parse, we still try to check the ones that DID
  // parse (more useful feedback), but the page is already a failure.
  const defined = new Set();
  const referenced = [];

  for (const parsed of parsedBlocks) {
    // A block may itself be an array of nodes, a single node, or use
    // "@graph": [...] — handle all three by walking the whole value.
    walkGraph(parsed, { defined, referenced });
  }

  // Check every referenced @id resolves to something defined on this page.
  const seenDangling = new Set(); // avoid duplicate reports of the same id
  for (const ref of referenced) {
    if (!defined.has(ref.id)) {
      const key = ref.id;
      if (!seenDangling.has(key)) {
        seenDangling.add(key);
        errors.push(`Dangling reference: "@id": "${ref.id}" (first seen at ${ref.path}) has no matching defined node (object with matching @id AND @type) anywhere on this page.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, blockCount: blockTexts.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const siteDir = process.argv[2] || "dist";

  if (!existsSync(siteDir)) {
    console.error(`\n✖ Site directory "${siteDir}" does not exist.`);
    console.error(`  Run \`npm run build\` first, then re-run this validator.\n`);
    process.exitCode = 1;
    return;
  }

  const dirStat = await stat(siteDir);
  if (!dirStat.isDirectory()) {
    console.error(`\n✖ "${siteDir}" exists but is not a directory.\n`);
    process.exitCode = 1;
    return;
  }

  const htmlFiles = (await findHtmlFiles(siteDir)).sort();

  if (htmlFiles.length === 0) {
    console.error(`\n✖ No *.html files found under "${siteDir}".`);
    console.error(`  Run \`npm run build\` first, then re-run this validator.\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nOffline JSON-LD structural gate — checking ${htmlFiles.length} page(s) under "${siteDir}"\n`);

  let passCount = 0;
  const failures = [];

  for (const file of htmlFiles) {
    const rel = path.relative(process.cwd(), file);
    const result = await validatePage(file);
    if (result.ok) {
      passCount++;
      console.log(`  PASS  ${rel}  (${result.blockCount} JSON-LD block${result.blockCount === 1 ? "" : "s"})`);
    } else {
      failures.push({ file: rel, errors: result.errors });
      console.log(`  FAIL  ${rel}`);
      for (const err of result.errors) {
        console.log(`          - ${err}`);
      }
    }
  }

  console.log("");
  if (failures.length === 0) {
    console.log(`${passCount}/${htmlFiles.length} pages passed`);
    process.exitCode = 0;
  } else {
    console.log(`${failures.length} page${failures.length === 1 ? "" : "s"} FAILED (${passCount}/${htmlFiles.length} passed)`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\nUnexpected error running validate-jsonld.mjs:");
  console.error(err);
  process.exitCode = 1;
});
