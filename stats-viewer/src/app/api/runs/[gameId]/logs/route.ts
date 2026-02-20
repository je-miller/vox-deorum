// API route for fetching log entries for a specific run with filtering.

import { NextRequest, NextResponse } from 'next/server';
import { getRunLogs } from '@/lib/logs';
import { getConfig } from '@/lib/config';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const config = getConfig();
  const { searchParams } = req.nextUrl;

  const level = searchParams.get('level') ?? undefined;
  const search = searchParams.get('search') ?? undefined;
  const limit = parseInt(searchParams.get('limit') ?? '500', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const logs = await getRunLogs(config.logsDir, gameId, { level, search, limit, offset });
  return NextResponse.json(logs);
}
