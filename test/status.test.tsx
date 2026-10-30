import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest, counts beside the link (§ 2c)', async () => {
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('ok 7 · retry 0 · fail 0');
    expect(html).toContain('ok 10 · retry 4 · fail 1');
  });

  it('keeps the board rendering when a night cannot be read — counts as —', async () => {
    // Not easy to hit through runs/ (read-only): a date-named jsonl that is a directory,
    // so readdirSync lists the night but readNight cannot read it.
    const dir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    mkdirSync(join(dir, '2030-03-03.jsonl'), { recursive: true });
    try {
      const res = await createApp({ ...config, runsDir: dir }).request('/');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('href="/digest/2030-03-03"');
      expect(html).toContain('—');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
