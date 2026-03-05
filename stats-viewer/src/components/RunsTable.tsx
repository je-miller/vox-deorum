// Sortable, filterable runs table for the dashboard.

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Database } from 'lucide-react';

interface Run {
  gameId: string;
  turn: number;
  lastSave: string;
  outcome: 'Win' | 'Loss' | 'Incomplete';
  aiPlayer: { Civilization: string } | null;
  victoryType: string | null;
  tokens: { input: number; output: number; total: number };
  durationMs: number;
  errorCount: number;
  modelName: string | null;
  modelConfig: string | null;
  gitCommit: string | null;
  gitBranch: string | null;
  gitRemote: string | null;
  strategists: string[];
  notes: { displayName?: string; llmModel?: string; tags: string[]; excluded: boolean };
}

type SortKey = 'lastSave' | 'turn' | 'outcome' | 'tokens' | 'duration' | 'errors';

const outcomeVariant: Record<string, 'success' | 'destructive' | 'warning'> = {
  Win: 'success',
  Loss: 'destructive',
  Incomplete: 'warning',
};

// lastSave is stored as a millisecond Unix timestamp string.
function fmtDate(lastSave: string): string {
  if (!lastSave) return '—';
  const ts = Number(lastSave);
  if (isNaN(ts) || ts === 0) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtDuration(ms: number): string {
  if (ms === 0) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function fmtNum(n: number): string {
  if (n === 0) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function RunsTable({ runs, totalCount }: { runs: Run[]; totalCount: number }) {
  const [sort, setSort] = useState<SortKey>('lastSave');
  const [asc, setAsc] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setAsc(!asc);
    else { setSort(key); setAsc(false); }
  };

  const sorted = useMemo(() => {
    return [...runs].sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      if (sort === 'lastSave') { va = Number(a.lastSave); vb = Number(b.lastSave); }
      else if (sort === 'turn') { va = a.turn; vb = b.turn; }
      else if (sort === 'outcome') { va = a.outcome; vb = b.outcome; }
      else if (sort === 'tokens') { va = a.tokens.total; vb = b.tokens.total; }
      else if (sort === 'duration') { va = a.durationMs; vb = b.durationMs; }
      else if (sort === 'errors') { va = a.errorCount; vb = b.errorCount; }
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
  }, [runs, sort, asc]);

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-1 hover:text-foreground text-muted-foreground"
    >
      {label} <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left font-medium"><SortBtn k="lastSave" label="Run" /></th>
              <th className="px-3 py-2 text-left font-medium"><SortBtn k="lastSave" label="Date" /></th>
              <th className="px-3 py-2 text-left font-medium"><SortBtn k="outcome" label="Outcome" /></th>
              <th className="px-3 py-2 text-left font-medium">Civilization</th>
              <th className="px-3 py-2 text-left font-medium">Victory</th>
              <th className="px-3 py-2 text-right font-medium"><SortBtn k="turn" label="Turns" /></th>
              <th className="px-3 py-2 text-right font-medium"><SortBtn k="duration" label="Duration" /></th>
              <th className="px-3 py-2 text-right font-medium"><SortBtn k="errors" label="Errors" /></th>
              <th className="px-3 py-2 text-right font-medium"><SortBtn k="tokens" label="In Tokens" /></th>
              <th className="px-3 py-2 text-right font-medium">Out Tokens</th>
              <th className="px-3 py-2 text-left font-medium">Model</th>
              <th className="px-3 py-2 text-left font-medium">Strategist</th>
              <th className="px-3 py-2 text-left font-medium">Git</th>
              <th className="px-3 py-2 text-left font-medium">Tags</th>
              <th className="px-3 py-2 text-center font-medium">DB</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={15} className="text-center py-8 text-muted-foreground">No runs found</td></tr>
            )}
            {sorted.map((run) => (
              <tr
                key={run.gameId}
                className={`border-b border-border hover:bg-muted/20 transition-colors ${run.notes.excluded ? 'opacity-40' : ''}`}
              >
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`/runs/${encodeURIComponent(run.gameId)}`} className="hover:underline text-blue-400 hover:text-blue-300">
                    {run.notes.displayName ?? run.gameId.slice(0, 12)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(run.lastSave)}</td>
                <td className="px-3 py-2">
                  <Badge variant={outcomeVariant[run.outcome] ?? 'secondary'}>{run.outcome}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">{run.aiPlayer?.Civilization ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{run.victoryType ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{run.turn}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtDuration(run.durationMs)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {run.errorCount > 0 ? <span className="text-red-400 font-semibold">{run.errorCount}</span> : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(run.tokens.input)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(run.tokens.output)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{run.modelName ?? run.modelConfig ?? run.notes.llmModel ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{run.strategists.length > 0 ? run.strategists.join(', ') : '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground"><div title={run.gitRemote ?? '—'}>{run.gitCommit ? run.gitCommit.slice(0, 10) : '—'}</div>{run.gitBranch}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {run.notes.tags.map((t) => (
                      <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-xs">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <Link href={`/db-browser?gameId=${encodeURIComponent(run.gameId)}`}>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Database className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{runs.length} of {totalCount} runs</p>
    </div>
  );
}
