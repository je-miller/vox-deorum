// Error span viewer with expandable attributes JSON.

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface ErrorSpan {
  name: string;
  timestamp: string;
  statusMessage: string;
  attributes: Record<string, unknown> | null;
}

interface ErrorViewerProps {
  gameId: string;
}

export default function ErrorViewer({ gameId }: ErrorViewerProps) {
  const [errors, setErrors] = useState<ErrorSpan[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/runs/${encodeURIComponent(gameId)}/errors`);
    const data = await res.json();
    setErrors(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (i: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center">
        <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        <span className="text-xs text-muted-foreground">{errors.length} errors</span>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading...</p>}

      <div className="rounded-md border border-border bg-black/30 font-mono text-xs max-h-[500px] overflow-y-auto">
        {errors.length === 0 && !loading && (
          <p className="p-4 text-muted-foreground">No errors found</p>
        )}
        {errors.map((err, i) => (
          <div key={i}>
            <div
              className="flex gap-3 px-3 py-1.5 cursor-pointer hover:bg-red-950/30 border-b border-border/30 bg-red-950/20"
              onClick={() => toggle(i)}
            >
              <span className="text-muted-foreground shrink-0">
                {err.timestamp ? new Date(err.timestamp).toLocaleTimeString() : '—'}
              </span>
              <span className="text-red-400 font-semibold shrink-0">{err.name}</span>
              <span className="text-red-300 break-all">{err.statusMessage || '(no message)'}</span>
            </div>
            {expanded.has(i) && err.attributes && (
              <pre className="px-6 py-2 text-[10px] text-muted-foreground bg-black/40 border-b border-border/30 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(err.attributes, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
