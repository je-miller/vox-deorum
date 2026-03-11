// API route for reading and updating app configuration (data source paths).
// Returns rawReplayDir alongside resolved config so the frontend can distinguish
// the stored global replay path from a profile-resolved one.

import { NextRequest, NextResponse } from 'next/server';
import { getConfig, getRawConfig, setConfig } from '@/lib/config';

function configWithRaw() {
  return { ...getConfig(), rawReplayDir: getRawConfig().replayDir };
}

export function GET() {
  return NextResponse.json(configWithRaw());
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  // Strip rawReplayDir from input — it's a read-only computed field
  delete body.rawReplayDir;
  setConfig(body);
  return NextResponse.json(configWithRaw());
}
