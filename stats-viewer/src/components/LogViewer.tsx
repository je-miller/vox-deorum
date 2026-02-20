// Filterable log entry viewer with error highlighting and search.

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

interface LogViewerProps {
  gameId: string;
}

const levelColor: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-blue-300',
  debug: 'text-muted-foreground',
};

export default function LogViewer({ gameId }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (search) params.set('search', search);
    params.set('limit', '500');
    const res = await fetch(`/api/runs/${encodeURIComponent(gameId)}/logs?${params}`);
    const data = await res.json();
    setLogs(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [gameId, level, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center flex-wrap">
        <Input
          placeholder="Search logs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={level || 'all'} onValueChange={(v) => setLevel(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        <span className="text-xs text-muted-foreground">{logs.length} entries</span>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading...</p>}

      <div className="rounded-md border border-border bg-black/30 font-mono text-xs max-h-[500px] overflow-y-auto">
        {logs.length === 0 && !loading && (
          <p className="p-4 text-muted-foreground">No log entries found</p>
        )}
        {logs.map((entry, i) => (
          <div
            key={i}
            className={`flex gap-3 px-3 py-1 hover:bg-white/5 border-b border-border/30 ${entry.level === 'error' ? 'bg-red-950/20' : ''}`}
          >
            <span className="text-muted-foreground shrink-0">{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—'}</span>
            <span className={`w-10 shrink-0 font-semibold uppercase ${levelColor[entry.level] ?? ''}`}>{entry.level}</span>
            <span className="break-all">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
