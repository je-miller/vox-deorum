// Dashboard page: summary cards, charts, and runs table.

import SummaryCards from '@/components/SummaryCards';
import WinLossChart from '@/components/WinLossChart';
import DurationTurnsChart from '@/components/DurationTurnsChart';
import TokenUsageChart from '@/components/TokenUsageChart';
import RunsTable from '@/components/RunsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function getRuns() {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${base}/api/runs`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const runs = await getRuns();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Vox Deorum AI run analytics</p>
      </div>

      <SummaryCards runs={runs} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Win / Loss</CardTitle></CardHeader>
          <CardContent><WinLossChart runs={runs} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Turns vs Tokens</CardTitle></CardHeader>
          <CardContent><DurationTurnsChart runs={runs} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Token Usage</CardTitle></CardHeader>
          <CardContent><TokenUsageChart runs={runs} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">All Runs</CardTitle></CardHeader>
        <CardContent><RunsTable runs={runs} /></CardContent>
      </Card>
    </div>
  );
}
