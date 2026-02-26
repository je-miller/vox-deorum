// API route for fetching timeline visualization data for a single game run.
// Accepts GET requests with gameId parameter and returns complete timeline data:
// - Player list (civilization, leader, human/AI status)
// - Score/Military/Science curves over turns
// - Event markers (wars, policies, eras, victories) with details
// Uses database file lookup by gameId and getTimelineData orchestrator.

import { NextRequest, NextResponse } from 'next/server';
import { findGameDbs, getTimelineData } from '@/lib/db';
import { getConfig } from '@/lib/config';
import path from 'path';
import Database from 'better-sqlite3';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const config = getConfig();
  const dbFiles = findGameDbs(config.dbDir);

  const dbPath = dbFiles.find((f) => path.basename(f, '.db') === gameId);
  if (!dbPath) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const data = getTimelineData(db);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to read DB' }, { status: 500 });
  } finally {
    db?.close();
  }
}
