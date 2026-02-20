// API route for reading and updating per-run notes, tags, and metadata.

import { NextRequest, NextResponse } from 'next/server';
import { getNotes, setNotes } from '@/lib/notes';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  return NextResponse.json(getNotes(gameId));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const body = await req.json();
  const updated = setNotes(gameId, body);
  return NextResponse.json(updated);
}
