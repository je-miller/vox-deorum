// Summary metric cards for the dashboard: completed runs, win rate, avg turns, avg tokens.
// Incomplete runs are excluded from stats and charts.

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
  const completed = active.filter((r) => r.outcome !== 'Incomplete');
  const wins = completed.filter((r) => r.outcome === 'Win').length;
  const losses = completed.filter((r) => r.outcome === 'Loss').length;
  const winRate = completed.length > 0 ? ((wins / completed.length) * 100).toFixed(1) : '0';
  const totalTurns = completed.reduce((s, r) => s + r.turn, 0);
  const avgTurns = completed.length > 0 ? Math.round(totalTurns / completed.length) : 0;
  const totalTokens = completed.reduce((s, r) => s + r.tokens.total, 0);
  const avgTokens = completed.length > 0 ? Math.round(totalTokens / completed.length) : 0;

  function fmtTokens(n: number): string {
    if (n === 0) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Completed Runs</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{completed.length}</p><p className="text-xs text-muted-foreground">{runs.length} total</p></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{winRate}%</p><p className="text-xs text-muted-foreground">{wins}W / {losses}L</p></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Turns</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{avgTurns}</p><p className="text-xs text-muted-foreground">{fmtTokens(totalTurns)} total</p></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Tokens</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold">{fmtTokens(avgTokens)}</p><p className="text-xs text-muted-foreground">{fmtTokens(totalTokens)} total</p></CardContent>
      </Card>
    </div>
  );
}
