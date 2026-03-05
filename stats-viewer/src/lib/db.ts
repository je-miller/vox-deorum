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
  modelName: string | null;
  modelConfig: string | null;
  gitCommit: string | null;
  gitBranch: string | null;
  gitRemote: string | null;
  // Strategist agent names collected from strategist-0, strategist-1, … keys.
  strategists: string[];
}

export interface PlayerInformation {
  Key: number;        // PlayerId equivalent — primary player identifier
  Civilization: string;
  Leader: string;
  TeamID: number;
  IsHuman: number;
  IsMajor: number;
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
  // Strategist names are written as strategist-0, strategist-1, … keys.
  let inputTokens = 0, outputTokens = 0, reasoningTokens = 0;
  const strategists: string[] = [];
  for (const [key, val] of Object.entries(map)) {
    if (key.startsWith('inputTokens-')) inputTokens += Number(val) || 0;
    else if (key.startsWith('outputTokens-')) outputTokens += Number(val) || 0;
    else if (key.startsWith('reasoningTokens-')) reasoningTokens += Number(val) || 0;
    else if (key.startsWith('strategist-') && val) strategists.push(val);
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
    modelName: map['modelName'] ?? null,
    modelConfig: map['modelConfig'] ?? null,
    gitCommit: map['gitCommit'] ?? null,
    gitBranch: map['gitBranch'] ?? null,
    gitRemote: map['gitRemote'] ?? null,
    strategists,
  };
}

export function getPlayers(db: Database.Database): PlayerInformation[] {
  try {
    return db.prepare('SELECT Key, Civilization, Leader, TeamID, IsHuman, IsMajor FROM PlayerInformations').all() as PlayerInformation[];
  } catch {
    return [];
  }
}

// IsLLMPlayer returns true if the player is controlled by an LLM (AI).
// In the database, LLM players have IsHuman = 0. In most cases, however there must be a bug that allows all players to be IsHuman = 0. Using Key instead.
export function IsLLMPlayer(p: PlayerInformation): boolean {
  if (p.IsHuman === 1) {
    return false;
  }
  return p.Key === 1;
  // return p.IsHuman === 0;
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

// playerKey is the PlayerInformations.Key value for the AI player.
export function getAiPlayerSummary(db: Database.Database, playerKey: number): PlayerSummary | null {
  try {
    const row = db
      .prepare('SELECT * FROM PlayerSummaries WHERE PlayerId = ? AND IsLatest = 1 ORDER BY Turn DESC LIMIT 1')
      .get(playerKey) as PlayerSummary | undefined;
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
  modelName: string | null;
  modelConfig: string | null;
  gitCommit: string | null;
  gitBranch: string | null;
  gitRemote: string | null;
  strategists: string[];
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
    const aiPlayer = players.find((p) => IsLLMPlayer(p)) ?? null;

    let outcome: 'Win' | 'Loss' | 'Incomplete' = 'Incomplete';
    if (metadata.victoryType && metadata.victoryPlayerID !== null) {
      const winnerPlayer = players.find((p) => p.Key === metadata.victoryPlayerID);
      // Win if the victorious player is the AI (not human-controlled).
      outcome = winnerPlayer && IsLLMPlayer(winnerPlayer) ? 'Win' : 'Loss';
    }

    return {
      gameId: metadata.gameId || path.basename(dbPath, '.db'),
      dbPath,
      turn: metadata.turn,
      lastSave: metadata.lastSave,
      aiPlayer,
      victoryType: metadata.victoryType,
      tokens: metadata.tokens,
      modelName: metadata.modelName,
      modelConfig: metadata.modelConfig,
      gitCommit: metadata.gitCommit,
      gitBranch: metadata.gitBranch,
      gitRemote: metadata.gitRemote,
      strategists: metadata.strategists,
      outcome,
    };
  } finally {
    db.close();
  }
}

// Timeline types for game progression visualization.
// Represents game state curves (score, military, science) and inflection-point events (wars, eras, policies).

export interface TimelineDataPoint {
  turn: number;
  playerId: number;
  score: number;
  militaryStrength: number;
  sciencePerTurn: number;
}

export interface TimelineEvent {
  turn: number;
  type: string;
  label: string;
  detail: string;
  category: 'war' | 'progression' | 'milestone';
}

export interface TimelinePlayer {
  playerId: number;
  civilization: string;
  leader: string;
  isHuman: boolean;
  isAi: boolean;
}

// Lightweight error representation for timeline chart (turn-indexed, from telemetry spans).
export interface TimelineError {
  turn: number;
  name: string;
  message: string;
}

// Complete timeline data structure returned by getTimelineData().
// Used by the /api/runs/{gameId}/timeline route and TimelineChart component.
export interface TimelineData {
  players: TimelinePlayer[];
  series: TimelineDataPoint[];
  events: TimelineEvent[];
  errors: TimelineError[];
}

// Event types to include in timeline and their categories.
const eventCategories: Record<string, 'war' | 'progression' | 'milestone'> = {
  DeclareWar: 'war',
  CityCaptureComplete: 'war',
  UnitCityFounded: 'milestone',
  TeamSetEra: 'progression',
  PlayerGoldenAge: 'progression',
  PlayerAdoptPolicyBranch: 'milestone',
  IdeologyAdopted: 'milestone',
  ReligionFounded: 'milestone',
  CapitalChanged: 'war',
  PlayerVictory: 'milestone',
};

// Queries PlayerSummaries for metric curves: Score, MilitaryStrength, SciencePerTurn over all turns.
// Filters to major players only (IsMajor=1, e.g., human and AI but not city-states).
// Uses MAX(Version) subquery to select the latest version per turn (respects version history).
// Returns flat array suitable for component transformation into per-turn objects.
export function getTimelineSeries(db: Database.Database, majorKeys: number[]): TimelineDataPoint[] {
  if (majorKeys.length === 0) return [];
  const placeholders = majorKeys.map(() => '?').join(',');
  const sql = `
    SELECT ps.Key AS playerId, ps.Turn AS turn,
           ps.Score AS score, ps.MilitaryStrength AS militaryStrength,
           ps.SciencePerTurn AS sciencePerTurn
    FROM PlayerSummaries ps
    INNER JOIN (
      SELECT Turn, Key, MAX(Version) AS MaxVersion
      FROM PlayerSummaries
      WHERE Key IN (${placeholders})
      GROUP BY Turn, Key
    ) latest ON ps.Turn = latest.Turn AND ps.Key = latest.Key AND ps.Version = latest.MaxVersion
    WHERE ps.Key IN (${placeholders})
    ORDER BY ps.Turn ASC, ps.Key ASC
  `;
  try {
    return db.prepare(sql).all(...majorKeys, ...majorKeys) as TimelineDataPoint[];
  } catch {
    return [];
  }
}

// Safely converts a payload value to a display string.
// Handles nested objects (from localizeObject/explainEnums) by extracting meaningful text.
function displayVal(val: unknown): string {
  if (val == null) return '?';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    // Localized objects may have Description, ShortDescription, or Text fields.
    const obj = val as Record<string, unknown>;
    if (typeof obj.ShortDescription === 'string') return obj.ShortDescription;
    if (typeof obj.Description === 'string') return obj.Description;
    if (typeof obj.Text === 'string') return obj.Text;
    // Fall back to first string value found.
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return '?';
}

// Parses GameEvents Payload JSON and builds human-readable label and detail strings.
// Payload fields use Civ5 naming (e.g., OriginatingPlayerID, NewOwnerID) and may contain
// nested objects from localizeObject/explainEnums processing. Uses displayVal() for safety.
function buildEventLabel(type: string, payload: string | null, players: PlayerInformation[]): { label: string; detail: string } {
  if (!payload) return { label: type, detail: '' };
  try {
    const p = JSON.parse(payload);
    // Helper to resolve a player ID to a civilization name.
    const playerName = (id: unknown): string => {
      if (id == null) return '?';
      const numId = typeof id === 'number' ? id : parseInt(String(id), 10);
      const player = players.find((pl) => pl.Key === numId);
      return player ? player.Civilization : `Player ${numId}`;
    };
    // Helper to resolve a team ID to a civilization name.
    const teamName = (id: unknown): string => {
      if (id == null) return '?';
      const numId = typeof id === 'number' ? id : parseInt(String(id), 10);
      const player = players.find((pl) => pl.TeamID === numId);
      return player ? player.Civilization : `Team ${numId}`;
    };

    switch (type) {
      case 'DeclareWar':
        return { label: 'War Declared', detail: `${playerName(p.OriginatingPlayerID)} vs ${teamName(p.TargetTeamID)}` };
      case 'CityCaptureComplete':
        return { label: 'City Captured', detail: `by ${playerName(p.NewOwnerID)} from ${playerName(p.OldOwnerID)}` };
      case 'UnitCityFounded':
        return { label: 'City Founded', detail: playerName(p.PlayerID) };
      case 'TeamSetEra':
        return { label: 'New Era', detail: `${displayVal(p.NewEra)} — ${teamName(p.TeamID)}` };
      case 'PlayerGoldenAge':
        return { label: 'Golden Age', detail: `${playerName(p.PlayerID)}${p.Starting ? ' begins' : ' ends'}` };
      case 'PlayerAdoptPolicyBranch':
        return { label: 'Policy Branch', detail: `${displayVal(p.BranchType)} — ${playerName(p.PlayerID)}` };
      case 'IdeologyAdopted':
        return { label: 'Ideology', detail: `${displayVal(p.BranchType)} — ${playerName(p.PlayerID)}` };
      case 'ReligionFounded':
        return { label: 'Religion Founded', detail: playerName(p.PlayerID) };
      case 'CapitalChanged':
        return { label: 'Capital Changed', detail: playerName(p.PlayerID) };
      case 'PlayerVictory':
        return { label: 'Victory!', detail: `${displayVal(p.VictoryType)} — ${playerName(p.PlayerID)}` };
      default:
        return { label: type, detail: '' };
    }
  } catch {
    return { label: type, detail: '' };
  }
}

// Queries GameEvents table for inflection-point events that matter strategically.
// Filters by eventCategories map (war, milestone, progression) and parses JSON payloads.
// Requires players list to resolve player/team IDs to civilization names.
// Returns empty array if table doesn't exist.
export function getTimelineEvents(db: Database.Database, players: PlayerInformation[]): TimelineEvent[] {
  const types = Object.keys(eventCategories);
  const placeholders = types.map(() => '?').join(',');
  const sql = `SELECT Turn, Type, Payload FROM GameEvents WHERE Type IN (${placeholders}) ORDER BY Turn ASC`;
  try {
    const rows = db.prepare(sql).all(...types) as { Turn: number; Type: string; Payload: string | null }[];
    return rows.map((row) => {
      const { label, detail } = buildEventLabel(row.Type, row.Payload, players);
      return {
        turn: row.Turn,
        type: row.Type,
        label,
        detail,
        category: eventCategories[row.Type] ?? 'progression',
      };
    });
  } catch {
    return [];
  }
}

// Orchestrator function: builds complete TimelineData for a game database.
// Combines player information, metric series (score/military/science), and events into a single response.
// Called by /api/runs/{gameId}/timeline route and used by TimelineChart component.
export function getTimelineData(db: Database.Database): TimelineData {
  const players = getPlayers(db);
  const majorPlayers = players.filter((p) => p.IsMajor === 1);
  const majorKeys = majorPlayers.map((p) => p.Key);

  const timelinePlayers: TimelinePlayer[] = majorPlayers.map((p) => ({
    playerId: p.Key,
    civilization: p.Civilization,
    leader: p.Leader,
    isHuman: !IsLLMPlayer(p),
    isAi: IsLLMPlayer(p),
  }));

  const series = getTimelineSeries(db, majorKeys);
  const events = getTimelineEvents(db, players);

  return { players: timelinePlayers, series, events, errors: [] };
}

export function getRunDetail(dbPath: string) {
  const db = openDb(dbPath);
  if (!db) return null;
  try {
    const metadata = getGameMetadata(db);
    const players = getPlayers(db);
    const aiPlayer = players.find((p) => IsLLMPlayer(p)) ?? null;
    const victoryResult = getVictoryResult(db);
    const victoryProgress = getVictoryProgress(db);
    const aiSummary = aiPlayer ? getAiPlayerSummary(db, aiPlayer.Key) : null;
    const policies = getPolicies(db);
    const strategies = getStrategies(db);

    let outcome: 'Win' | 'Loss' | 'Incomplete' = 'Incomplete';
    if (metadata.victoryType && metadata.victoryPlayerID !== null) {
      const winnerPlayer = players.find((p) => p.Key === metadata.victoryPlayerID);
      outcome = winnerPlayer && IsLLMPlayer(winnerPlayer) ? 'Win' : 'Loss';
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
