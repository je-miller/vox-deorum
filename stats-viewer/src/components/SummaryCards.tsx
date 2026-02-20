// Summary metric cards for the dashboard: total runs, win rate, avg turns, avg tokens.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Run {
  outcome: string;
  turn: number;
  tokens: { total: number };
  notes: { excluded: boolean };
}

interface SummaryCardsProps {
  runs: Run[];
}

export default function SummaryCards({ runs }: SummaryCardsProps) {
  const active = runs.filter((r) => !r.notes.excluded);
  const wins = active.filter((r) => r.outcome === 'Win').length;
  const winRate = active.length > 0 ? ((wins / active.length) * 100).toFixed(1) : '0';
  const avgTurns =
    active.length > 0 ? Math.round(active.reduce((s, r) => s + r.turn, 0) / active.length) : 0;
  const avgTokens =
    active.length > 0
      ? Math.round(active.reduce((s, r) => s + r.tokens.total, 0) / active.length)
      : 0;

  function fmtTokens(n: number): string {
    if (n === 0) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Runs</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{active.length}</p><p className="text-xs text-muted-foreground">{runs.length} total</p></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{winRate}%</p><p className="text-xs text-muted-foreground">{wins} wins</p></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Turns</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{avgTurns}</p></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Tokens</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{fmtTokens(avgTokens)}</p></CardContent>
      </Card>
    </div>
  );
}
