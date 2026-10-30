import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

// plan § 2d: route tests for the page and the JSON — 200, 404 for a night with no file, the
// empty night, a night with a bad line. runs/ is read-only (AGENTS.md), so a night with bad
// lines is written to a temp runs dir, handed to createApp as config.runsDir. Cases on the
// real fixture (200, 404, the empty page) are already covered in digest-page.test.tsx and
// digest-api.test.ts.

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

// A night with the usual mix: parsed events plus the junk a crash or cut write leaves behind.
// 3 parsed events over 2 jobs, 2 junk lines — counted (badLines), never thrown (§ 1).
const MIXED_NIGHT = '2031-02-03';
const MIXED_CONTENT = [
  '{"at":"2031-02-03T01:00:00+01:00","job":"bright/wash","status":"ok","owner":"rook"}',
  '{"at":"2031-02-03T01:05:00+01:00","job":"dark/frame","status":"fail","owner":null,"error":"quota exceeded"}',
  '{"at":"2031-02-03T01:10:00+01:00","job":"bright/wash","status":"retry","error":"upstream 503"}',
  'not json at all',
  '{"at":1700000000,"job":"dark/frame"}', // parses as JSON, not a log event
].join('\n');

describe('a night with bad lines, through both routes (temp runs dir)', () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    writeFileSync(join(dir, `${MIXED_NIGHT}.jsonl`), MIXED_CONTENT);
    app = createApp({ ...config, runsDir: dir });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /digest/:night renders 200 with the valid rows and counts the junk', async () => {
    const res = await app.request(`/digest/${MIXED_NIGHT}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // valid jobs render (sorted by job); the bad lines did not turn it into a 500 or an empty page
    expect(html).toContain('<h1>digest 2031-02-03</h1>');
    expect(html).toContain('<table>');
    expect(html).not.toContain('nothing ran');
    const wash = html.indexOf('<td>bright/wash</td>');
    const frame = html.indexOf('<td>dark/frame</td>');
    expect(wash).toBeGreaterThan(-1);
    expect(wash).toBeLessThan(frame); // bright/wash sorts before dark/frame

    // dark/frame's fail marked, its null owner renders as —
    expect(html).toContain('<span class="tag warn">fail</span>');
    expect(html).toContain('<td>—</td>');

    // the junk is counted for the reader: 2 bad lines, both kinds (apostrophe HTML-escaped)
    expect(html).toContain('2 lines skipped — didn&#39;t parse');
  });

  it('GET /api/digest/:night returns 200 with one row per valid job, junk ignored', async () => {
    const res = await app.request(`/api/digest/${MIXED_NIGHT}`);
    expect(res.status).toBe(200); // never thrown
    const rows = (await res.json()) as DigestRow[];
    expect(rows.map((r) => r.job)).toEqual(['bright/wash', 'dark/frame']);
    expect(rows).toHaveLength(2); // only the parsed events make rows
    const frame = rows.find((r) => r.job === 'dark/frame');
    const wash = rows.find((r) => r.job === 'bright/wash');
    expect(frame).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded', owner: null });
    // latest event wins per job: bright/wash's trailing retry has no owner → null
    expect(wash).toMatchObject({ runs: 2, retries: 1, lastStatus: 'retry', owner: null });
  });
});

describe('the empty night through the JSON route (temp runs dir)', () => {
  it('GET /api/digest/:night returns 200 and [] for an empty file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    try {
      writeFileSync(join(dir, '2030-01-01.jsonl'), '');
      const res = await createApp({ ...config, runsDir: dir }).request('/api/digest/2030-01-01');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
