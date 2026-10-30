import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('GET /digest/:night', () => {
  it('renders 2026-10-28: 200, jobs sorted by job, markers, — for the null owner', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<h1>digest 2026-10-28</h1>');

    // rows sorted by job (digest/render has the null owner; notes/backup the fail)
    const first = html.indexOf('<td>digest/render</td>');
    const middle = html.indexOf('<td>notes/backup</td>');
    const last = html.indexOf('<td>rig/rotate-logs</td>');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(middle);
    expect(middle).toBeLessThan(last);

    // notes/backup: fail marked · fixtures/refresh: 3+ retries marked
    expect(html).toContain('<span class="tag warn">fail</span>');
    expect(html).toContain('3+ retries');
    // digest/render ran with owner null — rendered as —, not dropped
    expect(html).toContain('<td>—</td>');
    // times keep their offsets verbatim
    expect(html).toContain('2026-10-28T23:00:06+01:00');
  });

  it('answers 404 for a night with no file and for a night id that is not a date', async () => {
    expect((await createApp(config).request('/digest/2050-01-01')).status).toBe(404);
    expect((await createApp(config).request('/digest/not-a-night')).status).toBe(404);
  });

  it('renders an empty file as nothing ran', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-page-'));
    try {
      writeFileSync(join(dir, '2030-01-01.jsonl'), '');
      const res = await createApp({ ...config, runsDir: dir }).request('/digest/2030-01-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('nothing ran');
      expect(html).not.toContain('<table>');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
