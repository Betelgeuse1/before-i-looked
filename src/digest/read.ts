import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, LogEvent, NightDigest } from './types.js';

export type { DigestRow, JobStatus, LogEvent, NightDigest } from './types.js';

const NIGHT_ID = /^\d{4}-\d{2}-\d{2}$/;

// Parse input at the edge (styleguide): a line that isn't a log event returns null and gets
// counted in badLines, never thrown. Missing/illegal owner → null, the row stays (§ 1).
export function parseEvent(line: string): LogEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.at !== 'string' || o.at === '') return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (o.status !== 'ok' && o.status !== 'retry' && o.status !== 'fail') return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status,
    owner: typeof o.owner === 'string' ? o.owner : null,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

// plan.md § 1: runs/<night>.jsonl → one DigestRow per job, plus the night aggregate.
// "latest" is by `at` (offset kept verbatim), later line wins on equal times. `runs` counts
// every event, `retries` only the "retry" ones. Rows come out sorted by job.
export function readNight(runsDir: string, night: string): NightDigest | null {
  if (!NIGHT_ID.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const rows = new Map<string, DigestRow>();
  const counts: Record<JobStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue; // a trailing newline is not a bad line
    const event = parseEvent(line);
    if (event === null) {
      badLines += 1;
      continue;
    }
    counts[event.status] += 1;

    let row = rows.get(event.job);
    if (row === undefined) {
      row = {
        job: event.job,
        owner: event.owner,
        runs: 0,
        retries: 0,
        lastStatus: event.status,
        lastError: event.error,
        firstAt: event.at,
        lastAt: event.at,
      };
      rows.set(event.job, row);
    }
    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    if (event.at >= row.lastAt) {
      row.lastAt = event.at;
      row.lastStatus = event.status;
      row.lastError = event.error;
      row.owner = event.owner;
    }
  }

  return {
    night,
    rows: [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0)),
    counts,
    badLines,
  };
}
