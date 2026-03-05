// Full-screen DB Browser client component.
// Lets users explore raw SQLite table data from any game or telemetry database.

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DatabaseEntry {
  name: string;
  path: string;
  type: 'game' | 'telemetry';
}

interface ColumnDef {
  name: string;
  type: string;
  pk: boolean;
}

interface TableData {
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  totalCount: number;
}

const PAGE_SIZES = [50, 100, 250];

export default function DbBrowser() {
  const searchParams = useSearchParams();
  const gameIdParam = searchParams.get('gameId');

  const [databases, setDatabases] = useState<DatabaseEntry[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [offset, setOffset] = useState(0);

  // Fetch database list on mount
  useEffect(() => {
    fetch('/api/db-browser?action=databases')
      .then((r) => r.json())
      .then((dbs: DatabaseEntry[]) => {
        setDatabases(dbs);
        // Auto-select database matching gameId URL param
        if (gameIdParam) {
          const match = dbs.find((db) => db.type === 'game' && db.name.includes(gameIdParam));
          if (match) setSelectedDb(match.path);
        }
      })
      .catch(() => { /* server unavailable — leave databases empty */ });
  }, [gameIdParam]);

  // Fetch tables when database changes
  useEffect(() => {
    if (!selectedDb) {
      setTables([]);
      setSelectedTable('');
      setData(null);
      return;
    }
    fetch(`/api/db-browser?action=tables&db=${encodeURIComponent(selectedDb)}`)
      .then((r) => r.json())
      .then((t: string[]) => {
        setTables(t);
        setSelectedTable('');
        setData(null);
      })
      .catch(() => { /* leave tables empty on error */ });
  }, [selectedDb]);

  // Fetch rows when table or pagination changes
  const fetchRows = useCallback(() => {
    if (!selectedDb || !selectedTable) return;
    setLoading(true);
    fetch(`/api/db-browser?action=rows&db=${encodeURIComponent(selectedDb)}&table=${encodeURIComponent(selectedTable)}&limit=${pageSize}&offset=${offset}`)
      .then((r) => r.json())
      .then((result: TableData) => {
        setData(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedDb, selectedTable, pageSize, offset]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleTableChange = (table: string) => {
    setSelectedTable(table);
    setOffset(0);
  };

  const handlePageSizeChange = (size: string) => {
    setPageSize(Number(size));
    setOffset(0);
  };

  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 0;
  const currentPage = Math.floor(offset / pageSize) + 1;

  const gameDbs = databases.filter((d) => d.type === 'game');
  const telemetryDbs = databases.filter((d) => d.type === 'telemetry');

  // Format cell values for display
  const formatCell = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-4">
      {/* Top controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Database selector */}
        <Select value={selectedDb} onValueChange={setSelectedDb}>
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Select database..." />
          </SelectTrigger>
          <SelectContent>
            {gameDbs.length > 0 && (
              <SelectGroup>
                <SelectLabel>Game Databases</SelectLabel>
                {gameDbs.map((db) => (
                  <SelectItem key={db.path} value={db.path}>
                    {db.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {telemetryDbs.length > 0 && (
              <SelectGroup>
                <SelectLabel>Telemetry Databases</SelectLabel>
                {telemetryDbs.map((db) => (
                  <SelectItem key={db.path} value={db.path}>
                    {db.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        {/* Table selector */}
        <Select value={selectedTable} onValueChange={handleTableChange} disabled={tables.length === 0}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select table..." />
          </SelectTrigger>
          <SelectContent>
            {tables.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Row count */}
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.totalCount.toLocaleString()} rows
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Pagination controls */}
        {data && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={offset + pageSize >= data.totalCount}
              onClick={() => setOffset(offset + pageSize)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Page size selector */}
        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>{s} rows</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Data table */}
      {loading && (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      )}

      {!loading && !data && selectedDb && selectedTable && (
        <div className="text-center py-12 text-muted-foreground">No data</div>
      )}

      {!loading && !selectedDb && (
        <div className="text-center py-12 text-muted-foreground">Select a database to get started</div>
      )}

      {!loading && data && (
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {data.columns.map((col) => (
                  <th key={col.name} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {col.name}
                      {col.pk && <Badge variant="outline" className="text-[10px] px-1 py-0">PK</Badge>}
                      <span className="text-[10px] text-muted-foreground font-normal">{col.type}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr><td colSpan={data.columns.length} className="text-center py-8 text-muted-foreground">Empty table</td></tr>
              )}
              {data.rows.map((row, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/20 transition-colors">
                  {data.columns.map((col) => {
                    const cellValue = formatCell(row[col.name]);
                    return (
                      <td
                        key={col.name}
                        className="px-3 py-1.5 font-mono text-xs max-w-[300px] truncate"
                        title={cellValue}
                      >
                        {row[col.name] === null
                          ? <span className="text-muted-foreground/50 italic">NULL</span>
                          : cellValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
