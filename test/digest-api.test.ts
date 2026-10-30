import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const app = createApp({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'runs',
});

describe('GET /api/digest/:night', () => {
  it('returns the rows for 2026-10-28: an array of 5, sorted by job', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const rows = (await res.json()) as DigestRow[];
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('answers 404 for a night with no file and for a malformed night id', async () => {
    expect((await app.request('/api/digest/1999-01-01')).status).toBe(404);
    expect((await app.request('/api/digest/%2E%2E/env')).status).toBe(404); // "../env"
  });
});
