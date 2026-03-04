// Telemetry database queries for token usage and run stats.
// Reads {gameId}-player-{N}.db files from the telemetry directory.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  total: number;
}

export interface RunLogStats {
  startTime: string | null;
  endTime: string | null;
  durationMs: number;
  errorCount: number;
}

export interface ErrorSpan {
  name: string;
  timestamp: string;
  statusMessage: string;
  attributes: Record<string, unknown> | null;
}

// Finds all telemetry DB files matching a gameId.
export function findTelemetryFiles(telemetryDir: string, gameId: string): string[] {
  if (!fs.existsSync(telemetryDir)) return [];
  const results: string[] = [];

  function scan(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile() && entry.name.includes(gameId) && entry.name.endsWith('.db')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible
    }
  }

  scan(telemetryDir);
  return results;
}

// Extracts token counts from a single telemetry DB.
function getTokensFromDb(dbPath: string): TokenUsage {
  let db: Database.Database | null = null;
  const usage: TokenUsage = { input: 0, output: 0, reasoning: 0, total: 0 };
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT attributes FROM spans WHERE attributes IS NOT NULL').all() as { attributes: string }[];
    for (const row of rows) {
      try {
        const attrs = JSON.parse(row.attributes);
        if (attrs?.tokens) {
          usage.input += Number(attrs.tokens.input ?? 0);
          usage.output += Number(attrs.tokens.output ?? 0);
          usage.reasoning += Number(attrs.tokens.reasoning ?? 0);
        }
      } catch {
        // Invalid JSON, skip
      }
    }
  } catch {
    // DB not accessible or table missing
  } finally {
    db?.close();
  }
  usage.total = usage.input + usage.output + usage.reasoning;
  return usage;
}

// Aggregates token usage across all telemetry files for a gameId.
export function getTotalTokens(telemetryDir: string, gameId: string): TokenUsage {
  const files = findTelemetryFiles(telemetryDir, gameId);
  const total: TokenUsage = { input: 0, output: 0, reasoning: 0, total: 0 };
  for (const file of files) {
    const usage = getTokensFromDb(file);
    total.input += usage.input;
    total.output += usage.output;
    total.reasoning += usage.reasoning;
    total.total += usage.total;
  }
  return total;
}

// Extracts run duration and error count from a single telemetry DB's spans table.
// Duration: MIN/MAX of startTime. Errors: rows where statusCode == 2.
function getStatsFromDb(dbPath: string): RunLogStats {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });

    const timeRow = db.prepare(
      'SELECT MIN(startTime) AS minT, MAX(startTime) AS maxT FROM spans'
    ).get() as { minT: number | null; maxT: number | null } | undefined;

    const errorRow = db.prepare(
      'SELECT COUNT(*) AS cnt FROM spans WHERE statusCode = 2'
    ).get() as { cnt: number } | undefined;

    const minT = timeRow?.minT ?? null;
    const maxT = timeRow?.maxT ?? null;

    // startTime is stored as nanosecond Unix timestamp
    const minMs = minT !== null ? minT / 1e6 : null;
    const maxMs = maxT !== null ? maxT / 1e6 : null;

    return {
      startTime: minMs !== null ? new Date(minMs).toISOString() : null,
      endTime: maxMs !== null ? new Date(maxMs).toISOString() : null,
      durationMs: minMs !== null && maxMs !== null ? maxMs - minMs : 0,
      errorCount: errorRow?.cnt ?? 0,
    };
  } catch {
    return { startTime: null, endTime: null, durationMs: 0, errorCount: 0 };
  } finally {
    db?.close();
  }
}

// Extracts error spans (statusCode == 2) from a single telemetry DB.
function getErrorsFromDb(dbPath: string): ErrorSpan[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(
      'SELECT name, startTime, statusMessage, attributes FROM spans WHERE statusCode = 2 ORDER BY startTime DESC'
    ).all() as { name: string; startTime: number; statusMessage: string | null; attributes: string | null }[];

    return rows.map(row => {
      let attrs: Record<string, unknown> | null = null;
      if (row.attributes) {
        try { attrs = JSON.parse(row.attributes); } catch { /* invalid JSON */ }
      }
      return {
        name: row.name,
        timestamp: new Date(row.startTime / 1e6).toISOString(),
        statusMessage: row.statusMessage ?? '',
        attributes: attrs,
      };
    });
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

// Aggregates error spans across all telemetry files for a gameId, sorted by timestamp desc.
export function getErrorSpans(telemetryDir: string, gameId: string): ErrorSpan[] {
  const files = findTelemetryFiles(telemetryDir, gameId);
  const allErrors: ErrorSpan[] = [];
  for (const file of files) {
    allErrors.push(...getErrorsFromDb(file));
  }
  allErrors.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return allErrors;
}

// Extracts error spans with their turn numbers for timeline chart overlay.
function getErrorTurnsFromDb(dbPath: string): { turn: number; name: string; message: string }[] {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(
      'SELECT turn, name, statusMessage FROM spans WHERE statusCode = 2 AND turn IS NOT NULL ORDER BY turn ASC'
    ).all() as { turn: number; name: string; statusMessage: string | null }[];
    return rows.map(row => ({
      turn: row.turn,
      name: row.name,
      message: row.statusMessage ?? '',
    }));
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

// Aggregates error turns across all telemetry files for timeline chart display.
export function getErrorTurns(telemetryDir: string, gameId: string): { turn: number; name: string; message: string }[] {
  const files = findTelemetryFiles(telemetryDir, gameId);
  const allErrors: { turn: number; name: string; message: string }[] = [];
  for (const file of files) {
    allErrors.push(...getErrorTurnsFromDb(file));
  }
  allErrors.sort((a, b) => a.turn - b.turn);
  return allErrors;
}

// Aggregates run stats across all telemetry files for a gameId.
// Uses the spans table for duration (MIN/MAX startTime) and errors (statusCode == 2).
export function getRunLogStats(telemetryDir: string, gameId: string): RunLogStats {
  const files = findTelemetryFiles(telemetryDir, gameId);
  let minMs: number | null = null;
  let maxMs: number | null = null;
  let errorCount = 0;

  for (const file of files) {
    const stats = getStatsFromDb(file);
    if (stats.startTime) {
      const t = new Date(stats.startTime).getTime();
      if (minMs === null || t < minMs) minMs = t;
    }
    if (stats.endTime) {
      const t = new Date(stats.endTime).getTime();
      if (maxMs === null || t > maxMs) maxMs = t;
    }
    errorCount += stats.errorCount;
  }

  return {
    startTime: minMs !== null ? new Date(minMs).toISOString() : null,
    endTime: maxMs !== null ? new Date(maxMs).toISOString() : null,
    durationMs: minMs !== null && maxMs !== null ? maxMs - minMs : 0,
    errorCount,
  };
}
