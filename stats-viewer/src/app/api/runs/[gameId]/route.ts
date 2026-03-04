// API route for fetching full detail for a single run.
// Token counts come from GameMetadata (already read by getRunDetail).
// Run stats (duration, errors) come from the telemetry spans table.

import { NextRequest, NextResponse } from 'next/server';
import { findGameDbs, getRunDetail } from '@/lib/db';
import { getRunLogStats } from '@/lib/telemetry';
import { getNotes } from '@/lib/notes';
import { getConfig } from '@/lib/config';
import path from 'path';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const prefix = `[runs/${gameId}]`;
  console.time(`${prefix} total`);

  const config = getConfig();

  console.time(`${prefix} findGameDbs`);
  const dbFiles = findGameDbs(config.dbDir);
  console.timeEnd(`${prefix} findGameDbs`);

  // Find the DB file matching this gameId (by filename or internal gameId)
  let dbPath = dbFiles.find((f) => path.basename(f, '.db') === gameId);
  if (!dbPath) {
    console.timeEnd(`${prefix} total`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  console.time(`${prefix} getRunDetail`);
  const detail = getRunDetail(dbPath);
  console.timeEnd(`${prefix} getRunDetail`);
  if (!detail) {
    console.timeEnd(`${prefix} total`);
    return NextResponse.json({ error: 'Failed to read DB' }, { status: 500 });
  }

  // Token counts are already in detail.metadata.tokens (from GameMetadata table)
  const tokens = detail.metadata.tokens;

  console.time(`${prefix} getRunLogStats`);
  const logStats = getRunLogStats(config.telemetryDir, gameId);
  console.timeEnd(`${prefix} getRunLogStats`);

  console.time(`${prefix} getNotes`);
  const notes = getNotes(gameId);
  console.timeEnd(`${prefix} getNotes`);

  console.timeEnd(`${prefix} total`);
  return NextResponse.json({ ...detail, tokens, logStats, notes });
}
