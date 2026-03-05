// Full-screen DB Browser client component.
// Lets users explore raw SQLite table data from any game or telemetry database.
// Clicking a row opens a side flyout showing all column values in a vertical layout.
// Sorting and filtering are server-side (SQL) so they apply across all rows in the table.

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, X, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';

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

// Formats a value for the flyout — pretty-prints JSON objects.
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

// Format cell values for inline table display (single line)
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function DbBrowser() {
  const searchParams = useSearchParams();
  const gameIdParam = searchParams.get('gameId');
  const typeParam = searchParams.get('type');

  const [databases, setDatabases] = useState<DatabaseEntry[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [offset, setOffset] = useState(0);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // Sorting state — sent to server
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Filtering state — sent to server. Debounced to avoid spamming requests.
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [debouncedFilters, setDebouncedFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(true);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preserve scroll position across data reloads (filter, sort, page changes)
  const scrollPosRef = useRef(0);

  // Debounce filter changes (300ms)
  useEffect(() => {
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => {
      setDebouncedFilters(filters);
      setOffset(0);
    }, 300);
    return () => { if (filterTimerRef.current) clearTimeout(filterTimerRef.current); };
  }, [filters]);

  // Fetch database list on mount
  useEffect(() => {
    fetch('/api/db-browser?action=databases')
      .then((r) => r.json())
      .then((dbs: DatabaseEntry[]) => {
        setDatabases(dbs);
        if (gameIdParam) {
          const dbType = typeParam === 'telemetry' ? 'telemetry' : 'game';
          const match = dbs.find((db) => db.type === dbType && db.name.includes(gameIdParam));
          if (match) setSelectedDb(match.path);
        }
      })
      .catch(() => { /* server unavailable */ });
  }, [gameIdParam, typeParam]);

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
        setData(null);
        const dbEntry = databases.find((d) => d.path === selectedDb);
        const defaultTable =
          dbEntry?.type === 'game' && t.includes('GameMetadata') ? 'GameMetadata'
          : dbEntry?.type === 'telemetry' && t.includes('spans') ? 'spans'
          : '';
        setSelectedTable(defaultTable);
        setOffset(0);
      })
      .catch(() => { /* leave tables empty on error */ });
  }, [selectedDb]);

  // Fetch rows — includes sort and filter params sent to server
  const fetchRows = useCallback(() => {
    if (!selectedDb || !selectedTable) return;
    scrollPosRef.current = window.scrollY;
    setLoading(true);
    setSelectedRowIndex(null);

    const url = new URL('/api/db-browser', window.location.origin);
    url.searchParams.set('action', 'rows');
    url.searchParams.set('db', selectedDb);
    url.searchParams.set('table', selectedTable);
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('offset', String(offset));
    if (sortCol) {
      url.searchParams.set('sortCol', sortCol);
      url.searchParams.set('sortDir', sortAsc ? 'asc' : 'desc');
    }
    for (const [col, term] of Object.entries(debouncedFilters)) {
      if (term) url.searchParams.set(`filter.${col}`, term);
    }

    fetch(url.toString())
      .then((r) => r.json())
      .then((result: TableData) => {
        setData(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedDb, selectedTable, pageSize, offset, sortCol, sortAsc, debouncedFilters]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Restore scroll position after data loads
  useEffect(() => {
    if (!loading && data) {
      window.scrollTo(0, scrollPosRef.current);
    }
  }, [loading, data]);

  const handleTableChange = (table: string) => {
    setSelectedTable(table);
    setOffset(0);
    setSelectedRowIndex(null);
    setSortCol(null);
    setFilters({});
    setDebouncedFilters({});
  };

  const handlePageSizeChange = (size: string) => {
    setPageSize(Number(size));
    setOffset(0);
  };

  const toggleSort = (colName: string) => {
    if (sortCol === colName) {
      if (sortAsc) { setSortAsc(false); }
      else { setSortCol(null); setSortAsc(true); }
    } else {
      setSortCol(colName);
      setSortAsc(true);
    }
    setOffset(0);
  };

  const setFilter = (colName: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[colName] = value;
      else delete next[colName];
      return next;
    });
  };

  const clearFilters = () => {
    setFilters({});
    setDebouncedFilters({});
    setOffset(0);
  };

  const activeFilterCount = Object.keys(debouncedFilters).length;
  const pendingFilterCount = Object.keys(filters).length;
  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 0;
  const currentPage = Math.floor(offset / pageSize) + 1;

  const gameDbs = databases.filter((d) => d.type === 'game');
  const telemetryDbs = databases.filter((d) => d.type === 'telemetry');

  const selectedRow = selectedRowIndex !== null && data?.rows[selectedRowIndex] ? data.rows[selectedRowIndex] : null;
  const flyoutOpen = selectedRow !== null;

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

        {/* Filter toggle */}
        {data && (
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
            {(activeFilterCount > 0 || pendingFilterCount > 0) && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                {Math.max(activeFilterCount, pendingFilterCount)}
              </Badge>
            )}
          </Button>
        )}

        {/* Clear filters */}
        {(activeFilterCount > 0 || pendingFilterCount > 0) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
            Clear filters
          </Button>
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

      {/* Data table + flyout wrapper */}
      <div className="flex gap-0">
        {/* Data table */}
        <div className={`min-w-0 ${flyoutOpen ? 'flex-1' : 'w-full'}`}>
          {loading && !data && (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          )}

          {!loading && !data && selectedDb && selectedTable && (
            <div className="text-center py-12 text-muted-foreground">No data</div>
          )}

          {!loading && !selectedDb && (
            <div className="text-center py-12 text-muted-foreground">Select a database to get started</div>
          )}

          {data && (
            <div className={`rounded-md border border-border overflow-x-auto transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
              <table className="w-full text-sm">
                <thead>
                  {/* Column headers with sort */}
                  <tr className="border-b border-border bg-muted/40">
                    {data.columns.map((col) => (
                      <th key={col.name} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        <button
                          className="flex items-center gap-1.5 hover:text-foreground text-muted-foreground"
                          onClick={() => toggleSort(col.name)}
                        >
                          {col.name}
                          {col.pk && <Badge variant="outline" className="text-[10px] px-1 py-0">PK</Badge>}
                          <span className="text-[10px] text-muted-foreground font-normal">{col.type}</span>
                          {sortCol === col.name
                            ? (sortAsc
                              ? <ArrowUp className="h-3 w-3 text-foreground" />
                              : <ArrowDown className="h-3 w-3 text-foreground" />)
                            : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </button>
                      </th>
                    ))}
                  </tr>
                  {/* Per-column filter inputs */}
                  {showFilters && (
                    <tr className="border-b border-border bg-muted/20">
                      {data.columns.map((col) => (
                        <th key={col.name} className="px-2 py-1">
                          <input
                            type="text"
                            placeholder="Filter..."
                            value={filters[col.name] ?? ''}
                            onChange={(e) => setFilter(col.name, e.target.value)}
                            className="w-full bg-black border border-border rounded px-2 py-1 text-xs font-mono font-normal placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr><td colSpan={data.columns.length} className="text-center py-8 text-muted-foreground">
                      {activeFilterCount > 0 ? 'No rows match filters' : 'Empty table'}
                    </td></tr>
                  )}
                  {data.rows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-border cursor-pointer transition-colors ${
                        selectedRowIndex === i ? 'bg-muted/40' : 'hover:bg-muted/20'
                      }`}
                      onClick={() => setSelectedRowIndex(selectedRowIndex === i ? null : i)}
                    >
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

        {/* Row detail flyout */}
        {flyoutOpen && data && selectedRow && (
          <div className="w-[420px] shrink-0 ml-4 rounded-md border border-border bg-black overflow-y-auto max-h-[calc(100vh-200px)]">
            <div className="sticky top-0 bg-black border-b border-border px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-medium">Row {offset + selectedRowIndex! + 1}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedRowIndex(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="divide-y divide-border">
              {data.columns.map((col) => {
                const val = formatValue(selectedRow[col.name]);
                const isNull = selectedRow[col.name] === null || selectedRow[col.name] === undefined;
                const isLong = val.length > 80 || val.includes('\n');
                return (
                  <div key={col.name} className="px-4 py-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-medium text-muted-foreground">{col.name}</span>
                      {col.pk && <Badge variant="outline" className="text-[10px] px-1 py-0">PK</Badge>}
                      <span className="text-[10px] text-muted-foreground/60">{col.type}</span>
                    </div>
                    {isNull ? (
                      <span className="text-xs text-muted-foreground/50 italic font-mono">NULL</span>
                    ) : isLong ? (
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/20 rounded px-2 py-1.5 max-h-[300px] overflow-y-auto">{val}</pre>
                    ) : (
                      <span className="text-xs font-mono break-all">{val}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
