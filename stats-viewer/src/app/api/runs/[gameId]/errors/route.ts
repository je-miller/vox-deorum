// API route for fetching error spans (statusCode == 2) from telemetry.

import { NextRequest, NextResponse } from 'next/server';
import { getErrorSpans } from '@/lib/telemetry';
import { getConfig } from '@/lib/config';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const prefix = `[runs/${gameId}/errors]`;
  console.time(`${prefix} total`);

  const config = getConfig();

  console.time(`${prefix} getErrorSpans`);
  const errors = getErrorSpans(config.telemetryDir, gameId);
  console.timeEnd(`${prefix} getErrorSpans`);

  console.timeEnd(`${prefix} total`);
  return NextResponse.json(errors);
}
