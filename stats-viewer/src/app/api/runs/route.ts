// API route for listing all game runs with aggregated stats.
// Tokens and victory info come from GameMetadata — no telemetry file scans needed.

import { NextResponse } from 'next/server';
import { findGameDbs, getRunInfo } from '@/lib/db';
import { getAllNotes } from '@/lib/notes';
import { getRunLogStats } from '@/lib/telemetry';
import { getConfig } from '@/lib/config';
import path from 'path';

export function GET() {
  const config = getConfig();
  const dbFiles = findGameDbs(config.dbDir);
  const allNotes = getAllNotes();

  const runs = dbFiles
    .map((dbPath) => {
      const info = getRunInfo(dbPath);
      if (!info) return null;

      const gameId = info.gameId || path.basename(dbPath, '.db');
      const notes = allNotes[gameId] ?? { tags: [], notes: '', excluded: false };
      const logStats = config.telemetryDir
        ? getRunLogStats(config.telemetryDir, gameId)
        : { durationMs: 0, errorCount: 0 };

      return {
        gameId,
        dbPath,
        turn: info.turn,
        lastSave: info.lastSave,
        outcome: info.outcome,
        aiPlayer: info.aiPlayer,
        victoryType: info.victoryType,
        tokens: info.tokens,
        durationMs: logStats.durationMs,
        errorCount: logStats.errorCount,
        modelName: info.modelName,
        modelConfig: info.modelConfig,
        gitCommit: info.gitCommit,
        gitBranch: info.gitBranch,
        gitRemote: info.gitRemote,
        notes,
      };
    })
    .filter(Boolean);

  return NextResponse.json(runs);
}
