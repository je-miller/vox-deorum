// Telemetry database queries for token usage per run.
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
