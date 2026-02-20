// Scatter chart: turns vs total tokens, colored by outcome.
// Useful for spotting whether more turns correlates with higher token usage.

'use client';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS: Record<string, string> = { Win: '#22c55e', Loss: '#ef4444', Incomplete: '#f59e0b' };

interface Run {
  gameId: string;
  turn: number;
  tokens: { total: number };
  outcome: string;
  notes: { excluded: boolean };
}

interface DurationTurnsChartProps {
  runs: Run[];
}

export default function DurationTurnsChart({ runs }: DurationTurnsChartProps) {
  const active = runs.filter((r) => !r.notes.excluded);
  const byOutcome: Record<string, { turns: number; tokens: number; gameId: string }[]> = {};
  for (const r of active) {
    if (!byOutcome[r.outcome]) byOutcome[r.outcome] = [];
    byOutcome[r.outcome].push({ turns: r.turn, tokens: Math.round(r.tokens.total / 1000), gameId: r.gameId });
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="turns" name="Turns" type="number" stroke="#71717a" tick={{ fontSize: 11 }} label={{ value: 'Turns', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#71717a' }} />
        <YAxis dataKey="tokens" name="Tokens (k)" type="number" stroke="#71717a" tick={{ fontSize: 11 }} label={{ value: 'Tokens (k)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#71717a' }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6 }} formatter={(v: number, name: string) => [name === 'Tokens (k)' ? `${v}k` : v, name]} />
        <Legend />
        {Object.entries(byOutcome).map(([outcome, points]) => (
          <Scatter key={outcome} name={outcome} data={points} fill={COLORS[outcome] ?? '#6b7280'} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
