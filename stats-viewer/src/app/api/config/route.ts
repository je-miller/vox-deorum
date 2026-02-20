// API route for reading and updating app configuration (data source paths).

import { NextRequest, NextResponse } from 'next/server';
import { getConfig, setConfig } from '@/lib/config';

export function GET() {
  return NextResponse.json(getConfig());
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const updated = setConfig(body);
  return NextResponse.json(updated);
}
