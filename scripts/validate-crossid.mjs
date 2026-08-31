#!/usr/bin/env node
/**
 * validate-crossid.mjs
 *
 * OFFLINE cross-page JSON-LD identity-consistency gate for the author-geo
 * site. This is a SIBLING gate to validate-jsonld.mjs, not a replacement —
 * that script checks references WITHIN a single page (does every {"@id"}
 * pointer resolve to something defined on that same page?). This script
 * checks something that script structurally CANNOT see: whether the SAME
 * @id asserts CONTRADICTORY data on DIFFERENT pages.
 *
 * WHY THIS EXISTS
 * -----------------
 * schema.org JSON-LD lets you reference an entity from many pages either as
 * a full node (all its properties) or as a minimal "named stub" ({@id,
 * @type, name}). That's normal and correct — e.g. the WebSite node is
 * defined once with its full identity, and other nodes reference it via a
 * stub. But it means the SAME @id can legitimately appear dozens of times
 * across a site's build output, and nothing before this script verified
 * those repeated appearances actually agree with each other.
 *
 * The bug this gate exists to catch already happened once (fixed 2026-07-23,
 * PR #26): every page emitted a WebSite node under the SAME @id
 * (`#website`), but `WebSite.name` was accidentally bound to that page's own
 * `<title>` — so the "same" WebSite entity asserted a different name on
 * every single page. validate-jsonld.mjs's within-page reference check was
 * (correctly, per its own scope) blind to this: on any ONE page, the
 * WebSite node was perfectly well-formed and every reference to it
 * resolved. The contradiction only existed ACROSS pages. This script closes
 * exactly that blind spot.
 *
 * WHAT COUNTS AS A CONFLICT (AND WHAT DOESN'T)
 * -----------------------------------------------
 * For every @id seen on more than one page, this script compares the KEYS
 * THE OCCURRENCES HAVE IN COMMON:
 *
 *   - If two occurrences both have a key (e.g. both have "name") and the
 *     values are NOT the same -> CONFLICT. This is the real bug class.
 *
 *   - If two occurrences have a different @type for the SAME @id ->
 *     CONFLICT. Same identity, incompatible type, is never valid.
 *
 *   - If one occurrence has a key the other lacks (e.g. the full Person
 *     node has "photo" but a nested named-stub reference to that same
 *     Person only has {@id, @type, name}) -> NOT a conflict. A stub is a
 *     deliberate, valid PARTIAL view of an entity, not contradictory data.
 *     This is the normal, expected, correct pattern used throughout this
 *     codebase (see jsonld.ts's namedStub helper) and must not be flagged.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHECK
 * ----------------------------------------
 * - Anything validate-jsonld.mjs already checks (dangling within-page
 *   references, JSON well-formedness). Run both; they catch different bugs.
 * - schema.org vocabulary/property validity.
 * - Deep semantic equivalence of differently-shaped-but-equal values (this
 *   compares nested objects/arrays via a stable JSON serialization, so e.g.
 *   key order never causes a false conflict, but a genuinely different
 *   nested structure will still be flagged — that's usually exactly what
 *   you want to know about).
 *
 * USAGE
 * -----
 *   node scripts/validate-crossid.mjs [dist-dir]
 *
 * Exit code 0 = no cross-page identity conflicts found. Exit code 1 = at
 * least one @id has contradictory data across pages (or the site directory
 * doesn't exist / contains no HTML files).
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// File discovery + JSON-LD extraction
//
// Deliberately duplicated (not imported) from validate-jsonld.mjs: that
// script executes its own main() as a side effect of being loaded, and
// this gate is meant to stay just as self-contained/dependency-free as its
// sibling, per this repo's existing convention for these offline scripts.
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

/**
 * Extract the raw text content of every
 * `<script type="application/ld+json">...</script>` block in an HTML string.
 */
function extractJsonLdBlocks(html) {
  const blocks = [];
  const scriptTagRe =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = scriptTagRe.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Graph walking: collect every node with BOTH @id and @type, wherever it
// appears (top-level or nested), along with which page it came from.
// ---------------------------------------------------------------------------

/**
 * Recursively walk a parsed JSON-LD value, pushing every node that has both
 * @id and @type into `sightings` as { id, type, props, page }.
 * `props` is the node's OWN (shallow, own-enumerable, excluding @id/@type)
 * key/value map — nested child nodes are walked and recorded separately
 * under their own @id, not flattened into this node's props.
 */
function collectSightings(value, sightings, page) {
  if (Array.isArray(value)) {
    for (const item of value) collectSightings(item, sightings, page);
    return;
  }
  if (value && typeof value === "object") {
    const hasId = Object.prototype.hasOwnProperty.call(value, "@id");
    const hasType = Object.prototype.hasOwnProperty.call(value, "@type");

    if (hasId && hasType) {
      const props = {};
      for (const [k, v] of Object.entries(value)) {
        if (k === "@id" || k === "@type") continue;
        props[k] = v;
      }
      sightings.push({ id: value["@id"], type: value["@type"], props, page });
    }

    for (const [key, val] of Object.entries(value)) {
      if (key === "@id" || key === "@type") continue;
      collectSightings(val, sightings, page);
    }
  }
}

/**
 * Stable stringify: sorts object keys recursively so key-order differences
 * never cause a false-positive conflict. Arrays keep their order (order can
 * be meaningful, e.g. an Offer list or reading-order ItemList).
 */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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

  console.log(`\nCross-page JSON-LD identity gate — scanning ${htmlFiles.length} page(s) under "${siteDir}"\n`);

  const sightings = []; // { id, type, props, page }
  let parseFailures = 0;

  for (const file of htmlFiles) {
    const rel = path.relative(process.cwd(), file);
    const html = await readFile(file, "utf8");
    const blockTexts = extractJsonLdBlocks(html);
    for (let i = 0; i < blockTexts.length; i++) {
      try {
        const parsed = JSON.parse(blockTexts[i].trim());
        collectSightings(parsed, sightings, rel);
      } catch {
        // Malformed JSON is validate-jsonld.mjs's job to report; don't
        // duplicate that failure here, just skip the unparsable block so a
        // syntax error elsewhere doesn't mask real cross-id conflicts.
        parseFailures++;
      }
    }
  }

  // Group sightings by @id.
  const byId = new Map();
  for (const s of sightings) {
    if (!byId.has(s.id)) byId.set(s.id, []);
    byId.get(s.id).push(s);
  }

  const conflicts = [];

  for (const [id, occurrences] of byId) {
    // Only @ids seen on more than one DISTINCT page can conflict.
    const pages = new Set(occurrences.map((o) => o.page));
    if (pages.size < 2) continue;

    // @type must agree across every occurrence of this @id.
    const types = new Set(occurrences.map((o) => o.type));
    if (types.size > 1) {
      conflicts.push({
        id,
        key: "@type",
        detail: [...types].map((t) => `"${t}"`).join(" vs "),
        pages: [...pages],
      });
    }

    // For every property key that appears on 2+ occurrences, every value
    // present must agree (missing on some occurrence = stub, not a conflict).
    const keysSeen = new Set();
    for (const o of occurrences) for (const k of Object.keys(o.props)) keysSeen.add(k);

    for (const key of keysSeen) {
      const withKey = occurrences.filter((o) => Object.prototype.hasOwnProperty.call(o.props, key));
      if (withKey.length < 2) continue;

      const distinctValues = new Map(); // stableStringify -> { raw, pages: Set }
      for (const o of withKey) {
        const s = stableStringify(o.props[key]);
        if (!distinctValues.has(s)) distinctValues.set(s, { raw: o.props[key], pages: new Set() });
        distinctValues.get(s).pages.add(o.page);
      }

      if (distinctValues.size > 1) {
        conflicts.push({
          id,
          key,
          detail: [...distinctValues.entries()]
            .map(([, v]) => `${JSON.stringify(v.raw)} (on ${[...v.pages].join(", ")})`)
            .join("  <>  "),
          pages: [...pages],
        });
      }
    }
  }

  const uniqueIds = byId.size;
  const sharedIds = [...byId.values()].filter((occ) => new Set(occ.map((o) => o.page)).size > 1).length;

  console.log(`  ${htmlFiles.length} page(s), ${uniqueIds} unique @id(s), ${sharedIds} shared across 2+ pages\n`);

  if (conflicts.length === 0) {
    console.log(`0 cross-page identity conflicts found (${sharedIds} shared @id(s) checked)`);
    if (parseFailures > 0) {
      console.log(`Note: ${parseFailures} JSON-LD block(s) failed to parse and were skipped here — see \`npm run validate:ld\` for that failure.`);
    }
    process.exitCode = 0;
  } else {
    console.log(`✖ ${conflicts.length} cross-page identity conflict(s) found:\n`);
    for (const c of conflicts) {
      console.log(`  "@id": "${c.id}"`);
      console.log(`    property "${c.key}" disagrees across pages: ${c.detail}`);
      console.log(`    (appears on: ${c.pages.join(", ")})\n`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\nUnexpected error running validate-crossid.mjs:");
  console.error(err);
  process.exitCode = 1;
});
