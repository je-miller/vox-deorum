// API route for the DB Browser feature.
// Provides database listing, table listing, and paginated row data via query params.

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { listDatabases, validateDbPath, listTables, getTableRows } from '@/lib/db-browser';

export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const action = params.get('action');

  if (action === 'databases') {
    const config = getConfig();
    const databases = listDatabases(config);
    return NextResponse.json(databases);
  }

  if (action === 'tables') {
    const dbPath = params.get('db');
    if (!dbPath) return NextResponse.json({ error: 'Missing db parameter' }, { status: 400 });

    const config = getConfig();
    if (!validateDbPath(dbPath, config)) {
      return NextResponse.json({ error: 'Invalid database path' }, { status: 403 });
    }

    try {
      const tables = listTables(dbPath);
      return NextResponse.json(tables);
    } catch (e) {
      return NextResponse.json({ error: `Failed to list tables: ${(e as Error).message}` }, { status: 500 });
    }
  }

  if (action === 'rows') {
    const dbPath = params.get('db');
    const table = params.get('table');
    if (!dbPath || !table) {
      return NextResponse.json({ error: 'Missing db or table parameter' }, { status: 400 });
    }

    const config = getConfig();
    if (!validateDbPath(dbPath, config)) {
      return NextResponse.json({ error: 'Invalid database path' }, { status: 403 });
    }

    const limit = Math.min(Number(params.get('limit')) || 100, 1000);
    const offset = Math.max(Number(params.get('offset')) || 0, 0);
    const sortCol = params.get('sortCol') || null;
    const sortDir = params.get('sortDir') === 'desc' ? 'desc' as const : 'asc' as const;

    // Parse column filters: filter.ColName=value
    const filters: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      if (key.startsWith('filter.') && value) {
        filters[key.slice(7)] = value;
      }
    }

    try {
      const result = getTableRows(dbPath, table, { limit, offset, sortCol, sortDir, filters });
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json({ error: `Failed to fetch rows: ${(e as Error).message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action. Use: databases, tables, rows' }, { status: 400 });
}
