import { readdirSync } from 'node:fs';
import { readNight } from './digest/read.js';
import type { NightDigest } from './digest/types.js';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';

// One night on the board: linked to its digest (§ 2c), with the NightDigest's counts beside it.
// A night that can't be read keeps its row on the board; its counts render as — (styleguide).
export type NightOnDisk = {
  night: string; // "2026-10-28" ↔ runs/2026-10-28.jsonl
  counts: NightDigest['counts'] | null; // null = the digest couldn't be read
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightOnDisk[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir).map((night) => {
    const digest = readNight(config.runsDir, night);
    return { night, counts: digest?.counts ?? null };
  });
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
  };
}
