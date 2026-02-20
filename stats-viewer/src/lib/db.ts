// Game database queries using better-sqlite3 (synchronous).
// Reads {gameId}.db files produced by the mcp-server component.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  total: number;
}

export interface GameMetadata {
  gameId: string;
  turn: number;
  // Millisecond Unix timestamp stored as a numeric string (e.g. "1771284818130").
  // Use new Date(Number(lastSave)) to convert.
  lastSave: string;
  victoryType: string | null;
  // PlayerId of the winning player, or null if game is not complete.
  victoryPlayerID: number | null;
  tokens: TokenUsage;
}

export interface PlayerInformation {
  PlayerId: number;
  CivilizationTypeName: string;
  LeaderTypeName: string;
  IsHuman: number;
  IsAlive: number;
}

export interface VictoryResult {
  winner: string | null;
  victoryType: string | null;
  hasWinner: boolean;
}

export interface PlayerSummary {
  PlayerId: number;
  Turn: number;
  Score: number;
  Era: string;
  NumCities: number;
  MilitaryMight: number;
  GoldPerTurn: number;
  ResearchPerTurn: number;
  CulturePerTurn: number;
  FaithPerTurn: number;
}

export interface PolicyChange {
  PlayerId: number;
  Turn: number;
  PolicyBranch: string;
  PolicyName: string;
}

export interface StrategyChange {
  PlayerId: number;
  Turn: number;
  Strategy: string;
  Reasoning: string | null;
}

export interface VictoryProgressEntry {
  DominationVictory: string | null;
  ScienceVictory: string | null;
  CulturalVictory: string | null;
  DiplomaticVictory: string | null;
  PlayerId: number;
}

// Opens a database file, returns null if not accessible.
function openDb(dbPath: string): Database.Database | null {
  try {
    return new Database(dbPath, { readonly: true });
  } catch {
    return null;
  }
}

// Reads all GameMetadata key-value pairs in a single query.
// Extracts victory info and token counts directly from metadata — much faster than
// querying VictoryProgress or scanning telemetry DB files.
export function getGameMetadata(db: Database.Database): GameMetadata {
  const rows = db.prepare('SELECT Key, Value FROM GameMetadata').all() as { Key: string; Value: string }[];
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.Key] = row.Value;
  }

  // Token counts are written per-player as inputTokens-N, outputTokens-N, reasoningTokens-N.
  let inputTokens = 0, outputTokens = 0, reasoningTokens = 0;
  for (const [key, val] of Object.entries(map)) {
    if (key.startsWith('inputTokens-')) inputTokens += Number(val) || 0;
    else if (key.startsWith('outputTokens-')) outputTokens += Number(val) || 0;
    else if (key.startsWith('reasoningTokens-')) reasoningTokens += Number(val) || 0;
  }

  // victoryPlayerID is stored as a float string e.g. "0.0" matching PlayerInformations.PlayerId.
  const rawVictoryPlayer = map['victoryPlayerID'];
  const victoryPlayerID = rawVictoryPlayer != null && rawVictoryPlayer !== ''
    ? Math.round(parseFloat(rawVictoryPlayer))
    : null;

  return {
    gameId: map['gameID'] ?? '',
    turn: parseInt(map['turn'] ?? '0', 10),
    lastSave: map['lastSave'] ?? '',
    victoryType: map['victoryType'] ?? null,
    victoryPlayerID,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      reasoning: reasoningTokens,
      total: inputTokens + outputTokens + reasoningTokens,
    },
  };
}

export function getPlayers(db: Database.Database): PlayerInformation[] {
  try {
    return db.prepare('SELECT PlayerId, CivilizationTypeName, LeaderTypeName, IsHuman, IsAlive FROM PlayerInformations').all() as PlayerInformation[];
  } catch {
    return [];
  }
}

// Detects the winner from VictoryProgress — used only on the detail page.
// A non-null Contender field in a JSON victory column means that civ won.
export function getVictoryResult(db: Database.Database): VictoryResult {
  try {
    const rows = db.prepare('SELECT * FROM VictoryProgress WHERE IsLatest = 1').all() as VictoryProgressEntry[];
    const victoryColumns: (keyof VictoryProgressEntry)[] = [
      'DominationVictory',
      'ScienceVictory',
      'CulturalVictory',
      'DiplomaticVictory',
    ];
    for (const row of rows) {
      for (const col of victoryColumns) {
        const val = row[col] as string | null;
        if (!val) continue;
        try {
          const parsed = JSON.parse(val);
          if (parsed && parsed.Contender != null) {
            return {
              winner: String(parsed.Contender),
              victoryType: col.replace('Victory', ''),
              hasWinner: true,
            };
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }
  } catch {
    // Table may not exist yet
  }
  return { winner: null, victoryType: null, hasWinner: false };
}

// Gets all VictoryProgress rows for the detail page victory panel.
export function getVictoryProgress(db: Database.Database): VictoryProgressEntry[] {
  try {
    return db.prepare('SELECT * FROM VictoryProgress WHERE IsLatest = 1').all() as VictoryProgressEntry[];
  } catch {
    return [];
  }
}

export function getAiPlayerSummary(db: Database.Database, aiPlayerId: number): PlayerSummary | null {
  try {
    const row = db
      .prepare('SELECT * FROM PlayerSummaries WHERE PlayerId = ? AND IsLatest = 1 ORDER BY Turn DESC LIMIT 1')
      .get(aiPlayerId) as PlayerSummary | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export function getPolicies(db: Database.Database): PolicyChange[] {
  try {
    return db.prepare('SELECT * FROM PolicyChanges ORDER BY Turn ASC').all() as PolicyChange[];
  } catch {
    return [];
  }
}

export function getStrategies(db: Database.Database): StrategyChange[] {
  try {
    return db.prepare('SELECT * FROM StrategyChanges ORDER BY Turn ASC').all() as StrategyChange[];
  } catch {
    return [];
  }
}

// Finds all game DB files in a directory (excludes telemetry player DBs).
export function findGameDbs(dbDir: string): string[] {
  if (!fs.existsSync(dbDir)) return [];
  try {
    return fs
      .readdirSync(dbDir)
      .filter((f) => f.endsWith('.db') && !f.includes('-player-'))
      .map((f) => path.join(dbDir, f));
  } catch {
    return [];
  }
}

// Lightweight run summary for the dashboard list — only reads GameMetadata + PlayerInformations.
export interface RunInfo {
  gameId: string;
  dbPath: string;
  turn: number;
  lastSave: string;
  aiPlayer: PlayerInformation | null;
  victoryType: string | null;
  tokens: TokenUsage;
  outcome: 'Win' | 'Loss' | 'Incomplete';
}

// Determines win/loss/incomplete using GameMetadata fields only — no heavy table scans.
export function getRunInfo(dbPath: string): RunInfo | null {
  const db = openDb(dbPath);
  if (!db) return null;
  try {
    const metadata = getGameMetadata(db);
    const players = getPlayers(db);

    // Vox Deorum controls the AI player (IsHuman = 0).
    const aiPlayer = players.find((p) => p.IsHuman === 0) ?? null;

    let outcome: 'Win' | 'Loss' | 'Incomplete' = 'Incomplete';
    if (metadata.victoryType && metadata.victoryPlayerID !== null) {
      const winnerPlayer = players.find((p) => p.PlayerId === metadata.victoryPlayerID);
      // Win if the victorious player is the AI (not human-controlled).
      outcome = winnerPlayer && winnerPlayer.IsHuman === 0 ? 'Win' : 'Loss';
    }

    return {
      gameId: metadata.gameId || path.basename(dbPath, '.db'),
      dbPath,
      turn: metadata.turn,
      lastSave: metadata.lastSave,
      aiPlayer,
      victoryType: metadata.victoryType,
      tokens: metadata.tokens,
      outcome,
    };
  } finally {
    db.close();
  }
}

export function getRunDetail(dbPath: string) {
  const db = openDb(dbPath);
  if (!db) return null;
  try {
    const metadata = getGameMetadata(db);
    const players = getPlayers(db);
    const aiPlayer = players.find((p) => p.IsHuman === 0) ?? null;
    const victoryResult = getVictoryResult(db);
    const victoryProgress = getVictoryProgress(db);
    const aiSummary = aiPlayer ? getAiPlayerSummary(db, aiPlayer.PlayerId) : null;
    const policies = getPolicies(db);
    const strategies = getStrategies(db);

    let outcome: 'Win' | 'Loss' | 'Incomplete' = 'Incomplete';
    if (metadata.victoryType && metadata.victoryPlayerID !== null) {
      const winnerPlayer = players.find((p) => p.PlayerId === metadata.victoryPlayerID);
      outcome = winnerPlayer && winnerPlayer.IsHuman === 0 ? 'Win' : 'Loss';
    }

    return {
      metadata,
      players,
      aiPlayer,
      victoryResult,
      victoryProgress,
      aiSummary,
      policies,
      strategies,
      outcome,
    };
  } finally {
    db.close();
  }
}
