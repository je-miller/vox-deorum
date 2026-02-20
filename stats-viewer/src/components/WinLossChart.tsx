// Pie chart showing Win / Loss / Incomplete breakdown of active runs.

'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS: Record<string, string> = {
  Win: '#22c55e',
  Loss: '#ef4444',
  Incomplete: '#f59e0b',
};

interface Run {
  outcome: string;
  notes: { excluded: boolean };
}

interface WinLossChartProps {
  runs: Run[];
}

export default function WinLossChart({ runs }: WinLossChartProps) {
  const active = runs.filter((r) => !r.notes.excluded);
  const counts: Record<string, number> = { Win: 0, Loss: 0, Incomplete: 0 };
  for (const r of active) {
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  }
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
          {data.map((entry) => (
            <Cell key={entry.name} fill={COLORS[entry.name] ?? '#6b7280'} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6 }} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
