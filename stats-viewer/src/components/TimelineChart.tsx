// Timeline visualization: plots Score/Military/Science curves per player with game event markers.
// Lazy-loads data from /api/runs/{gameId}/timeline on mount (same pattern as LogViewer).
// Includes event markers (wars, milestones, progression) overlaid on the chart with colored reference lines.
// Supports metric switching (Score, Military, Science) and includes a brush for large datasets (>200 turns).

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Brush, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  TimelinePlayer,
  TimelineDataPoint,
  TimelineEvent,
  TimelineData,
} from '@/lib/db.js';

interface TimelineChartProps {
  gameId: string;
}

type Metric = 'score' | 'militaryStrength' | 'sciencePerTurn';

const metricLabels: Record<Metric, string> = {
  score: 'Score',
  militaryStrength: 'Military',
  sciencePerTurn: 'Science',
};

// Player line colors — AI player gets index 0 (bright), opponents get subsequent colors.
const playerColors = [
  '#3b82f6', // blue (AI)
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
];

// Event category colors for reference lines and legend dots.
const categoryColors: Record<string, string> = {
  war: '#ef4444',
  progression: '#f59e0b',
  milestone: '#3b82f6',
};

// Transforms flat series array into per-turn objects indexed by player and metric.
// Produces: { turn: N, score_0: X, score_1: Y, military_0: Z, ... } for use in Recharts.
function pivotSeries(series: TimelineDataPoint[], players: TimelinePlayer[]) {
  const byTurn = new Map<number, Record<string, number>>();
  for (const pt of series) {
    let row = byTurn.get(pt.turn);
    if (!row) {
      row = { turn: pt.turn };
      byTurn.set(pt.turn, row);
    }
    row[`score_${pt.playerId}`] = pt.score;
    row[`military_${pt.playerId}`] = pt.militaryStrength;
    row[`science_${pt.playerId}`] = pt.sciencePerTurn;
  }
  return Array.from(byTurn.values()).sort((a, b) => a.turn - b.turn);
}

// Groups timeline events by turn for efficient tooltip lookup during chart hover.
function groupEventsByTurn(events: TimelineEvent[]): Map<number, TimelineEvent[]> {
  const map = new Map<number, TimelineEvent[]>();
  for (const e of events) {
    const arr = map.get(e.turn);
    if (arr) arr.push(e);
    else map.set(e.turn, [e]);
  }
  return map;
}

// Deduplicates event reference lines to show exactly one line per turn.
// Prioritizes by category: 'war' is shown if present, then 'milestone', then 'progression'.
// Returns unique turns with their priority category for reference line rendering.
function uniqueEventTurns(events: TimelineEvent[]): { turn: number; category: string }[] {
  const seen = new Map<number, string>();
  for (const e of events) {
    const existing = seen.get(e.turn);
    if (!existing || (e.category === 'war' && existing !== 'war')) {
      seen.set(e.turn, e.category);
    }
  }
  return Array.from(seen.entries()).map(([turn, category]) => ({ turn, category }));
}

export default function TimelineChart({ gameId }: TimelineChartProps) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>('score');
  const [highlightedTurn, setHighlightedTurn] = useState<number | null>(null);
  const eventRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(gameId)}/timeline`);
      if (res.ok) setData(await res.json());
    } catch {
      // silently fail — shows empty state
    }
    setLoading(false);
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return pivotSeries(data.series, data.players);
  }, [data]);

  const eventsByTurn = useMemo(() => {
    if (!data) return new Map<number, TimelineEvent[]>();
    return groupEventsByTurn(data.events);
  }, [data]);

  const eventLines = useMemo(() => {
    if (!data) return [];
    return uniqueEventTurns(data.events);
  }, [data]);

  // Finds the nearest event to the clicked turn and scrolls it into view.
  const handleChartClick = useCallback((chartData: any) => {
    if (!chartData?.activeLabel || !data?.events.length) return;
    const turn = chartData.activeLabel as number;

    // Find the event closest to the clicked turn.
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < data.events.length; i++) {
      const d = Math.abs(data.events[i].turn - turn);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }

    const target = data.events[bestIdx];
    setHighlightedTurn(target.turn);
    eventRefsMap.current.get(bestIdx)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [data]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-20 bg-muted animate-pulse rounded" />
          ))}
        </div>
        <div className="h-[400px] bg-muted/30 animate-pulse rounded" />
      </div>
    );
  }

  if (!data || data.series.length === 0) {
    return <p className="text-muted-foreground text-sm">No timeline data available</p>;
  }

  // Sort players: AI first, then opponents.
  const sortedPlayers = [...data.players].sort((a, b) => {
    if (a.isAi && !b.isAi) return -1;
    if (!a.isAi && b.isAi) return 1;
    return a.playerId - b.playerId;
  });

  const playerColorMap: Record<number, string> = {};
  sortedPlayers.forEach((p, i) => {
    playerColorMap[p.playerId] = playerColors[i % playerColors.length];
  });

  // Custom tooltip showing turn, metric values, and events.
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const turn = label as number;
    const turnEvents = eventsByTurn.get(turn);

    return (
      <div style={{
        background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6,
        padding: '8px 12px', maxWidth: 300,
      }}>
        <p style={{ margin: '0 0 4px', color: '#a1a1aa', fontSize: 11 }}>Turn {turn}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ margin: 0, color: entry.stroke, fontSize: 12 }}>
            {entry.name}: {entry.value?.toLocaleString() ?? '—'}
          </p>
        ))}
        {turnEvents && turnEvents.length > 0 && (
          <div style={{ borderTop: '1px solid #3f3f46', marginTop: 4, paddingTop: 4 }}>
            {turnEvents.map((ev, i) => (
              <p key={i} style={{ margin: 0, color: categoryColors[ev.category], fontSize: 11 }}>
                {ev.label}: {ev.detail}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  const metricPrefix = metric === 'score' ? 'score' : metric === 'militaryStrength' ? 'military' : 'science';
  const needsBrush = chartData.length > 200;

  return (
    <div className="space-y-3">
      {/* Metric selector */}
      <div className="flex gap-2">
        {(Object.keys(metricLabels) as Metric[]).map((m) => (
          <Button
            key={m}
            variant={metric === m ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMetric(m)}
          >
            {metricLabels[m]}
          </Button>
        ))}
      </div>

      {/* Chart + Events side-by-side */}
      <div className="flex gap-4">
        {/* Chart — takes remaining space */}
        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={450}>
            <ComposedChart data={chartData} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="turn"
                stroke="#71717a"
                tick={{ fontSize: 11 }}
                label={{ value: 'Turn', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#71717a' }}
              />
              <YAxis
                stroke="#71717a"
                tick={{ fontSize: 11 }}
                label={{ value: metricLabels[metric], angle: -90, position: 'insideLeft', fontSize: 10, fill: '#71717a' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />

              {/* Event reference lines */}
              {eventLines.map(({ turn, category }, i) => (
                <ReferenceLine
                  key={`ev-${i}`}
                  x={turn}
                  stroke={categoryColors[category]}
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
              ))}

              {/* Player lines */}
              {sortedPlayers.map((player) => (
                <Line
                  key={player.playerId}
                  type="monotone"
                  dataKey={`${metricPrefix}_${player.playerId}`}
                  name={`${player.civilization} (${player.leader})`}
                  stroke={playerColorMap[player.playerId]}
                  strokeWidth={player.isAi ? 2.5 : 1.5}
                  strokeDasharray={player.isAi ? undefined : '5 3'}
                  dot={false}
                  connectNulls
                />
              ))}

              {needsBrush && (
                <Brush dataKey="turn" height={20} stroke="#3f3f46" fill="#18181b" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Events list — fixed-width right panel */}
        {data.events.length > 0 && (
          <div className="w-64 shrink-0 border-l border-border pl-4">
            <p className="text-xs text-muted-foreground font-medium mb-2">Events</p>
            <div className="space-y-1 text-xs max-h-[420px] overflow-y-auto pr-1">
              {data.events.map((ev, i) => (
                <div
                  key={i}
                  ref={(el) => { if (el) eventRefsMap.current.set(i, el); else eventRefsMap.current.delete(i); }}
                  className={`flex items-start gap-1.5 py-0.5 px-1 rounded transition-colors duration-300 ${
                    highlightedTurn === ev.turn ? 'bg-white/10' : ''
                  }`}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0 mt-1"
                    style={{ background: categoryColors[ev.category] }}
                  />
                  <div className="min-w-0">
                    <span className="text-muted-foreground">T{ev.turn}</span>{' '}
                    <span className="font-medium">{ev.label}</span>
                    {ev.detail && (
                      <span className="text-muted-foreground"> — {ev.detail}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
