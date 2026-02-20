// Bar chart showing input/output token usage per run.

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Run {
  gameId: string;
  tokens: { input: number; output: number };
  notes: { excluded: boolean; displayName?: string };
}

interface TokenUsageChartProps {
  runs: Run[];
}

export default function TokenUsageChart({ runs }: TokenUsageChartProps) {
  const active = runs.filter((r) => !r.notes.excluded && r.tokens.input + r.tokens.output > 0);
  const data = active.map((r) => ({
    name: r.notes.displayName ?? r.gameId.slice(0, 8),
    Input: r.tokens.input,
    Output: r.tokens.output,
  }));

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No token data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 10 }} />
        <YAxis stroke="#71717a" tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6 }} />
        <Legend />
        <Bar dataKey="Input" fill="#3b82f6" />
        <Bar dataKey="Output" fill="#8b5cf6" />
      </BarChart>
    </ResponsiveContainer>
  );
}
