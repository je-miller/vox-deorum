/**
 * Strategic warning utilities for detecting competitive position gaps and ledger staleness.
 * All functions return empty strings when no warnings apply (zero token cost).
 */

import type { GameState } from "../strategist/strategy-parameters.js";

// ============================================================
// Competitive Position Analysis
// ============================================================

/** Severity levels for competitive warnings */
export type WarningSeverity = 'concern' | 'warning' | 'critical';

/** A single competitive metric warning */
export interface CompetitiveWarning {
  metric: string;
  selfValue: number;
  leaderValue: number;
  leaderName: string;
  severity: WarningSeverity;
  ratio: number;
}

/** Result of competitive position analysis */
export interface CompetitivePositionResult {
  hasWarnings: boolean;
  warnings: CompetitiveWarning[];
}

/**
 * Finds a player summary by playerID from the players report.
 * Handles both array and object-keyed formats returned by the MCP server.
 */
function findPlayer(players: GameState['players'], playerID: number): Record<string, unknown> | undefined {
  if (!players) return undefined;
  if (Array.isArray(players)) {
    return (players as Record<string, unknown>[]).find((p) => p['Key'] === playerID);
  }
  for (const key in players) {
    const p = players[key] as Record<string, unknown> | undefined;
    if (p?.['Key'] === playerID) return p;
  }
  return undefined;
}

/**
 * Gets all player summaries as an array from the players report.
 * Handles both array and object-keyed formats returned by the MCP server.
 */
function isPlayerRecord(p: unknown): p is Record<string, unknown> {
  return p !== null && typeof p === 'object' && 'Key' in p;
}

function getAllPlayers(players: GameState['players']): Record<string, unknown>[] {
  if (!players) return [];
  if (Array.isArray(players)) return players.filter(isPlayerRecord) as Record<string, unknown>[];
  return Object.values(players).filter(isPlayerRecord) as Record<string, unknown>[];
}

/**
 * Classifies a ratio (self/leader) into a severity level.
 * Returns null if the ratio is above the concern threshold.
 */
function classifySeverity(ratio: number): WarningSeverity | null {
  if (ratio < 0.25) return 'critical';
  if (ratio < 0.40) return 'warning';
  if (ratio < 0.60) return 'concern';
  return null;
}

/**
 * Analyzes competitive position by comparing self metrics against the leader for each metric.
 * Returns an empty result when no warnings apply.
 */
export function analyzeCompetitivePosition(
  players: GameState['players'],
  selfPlayerID: number
): CompetitivePositionResult {
  const result: CompetitivePositionResult = { hasWarnings: false, warnings: [] };
  if (!players) return result;

  const self = findPlayer(players, selfPlayerID);
  if (!self) return result;

  const allPlayers = getAllPlayers(players);

  const metrics: { key: string; label: string }[] = [
    { key: 'Cities', label: 'Cities' },
    { key: 'Score', label: 'Score' },
    { key: 'MilitaryStrength', label: 'Military Strength' },
  ];

  for (const { key, label } of metrics) {
    const selfVal = typeof self[key] === 'number' ? self[key] as number : 0;
    if (selfVal <= 0) continue;

    // Find the leader (highest value, excluding self)
    let leaderVal = 0;
    let leaderName = '';
    for (const p of allPlayers) {
      if (p['Key'] === selfPlayerID) continue;
      const val = typeof p[key] === 'number' ? p[key] as number : 0;
      if (val > leaderVal) {
        leaderVal = val;
        leaderName = (p['Name'] ?? p['CivName'] ?? `Player ${p['Key']}`) as string;
      }
    }

    if (leaderVal <= 0) continue;

    const ratio = selfVal / leaderVal;
    const severity = classifySeverity(ratio);
    if (severity) {
      result.hasWarnings = true;
      result.warnings.push({ metric: label, selfValue: selfVal, leaderValue: leaderVal, leaderName, severity, ratio });
    }
  }

  return result;
}

/**
 * Formats competitive position warnings into a markdown section.
 * Returns empty string when no warnings exist.
 */
export function formatCompetitiveSection(result: CompetitivePositionResult): string {
  if (!result.hasWarnings) return '';

  const lines: string[] = ['# COMPETITIVE POSITION WARNING'];
  for (const w of result.warnings) {
    const pct = Math.round(w.ratio * 100);
    lines.push(`- **${w.metric}** [${w.severity.toUpperCase()}]: You have ${w.selfValue} vs ${w.leaderName}'s ${w.leaderValue} (${pct}% of leader)`);
  }
  lines.push('');
  return lines.join('\n');
}

// ============================================================
// Ledger Staleness Detection
// ============================================================

/** A single staleness warning */
export interface StalenessWarning {
  field: string;
  turnSpan: number;
}

/**
 * Detects ledger staleness by comparing specific fields across available game states.
 * If a field is identical across all available historical states spanning at least `threshold` turns,
 * it fires a staleness warning for that field.
 */
export function detectLedgerStaleness(
  gameStates: Record<number, GameState>,
  currentTurn: number,
  threshold: number = 10
): StalenessWarning[] {
  const warnings: StalenessWarning[] = [];
  const turns = Object.keys(gameStates).map(Number).filter(t => t <= currentTurn).sort((a, b) => a - b);
  if (turns.length < 2) return warnings;

  const turnSpan = turns[turns.length - 1] - turns[0];
  if (turnSpan < threshold) return warnings;

  const fieldsToCheck = ['ActivePlan', 'ThreatAssessment'];

  for (const field of fieldsToCheck) {
    const values: string[] = [];
    for (const turn of turns) {
      const ledger = gameStates[turn].ledger as Record<string, unknown> | undefined;
      if (!ledger || !(field in ledger)) continue;
      values.push(JSON.stringify(ledger[field]));
    }

    // Need at least 2 comparable values
    if (values.length < 2) continue;

    // Check if all values are identical
    const allSame = values.every(v => v === values[0]);
    if (allSame) {
      warnings.push({ field, turnSpan });
    }
  }

  return warnings;
}

/**
 * Formats staleness warnings into a markdown section.
 * Returns empty string when no warnings exist.
 */
export function formatStalenessSection(warnings: StalenessWarning[]): string {
  if (warnings.length === 0) return '';

  const lines: string[] = ['# STRATEGY STALENESS WARNING'];
  lines.push('The following ledger fields have not changed across available history:');
  for (const w of warnings) {
    lines.push(`- **${w.field}** — unchanged for ${w.turnSpan}+ turns. Consider re-evaluating.`);
  }
  lines.push('');
  return lines.join('\n');
}
