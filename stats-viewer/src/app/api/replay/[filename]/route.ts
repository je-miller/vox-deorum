// API route for serving .Civ5Replay binary files from the configured replay directory.
// Validates the filename to prevent path traversal, then streams the file as an octet-stream.

import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import fs from 'fs';
import path from 'path';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const config = getConfig();

  if (!config.replayDir) {
    return NextResponse.json({ error: 'Replay directory not configured' }, { status: 404 });
  }

  // Validate filename: must end with .Civ5Replay, no path traversal
  if (
    !filename.endsWith('.Civ5Replay') ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const filePath = path.join(config.replayDir, filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
    },
  });
}
