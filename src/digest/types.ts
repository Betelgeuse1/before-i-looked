// plan.md § 1 (morning-digest), the types every part of § 2 starts against.
// The reader itself lives in read.ts; routes and views only need this file.

export type JobStatus = 'ok' | 'retry' | 'fail';

// One log event as written to runs/<night>.jsonl: {"at","job","status","owner","error?"}.
// `at` is kept verbatim — offset included, never converted (styleguide).
export type LogEvent = {
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null; // null is legal in the log, renders as — (§ 2a)
  error: string | null; // retries and fails usually name their error
};

// One row per job: what ran, whose it was, how it went, when it started and ended.
export type DigestRow = {
  job: string;
  owner: string | null; // of the latest event; stays in the row when null, shows as —
  runs: number; // log lines for this job (all attempts)
  retries: number; // of those, the ones with status "retry"
  lastStatus: JobStatus; // status of the latest event
  lastError: string | null; // error of the latest event
  firstAt: string; // first event's `at`
  lastAt: string; // latest event's `at`
};

// One night, page (§ 2a) and JSON (§ 2b) both render this, so they cannot disagree (ADR 0001).
export type NightDigest = {
  night: string; // "2026-10-28" ↔ runs/2026-10-28.jsonl
  rows: DigestRow[]; // one per job, sorted by job
  counts: Record<JobStatus, number>; // parsed events per status (§ 2c's board counts)
  badLines: number; // lines that didn't parse: counted, never thrown, night still renders
};

// - No file for that night (or a night id that isn't a date) → null; § 2a answers 404.
// - Empty file → { night, rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 0 };
//   § 2a renders "nothing ran".
export declare function readNight(runsDir: string, night: string): NightDigest | null;
