// Client-side dashboard container that owns the search/filter state and passes
// filtered runs to all child components (summary cards, charts, runs table).

'use client';

import { useState, useMemo } from 'react';
import SummaryCards from '@/components/SummaryCards';
import WinLossChart from '@/components/WinLossChart';
import DurationTurnsChart from '@/components/DurationTurnsChart';
import TokenUsageChart from '@/components/TokenUsageChart';
import RunsTable from '@/components/RunsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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
  replayFile: string | null;
  notes: { displayName?: string; llmModel?: string; tags: string[]; excluded: boolean };
}

interface DashboardProps {
  runs: Run[];
}

export default function Dashboard({ runs }: DashboardProps) {
  const [search, setSearch] = useState('');
  const [showExcluded, setShowExcluded] = useState(true);

  const filtered = useMemo(() => {
    let list = runs;
    if (!showExcluded) list = list.filter((r) => !r.notes.excluded);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.gameId.toLowerCase().includes(q) ||
        r.notes.displayName?.toLowerCase().includes(q) ||
        r.notes.llmModel?.toLowerCase().includes(q) ||
        r.notes.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.outcome.toLowerCase().includes(q) ||
        r.aiPlayer?.Civilization?.toLowerCase().includes(q) ||
        r.modelName?.toLowerCase().includes(q) ||
        r.modelConfig?.toLowerCase().includes(q) ||
        r.gitCommit?.toLowerCase().includes(q) ||
        r.gitBranch?.toLowerCase().includes(q) ||
        r.strategists.some((s) => s.toLowerCase().includes(q))
      );
    }
    return list;
  }, [runs, search, showExcluded]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Vox Deorum AI run analytics</p>
        </div>
        <div className="flex gap-3 items-center">
          <Input
            placeholder="Search runs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} />
            Show excluded
          </label>
        </div>
      </div>

      <SummaryCards runs={filtered} totalCount={runs.length} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Win / Loss</CardTitle></CardHeader>
          <CardContent><WinLossChart runs={filtered} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Turns vs Tokens</CardTitle></CardHeader>
          <CardContent><DurationTurnsChart runs={filtered} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Token Usage</CardTitle></CardHeader>
          <CardContent><TokenUsageChart runs={filtered} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">All Runs</CardTitle></CardHeader>
        <CardContent><RunsTable runs={filtered} totalCount={runs.length} /></CardContent>
      </Card>
    </div>
  );
}
