// Log file parsing for run stats and log entry retrieval.
// Reads combined JSON log files from vox-agents/logs/.

import fs from 'fs';
import path from 'path';
import readline from 'readline';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  gameId?: string;
  [key: string]: unknown;
}

export interface RunLogStats {
  startTime: string | null;
  endTime: string | null;
  durationMs: number;
  errorCount: number;
}

// Finds combined log files in the logs directory.
function findLogFiles(logsDir: string): string[] {
  if (!fs.existsSync(logsDir)) return [];
  try {
    return fs
      .readdirSync(logsDir)
      .filter((f) => f.startsWith('combined') && f.endsWith('.log'))
      .map((f) => path.join(logsDir, f));
  } catch {
    return [];
  }
}

// Checks if a parsed log line belongs to a given gameId.
function matchesGameId(line: LogEntry, gameId: string): boolean {
  return (
    (line as unknown as { GameID?: string }).GameID === gameId ||
    (line as unknown as { params?: { gameID?: string } }).params?.gameID === gameId
  );
}

// Synchronously reads and parses log files, collecting stats for a gameId.
export async function getRunLogStats(logsDir: string, gameId: string): Promise<RunLogStats> {
  const files = findLogFiles(logsDir);
  let minTime: number | null = null;
  let maxTime: number | null = null;
  let errorCount = 0;

  for (const file of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const raw of rl) {
      if (!raw.trim()) continue;
      try {
        const line = JSON.parse(raw) as LogEntry;
        if (!matchesGameId(line, gameId)) continue;
        const ts = new Date(line.timestamp).getTime();
        if (!isNaN(ts)) {
          if (minTime === null || ts < minTime) minTime = ts;
          if (maxTime === null || ts > maxTime) maxTime = ts;
        }
        if (line.level === 'error') errorCount++;
      } catch {
        // Non-JSON line
      }
    }
  }

  return {
    startTime: minTime ? new Date(minTime).toISOString() : null,
    endTime: maxTime ? new Date(maxTime).toISOString() : null,
    durationMs: minTime && maxTime ? maxTime - minTime : 0,
    errorCount,
  };
}

// Retrieves log entries for a run with optional level filtering and pagination.
export async function getRunLogs(
  logsDir: string,
  gameId: string,
  options: { level?: string; search?: string; limit?: number; offset?: number } = {}
): Promise<LogEntry[]> {
  const files = findLogFiles(logsDir);
  const { level, search, limit = 500, offset = 0 } = options;
  const results: LogEntry[] = [];

  for (const file of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const raw of rl) {
      if (!raw.trim()) continue;
      try {
        const line = JSON.parse(raw) as LogEntry;
        if (!matchesGameId(line, gameId)) continue;
        if (level && line.level !== level) continue;
        if (search && !JSON.stringify(line).toLowerCase().includes(search.toLowerCase())) continue;
        results.push(line);
      } catch {
        // Non-JSON line
      }
    }
  }

  return results.slice(offset, offset + limit);
}
