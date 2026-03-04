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

  console.time(`${prefix} getTotalTokens`);
  const tokens = getTotalTokens(config.telemetryDir, gameId);
  console.timeEnd(`${prefix} getTotalTokens`);

  console.time(`${prefix} getRunLogStats`);
  const logStats = await getRunLogStats(config.logsDir, gameId);
  console.timeEnd(`${prefix} getRunLogStats`);

  console.time(`${prefix} getNotes`);
  const notes = getNotes(gameId);
  console.timeEnd(`${prefix} getNotes`);

  console.timeEnd(`${prefix} total`);
  return NextResponse.json({ ...detail, tokens, logStats, notes });
}
