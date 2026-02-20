// Displays the four victory type progress bars from VictoryProgress data.

interface VictoryEntry {
  DominationVictory: string | null;
  ScienceVictory: string | null;
  CulturalVictory: string | null;
  DiplomaticVictory: string | null;
  PlayerId: number;
}

interface VictoryProgressPanelProps {
  progress: VictoryEntry[];
}

interface ParsedVictory {
  Contender: string | null;
  Progress?: number;
  Required?: number;
  Details?: Record<string, unknown>;
}

function parseVictory(raw: string | null): ParsedVictory | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParsedVictory;
  } catch {
    return null;
  }
}

const victoryKeys: { key: keyof VictoryEntry; label: string; color: string }[] = [
  { key: 'DominationVictory', label: 'Domination', color: 'bg-red-500' },
  { key: 'ScienceVictory', label: 'Science', color: 'bg-blue-500' },
  { key: 'CulturalVictory', label: 'Culture', color: 'bg-purple-500' },
  { key: 'DiplomaticVictory', label: 'Diplomacy', color: 'bg-yellow-500' },
];

export default function VictoryProgressPanel({ progress }: VictoryProgressPanelProps) {
  if (progress.length === 0) {
    return <p className="text-muted-foreground text-sm">No victory progress data</p>;
  }

  return (
    <div className="space-y-6">
      {progress.map((row, i) => (
        <div key={i} className="space-y-3">
          <p className="text-xs text-muted-foreground font-mono">Player {row.PlayerId}</p>
          {victoryKeys.map(({ key, label, color }) => {
            const v = parseVictory(row[key] as string | null);
            const pct = v?.Progress != null && v?.Required ? Math.min(100, (v.Progress / v.Required) * 100) : 0;
            const hasWon = v?.Contender != null;
            return (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className={hasWon ? 'font-semibold text-green-400' : ''}>{label}{hasWon ? ' \u2713' : ''}</span>
                  {v?.Progress != null && <span className="text-muted-foreground">{v.Progress} / {v.Required ?? '?'}</span>}
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
