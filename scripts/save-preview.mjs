#!/usr/bin/env node
// save-preview · plan § 3 · ADR 0001 + 0003
//
// Saves GET /digest/<night> as ONE self-contained HTML file: the raw HTTP response
// body, byte for byte, no post-processing — the page is self-contained by ADR 0001
// (one inline stylesheet, no client JS), so saving the response is the whole job.
// A "save page as" in a browser would do the same, but this way the harness scripts
// it, and the self-check below fails loudly if the page ever stops being
// self-contained. The saved file goes to a public host for review and must never be
// committed (AGENTS.md rules, ADR 0003).
//
//   pnpm save-preview -- <night> <outFile> [--no-marker]
//
// .env is loaded the way `pnpm dev`'s --env-file-if-exists does: silently absent if
// there is no file, and the process environment wins over the file — export
// LANE_MARKER and it is honored. --no-marker forces the "no marker set" banner (ADR
// 0003: the marker comes off after review) even when LANE_MARKER is set.
//
// The script is plain Node, but the runner is tsx (already a devDependency, same as
// `pnpm dev`/`pnpm start`): the rig app's sources under src/ are TSX, which plain
// node can't load.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from '../src/app.tsx';
import { loadConfig } from '../src/config.ts';

const usage = 'usage: pnpm save-preview -- <night> <outFile> [--no-marker]';

// Same edge parse readNight applies (styleguide: parse input at the edge) — a bad
// night id fails here instead of after the server is up.
const NIGHT_ID = /^\d{4}-\d{2}-\d{2}$/;

// ADR 0001 made small: no client JS, and nothing fetched from outside the file when
// it is rendered — no <script>, no <link>, no src=/href=/@import/url() pointing at
// an absolute http(s) URL. Runs on the raw response body; any violation aborts
// without saving, because a broken preview must not reach review.
function selfContainedErrors(html) {
  const bad = [];
  if (/<\s*script\b/i.test(html)) bad.push('has a <script> tag (ADR 0001: no client JS)');
  if (/<\s*link\b/i.test(html)) bad.push('has a <link> tag');
  for (const ref of html.matchAll(/(?:src|href)\s*=\s*["']?\s*([^"'>\s]+)/gi)) {
    if (/^(?:https?:)?\/\//i.test(ref[1])) bad.push(`external reference: ${ref[0]}`);
  }
  if (/@import\s+["']?\s*(?:https?:)?\/\//i.test(html)) bad.push('@import of an external stylesheet');
  if (/url\(\s*["']?\s*(?:https?:)?\/\//i.test(html)) bad.push('url() pointing outside the file');
  return bad;
}

const args = process.argv.slice(2).filter((a) => a !== '--'); // tolerate pnpm's `--`
const flags = { noMarker: false };
const positional = [];
for (const a of args) {
  if (a === '--no-marker') flags.noMarker = true;
  else if (a.startsWith('--')) {
    console.error(`error: unknown flag ${a}\n${usage}`);
    process.exit(1);
  } else positional.push(a);
}
if (positional.length !== 2) {
  console.error(`error: expected <night> <outFile>\n${usage}`);
  process.exit(1);
}
const [night, outArg] = positional;
if (!NIGHT_ID.test(night)) {
  console.error(`error: <night> must be a date id like 2026-10-28, got "${night}"`);
  process.exit(1);
}

// Mirror `pnpm dev` (`tsx --env-file-if-exists=.env`): load .env silently absent, with
// the environment already present winning over the file — same semantics as the flag.
if (existsSync('.env')) process.loadEnvFile('.env');

// The banner names the lane to whoever reads a copy (layout.tsx). After review the
// marker comes off (ADR 0003): --no-marker unsets it before the app boots, so the
// page itself, not the script, renders "no marker set".
if (flags.noMarker) delete process.env.LANE_MARKER;

const outPath = resolve(outArg);
let server;
try {
  // Boot the rig app on an ephemeral local port, exactly as src/server.ts would —
  // minus the heartbeat, which is not part of a page and would write var/.
  const config = loadConfig();
  const app = createApp(config);
  server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  const port = await new Promise((listening, failed) => {
    server.on('error', failed);
    const address = server.address();
    if (address) listening(address.port);
    else server.once('listening', () => listening(server.address().port));
  });

  // Fetch the page exactly once and keep the raw body untouched.
  const res = await fetch(`http://127.0.0.1:${port}/digest/${night}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (res.status !== 200) {
    console.error(
      `error: GET /digest/${night} → ${res.status} ${res.statusText}\n  ${body
        .toString('utf8')
        .trim()
        .slice(0, 200)}`,
    );
    process.exit(1);
  }
  if (!/^text\/html/.test(res.headers.get('content-type') ?? '')) {
    console.error(`error: GET /digest/${night} returned ${res.headers.get('content-type')}, not HTML`);
    process.exit(1);
  }

  const violations = selfContainedErrors(body.toString('utf8'));
  if (violations.length > 0) {
    console.error(`error: /digest/${night} is not self-contained (ADR 0001):`);
    for (const v of violations.slice(0, 10)) console.error(`  - ${v}`);
    console.error('nothing saved — the page would not survive a public link.');
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, body);

  const marker = flags.noMarker ? null : (process.env.LANE_MARKER ?? '').trim() || null;
  console.log(`saved ${outPath} (${body.length} bytes)`);
  console.log(`banner marker: ${marker === null ? 'no marker set' : 'set'}`);
} catch (err) {
  console.error(`error: ${err?.stack ?? err}`);
  process.exit(1);
} finally {
  server?.close();
}
