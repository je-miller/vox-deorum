// API route for fetching full detail for a single run.

import { NextRequest, NextResponse } from 'next/server';
import { findGameDbs, getRunDetail } from '@/lib/db';
import { getTotalTokens } from '@/lib/telemetry';
import { getRunLogStats } from '@/lib/logs';
import { getNotes } from '@/lib/notes';
import { getConfig } from '@/lib/config';
import path from 'path';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const config = getConfig();
  const dbFiles = findGameDbs(config.dbDir);

  // Find the DB file matching this gameId (by filename or internal gameId)
  let dbPath = dbFiles.find((f) => path.basename(f, '.db') === gameId);
  if (!dbPath) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const detail = getRunDetail(dbPath);
  if (!detail) return NextResponse.json({ error: 'Failed to read DB' }, { status: 500 });

  const tokens = getTotalTokens(config.telemetryDir, gameId);
  const logStats = await getRunLogStats(config.logsDir, gameId);
  const notes = getNotes(gameId);

  return NextResponse.json({ ...detail, tokens, logStats, notes });
}
