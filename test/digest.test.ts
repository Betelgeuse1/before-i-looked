import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEvent, readNight } from '../src/digest/read.js';

// runs/ is read-only real fixtures (AGENTS.md); readNight only ever reads there.
const RUNS = 'runs';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight(RUNS, '2026-10-28');

  it('is present', () => {
    expect(night).not.toBeNull();
  });

  it('reduces the night to 5 jobs, sorted by job', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts the 1 bad line and the parsed statuses', () => {
    expect(night?.badLines).toBe(1); // the truncated "lane/sy" line
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('aggregates retries and the last status per job', () => {
    const rows = night?.rows ?? [];
    expect(plain(rows, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(plain(rows, 'lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });

  it('keeps the fail in the row (last error, verbatim offset)', () => {
    const row = plain(night?.rows ?? [], 'notes/backup');
    expect(row.lastStatus).toBe('fail');
    expect(row.lastError).toBe('quota exceeded');
    expect(row.lastAt).toBe('2026-10-29T04:00:01+01:00');
  });

  it('keeps a null owner as a row (§ 2a renders it as —)', () => {
    const row = plain(night?.rows ?? [], 'digest/render');
    expect(row.owner).toBeNull();
    expect(row.runs).toBe(1);
    expect(row.lastStatus).toBe('ok');
  });
});

describe('readNight on runs/2026-10-27.jsonl', () => {
  it('is a clean night: 4 jobs, zero bad lines', () => {
    const night = readNight(RUNS, '2026-10-27');
    expect(night?.rows).toHaveLength(4);
    expect(night?.badLines).toBe(0);
    expect(night?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
    expect(plain(night?.rows ?? [], 'lane/sync').runs).toBe(4);
  });
});

describe('readNight tolerances', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  let name = '2030-01-01';
  const write = (content: string) => writeFileSync(join(dir, `${name}.jsonl`), content);

  afterEach(() => {
    try {
      rmSync(join(dir, `${name}.jsonl`), { force: true });
    } catch {
      // nothing to clean
    }
  });

  it('answers null for a night with no file', () => {
    expect(readNight(dir, '2030-02-02')).toBeNull();
  });

  it('answers null for a night id that is not a date', () => {
    expect(readNight(dir, '../env')).toBeNull();
  });

  it('renders an empty night as nothing ran, not as bad lines', () => {
    write('');
    expect(readNight(dir, name)).toEqual({
      night: name,
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counted, never thrown: junk lines and a trailing newline', () => {
    write(
      [
        '{"at":"2030-01-01T00:00:00+01:00","job":"a/b","status":"ok","owner":"w"}',
        'not json at all',
        '{"at":1700000000,"job":"a/b","status":"ok"}', // parses, but not a log event
        '{"at":"2030-01-01T00:01:00+01:00","job":"c/d","status":"retry","error":"no owner given"}',
        '',
      ].join('\n'),
    );
    const night = readNight(dir, name);
    expect(night?.badLines).toBe(2);
    expect(night?.rows.map((r) => r.job)).toEqual(['a/b', 'c/d']);
    expect(plain(night?.rows ?? [], 'c/d')).toMatchObject({ owner: null, retries: 1 });
  });

  it('readNight is the real reader, not just the declared signature', () => {
    expect(typeof readNight).toBe('function');
  });
});

// Row for a job, or a failing assertion — never undefined at the call site.
function plain(rows: NonNullable<ReturnType<typeof readNight>>['rows'], job: string) {
  const row = rows.find((r) => r.job === job);
  if (row === undefined) throw new Error(`no digest row for ${job}`);
  return row;
}

describe('parseEvent at the edge', () => {
  it('accepts what the log writes and mutes the rest', () => {
    expect(parseEvent('{"at":"2026-10-28T23:00:02+01:00","job":"j","status":"ok","owner":null}')).toEqual({
      at: '2026-10-28T23:00:02+01:00',
      job: 'j',
      status: 'ok',
      owner: null,
      error: null,
    });
    expect(parseEvent('{}')).toBeNull();
    expect(parseEvent('[]')).toBeNull();
    expect(parseEvent('null')).toBeNull();
    expect(parseEvent('""')).toBeNull();
    expect(parseEvent('{"at":"2026-10-28","job":"","status":"ok"}')).toBeNull();
    expect(parseEvent('{"at":"2026-10-28","job":"j","status":"warn"}')).toBeNull();
    expect(parseEvent('{"at":"2026-10-28","job":"j","status":"ok","owner":42,"error":7}')).toMatchObject({
      owner: null,
      error: null,
    });
  });
});
