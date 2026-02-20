// Run detail page with tabs: Overview, Victory, Decisions, Logs, Notes.

import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import RunNotes from '@/components/RunNotes';
import LogViewer from '@/components/LogViewer';
import VictoryProgressPanel from '@/components/VictoryProgressPanel';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const outcomeVariant: Record<string, 'success' | 'destructive' | 'warning'> = {
  Win: 'success',
  Loss: 'destructive',
  Incomplete: 'warning',
};

async function getRunDetail(gameId: string) {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${base}/api/runs/${encodeURIComponent(gameId)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function fmt(ms: number): string {
  if (ms === 0) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export default async function RunDetailPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const detail = await getRunDetail(gameId);
  if (!detail) notFound();

  const { metadata, aiPlayer, victoryResult, victoryProgress, aiSummary, policies, strategies, outcome, tokens, logStats, notes } = detail;
  // lastSave is a millisecond Unix timestamp string — convert to number before passing to Date.
  const lastSaveDate = metadata.lastSave ? new Date(Number(metadata.lastSave)).toLocaleString() : '—';

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold font-mono">{notes.displayName ?? gameId}</h1>
          <p className="text-muted-foreground text-sm">{lastSaveDate}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant={outcomeVariant[outcome] ?? 'secondary'}>{outcome}</Badge>
          {metadata.victoryType && <Badge variant="outline">{metadata.victoryType}</Badge>}
          {notes.llmModel && <Badge variant="secondary">{notes.llmModel}</Badge>}
        </div>
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Turns</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{metadata.turn}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Duration</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{fmt(logStats.durationMs)}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Tokens</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{tokens.total > 0 ? tokens.total.toLocaleString() : '—'}</p></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Errors</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{logStats.errorCount}</p></CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="victory">Victory</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">AI Player Summary</CardTitle></CardHeader>
            <CardContent>
              {aiPlayer && (
                <div className="mb-4">
                  <p className="text-sm"><span className="text-muted-foreground">Civilization: </span>{aiPlayer.CivilizationTypeName?.replace('CIVILIZATION_', '')}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Leader: </span>{aiPlayer.LeaderTypeName?.replace('LEADER_', '')}</p>
                </div>
              )}
              {aiSummary ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                  <div><p className="text-muted-foreground text-xs">Score</p><p className="font-semibold">{aiSummary.Score}</p></div>
                  <div><p className="text-muted-foreground text-xs">Era</p><p className="font-semibold">{aiSummary.Era ?? '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Cities</p><p className="font-semibold">{aiSummary.NumCities}</p></div>
                  <div><p className="text-muted-foreground text-xs">Military</p><p className="font-semibold">{aiSummary.MilitaryMight}</p></div>
                  <div><p className="text-muted-foreground text-xs">Gold/turn</p><p className="font-semibold">{aiSummary.GoldPerTurn}</p></div>
                  <div><p className="text-muted-foreground text-xs">Research/turn</p><p className="font-semibold">{aiSummary.ResearchPerTurn}</p></div>
                  <div><p className="text-muted-foreground text-xs">Culture/turn</p><p className="font-semibold">{aiSummary.CulturePerTurn}</p></div>
                  <div><p className="text-muted-foreground text-xs">Faith/turn</p><p className="font-semibold">{aiSummary.FaithPerTurn}</p></div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No player summary data available</p>
              )}

              <Separator className="my-4" />
              <h3 className="text-sm font-medium mb-2">Token Breakdown</h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Input</p><p className="font-semibold">{tokens.input.toLocaleString()}</p></div>
                <div><p className="text-muted-foreground text-xs">Output</p><p className="font-semibold">{tokens.output.toLocaleString()}</p></div>
                <div><p className="text-muted-foreground text-xs">Reasoning</p><p className="font-semibold">{tokens.reasoning.toLocaleString()}</p></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="victory" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Victory Progress</CardTitle></CardHeader>
            <CardContent><VictoryProgressPanel progress={victoryProgress ?? []} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decisions" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Policy Changes</CardTitle></CardHeader>
              <CardContent>
                {policies && policies.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {policies.map((p: { Turn: number; PolicyBranch: string; PolicyName: string }, i: number) => (
                      <div key={i} className="flex gap-2 text-xs border-b border-border pb-1">
                        <span className="text-muted-foreground w-12 shrink-0">T{p.Turn}</span>
                        <span>{p.PolicyName?.replace('POLICY_', '') ?? '—'}</span>
                        <span className="text-muted-foreground">({p.PolicyBranch?.replace('POLICY_BRANCH_', '')})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No policy changes recorded</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Strategy Changes</CardTitle></CardHeader>
              <CardContent>
                {strategies && strategies.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {strategies.map((s: { Turn: number; Strategy: string; Reasoning: string | null }, i: number) => (
                      <div key={i} className="text-xs border-b border-border pb-2">
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-12 shrink-0">T{s.Turn}</span>
                          <span className="font-medium">{s.Strategy}</span>
                        </div>
                        {s.Reasoning && <p className="text-muted-foreground mt-1 ml-14">{s.Reasoning}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No strategy changes recorded</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Log Entries</CardTitle></CardHeader>
            <CardContent><LogViewer gameId={gameId} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Notes & Tags</CardTitle></CardHeader>
            <CardContent><RunNotes gameId={gameId} initial={notes} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
