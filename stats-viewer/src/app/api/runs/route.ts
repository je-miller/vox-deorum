// API route for listing all game runs with aggregated stats.
// Tokens and victory info come from GameMetadata — no telemetry file scans needed.

import { NextResponse } from 'next/server';
import { findGameDbs, getRunInfo } from '@/lib/db';
import { getAllNotes } from '@/lib/notes';
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

      return {
        gameId,
        dbPath,
        turn: info.turn,
        lastSave: info.lastSave,
        outcome: info.outcome,
        aiPlayer: info.aiPlayer,
        victoryType: info.victoryType,
        tokens: info.tokens,
        notes,
      };
    })
    .filter(Boolean);

  return NextResponse.json(runs);
}
