/**
 * @module utils/opponent-dossiers
 *
 * Heuristic opponent analysis utility that produces structured per-opponent
 * strategic assessments each turn. Examines victory progress, trends,
 * military posture, vulnerabilities, and generates counter-recommendations.
 *
 * Pure utility — no LLM calls, no logger, no side effects.
 * Returns empty string when no meaningful dossiers can be produced (zero token cost).
 */

import type { VictoryProgressReport } from "../../../mcp-server/dist/tools/knowledge/get-victory-progress.js";
import type { GameState } from "../strategist/strategy-parameters.js";

/** Detected victory path with progress information */
interface VictoryAssessment {
  type: string;
  detail: string;
  progress: number;
}

/**
 * Finds a player summary by playerID from the players report.
 * Handles both array and object-keyed formats returned by the MCP server.
 */
function findPlayerSummary(players: GameState['players'], playerID: number): Record<string, unknown> | undefined {
  if (!players) return undefined;
  if (Array.isArray(players)) {
    return (players as Record<string, unknown>[]).find((p) => p['Key'] === playerID);
  }
  if (players[playerID] !== undefined) return players[playerID] as Record<string, unknown>;
  if (players[String(playerID)] !== undefined) return players[String(playerID)] as Record<string, unknown>;
  for (const key in players) {
    const p = players[key];
    if (p && typeof p === 'object' && 'Key' in p && (p as Record<string, unknown>)['Key'] === playerID) {
      return p as Record<string, unknown>;
    }
  }
  return undefined;
}

/**
 * Returns all major-civ player entries as an array, with their player index attached as Key.
 * Handles both array and object-keyed formats.
 */
function getAllMajorPlayers(players: GameState['players']): Record<string, unknown>[] {
  if (!players) return [];
  const list: Record<string, unknown>[] = [];
  if (Array.isArray(players)) {
    for (const p of players) {
      if (p && typeof p === 'object' && (p as Record<string, unknown>)['IsMajor'] === true) {
        list.push(p as Record<string, unknown>);
      }
    }
  } else {
    for (const key in players) {
      const p = players[key];
      if (p && typeof p === 'object' && 'IsMajor' in p && (p as Record<string, unknown>)['IsMajor'] === true) {
        const entry = p as Record<string, unknown>;
        // Ensure Key is set from the object key if missing
        if (!('Key' in entry)) entry['Key'] = Number(key);
        list.push(entry);
      }
    }
  }
  return list;
}

/**
 * Detects the most likely victory path for a player based on victory progress data
 * and secondary signals from player metrics.
 */
function detectLikelyVictory(
  playerData: Record<string, unknown>,
  victoryData: VictoryProgressReport | undefined,
  playerName: string
): VictoryAssessment {
  const candidates: VictoryAssessment[] = [];

  if (victoryData) {
    // Science victory
    const sciData = victoryData.ScienceVictory as Record<string, unknown> | undefined;
    if (sciData && typeof sciData === 'object' && sciData[playerName]) {
      const pData = sciData[playerName] as Record<string, unknown>;
      const parts = (pData?.PartsCompleted ?? pData?.SpaceshipParts ?? pData?.Parts ?? 0) as number;
      const hasApollo = !!((pData?.ApolloComplete ?? 0) as number > 0 || pData?.HasApolloProgram || pData?.Apollo);
      if (hasApollo) {
        candidates.push({
          type: 'Science',
          detail: `Apollo complete, ${parts}/6 parts`,
          progress: (parts + 1) / 7 // Apollo counts as progress toward 7 milestones
        });
      } else if (parts > 0) {
        candidates.push({
          type: 'Science',
          detail: `${parts}/6 spaceship parts`,
          progress: parts / 7
        });
      }
    }

    // Domination victory
    const domData = victoryData.DominationVictory as Record<string, unknown> | undefined;
    if (domData && typeof domData === 'object' && domData[playerName]) {
      const pData = domData[playerName] as Record<string, unknown>;
      const rawCapitals = pData?.CapitalsControlled ?? pData?.CapitalsHeld ?? pData?.Capitals;
      const capitals = Array.isArray(rawCapitals) ? rawCapitals.length : (typeof rawCapitals === 'number' ? rawCapitals : 0);
      const needed = (domData.CapitalsNeeded ?? 0) as number;
      if (capitals > 1 && needed > 0) {
        candidates.push({
          type: 'Domination',
          detail: `${capitals}/${needed} capitals`,
          progress: capitals / needed
        });
      }
    }

    // Cultural victory
    const culData = victoryData.CulturalVictory as Record<string, unknown> | undefined;
    if (culData && typeof culData === 'object' && culData[playerName]) {
      const pData = culData[playerName] as Record<string, unknown>;
      const influenced = (pData?.InfluentialCivs ?? pData?.CivsInfluenced ?? pData?.Influenced ?? 0) as number;
      const needed = (culData.CivsNeeded ?? 0) as number;
      if (influenced > 0 && needed > 0) {
        candidates.push({
          type: 'Cultural',
          detail: `${influenced}/${needed} civs influenced`,
          progress: influenced / needed
        });
      }
    }

    // Diplomatic victory
    const dipData = victoryData.DiplomaticVictory as Record<string, unknown> | undefined;
    if (dipData && typeof dipData === 'object' && dipData[playerName]) {
      const pData = dipData[playerName] as Record<string, unknown>;
      const votes = (pData?.Delegates ?? pData?.Votes ?? 0) as number;
      const needed = (dipData.VotesNeeded ?? 0) as number;
      if (votes > 0 && needed > 0) {
        candidates.push({
          type: 'Diplomatic',
          detail: `${votes}/${needed} delegates`,
          progress: votes / needed
        });
      }
    }
  }

  // If we have victory progress candidates, return the one with highest progress
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.progress - a.progress);
    return candidates[0];
  }

  // Fall back to secondary signals from player metrics
  const science = (playerData.SciencePerTurn ?? 0) as number;
  const military = (playerData.MilitaryStrength ?? 0) as number;
  const tourism = (playerData.TourismPerTurn ?? 0) as number;
  const culture = (playerData.CulturePerTurn ?? 0) as number;
  const gold = (playerData.GoldPerTurn ?? 0) as number;

  // Score the signals relative to each other
  const signals: { type: string; detail: string; score: number }[] = [
    { type: 'Science', detail: `high science output (${science}/turn)`, score: science * 1.5 },
    { type: 'Domination', detail: `high military strength (${military})`, score: military * 0.05 },
    { type: 'Cultural', detail: `high tourism/culture (${tourism}T, ${culture}C/turn)`, score: (tourism + culture) * 0.8 },
    { type: 'Diplomatic', detail: `high gold output (${gold}/turn)`, score: gold * 0.3 },
  ];

  signals.sort((a, b) => b.score - a.score);
  const best = signals[0];

  return {
    type: best.score > 0 ? best.type : 'Unknown',
    detail: best.score > 0 ? best.detail : 'insufficient data',
    progress: 0
  };
}

/**
 * Estimates the number of turns until a player achieves their likely victory.
 * Returns "~N turns" or "Unknown" if insufficient data.
 */
function estimateVictoryETA(
  victoryType: string,
  progress: number,
  playerData: Record<string, unknown>,
  gameStates: Record<number, GameState>,
  playerID: number,
  currentTurn: number
): string {
  if (progress <= 0) return 'Unknown';

  // For domination, estimate based on remaining capitals
  if (victoryType === 'Domination') {
    // progress is capitals/needed, so remaining fraction is 1 - progress
    const remaining = 1 - progress;
    if (remaining <= 0) return '<5 turns';
    // Estimate 15-25 turns per capital capture, use 20 as midpoint
    // Scale inversely with military strength
    const military = (playerData.MilitaryStrength ?? 0) as number;
    const turnsPerCapital = military > 2000 ? 15 : military > 1000 ? 20 : 25;
    // remaining is a fraction; multiply by total needed to get count
    // But we only have the ratio, so estimate using a reasonable capital count
    const estimatedRemaining = Math.ceil(remaining * 10); // rough approximation
    const eta = estimatedRemaining * turnsPerCapital;
    return eta > 200 ? 'Unknown' : `~${eta} turns`;
  }

  // For science, estimate from parts remaining
  if (victoryType === 'Science') {
    // progress = (parts + hasApollo) / 7
    const completed = Math.round(progress * 7);
    const remaining = 7 - completed;
    if (remaining <= 0) return '<5 turns';

    // Try to estimate rate from historical data
    const rate = estimateProgressRate(gameStates, playerID, currentTurn, 'ScienceVictory');
    if (rate > 0) {
      const eta = Math.ceil(remaining / rate);
      return eta > 200 ? 'Unknown' : `~${eta} turns`;
    }

    // Fallback: estimate from science output (higher science = faster parts)
    const science = (playerData.SciencePerTurn ?? 0) as number;
    if (science > 0) {
      // Rough: each part takes ~500-1000 science worth of production time
      const turnsPerPart = science > 500 ? 8 : science > 200 ? 15 : 25;
      const eta = remaining * turnsPerPart;
      return eta > 200 ? 'Unknown' : `~${eta} turns`;
    }

    return 'Unknown';
  }

  // For cultural, estimate from influence rate
  if (victoryType === 'Cultural') {
    const remaining = 1 - progress;
    if (remaining <= 0) return '<5 turns';

    const rate = estimateProgressRate(gameStates, playerID, currentTurn, 'CulturalVictory');
    if (rate > 0) {
      const eta = Math.ceil(remaining / rate);
      return eta > 200 ? 'Unknown' : `~${eta} turns`;
    }

    // Fallback: high tourism means faster influence
    const tourism = (playerData.TourismPerTurn ?? 0) as number;
    if (tourism > 0) {
      const turnsPerCiv = tourism > 200 ? 10 : tourism > 50 ? 25 : 50;
      const civsRemaining = Math.ceil(remaining * 10); // rough
      const eta = civsRemaining * turnsPerCiv;
      return eta > 200 ? 'Unknown' : `~${eta} turns`;
    }

    return 'Unknown';
  }

  // For diplomatic, estimate from delegate accumulation
  if (victoryType === 'Diplomatic') {
    const remaining = 1 - progress;
    if (remaining <= 0) return '<5 turns';

    const rate = estimateProgressRate(gameStates, playerID, currentTurn, 'DiplomaticVictory');
    if (rate > 0) {
      const eta = Math.ceil(remaining / rate);
      return eta > 200 ? 'Unknown' : `~${eta} turns`;
    }

    return 'Unknown';
  }

  return 'Unknown';
}

/**
 * Estimates the rate of victory progress per turn by comparing historical game states.
 * Returns progress-fraction-per-turn, or 0 if insufficient data.
 */
function estimateProgressRate(
  gameStates: Record<number, GameState>,
  playerID: number,
  currentTurn: number,
  victoryKey: string
): number {
  // Find oldest available state with victory data for this player
  let oldestTurn: number | undefined;
  for (const turnStr of Object.keys(gameStates)) {
    const turn = Number(turnStr);
    if (turn < currentTurn && (oldestTurn === undefined || turn < oldestTurn)) {
      const state = gameStates[turn];
      if (state.victory) oldestTurn = turn;
    }
  }

  if (oldestTurn === undefined) return 0;

  const oldState = gameStates[oldestTurn];
  const curState = gameStates[currentTurn];
  if (!oldState?.victory || !curState?.victory) return 0;

  const oldPlayer = findPlayerSummary(oldState.players, playerID);
  const curPlayer = findPlayerSummary(curState.players, playerID);
  if (!oldPlayer || !curPlayer) return 0;

  const civName = (curPlayer['Civilization'] ?? curPlayer['Name'] ?? curPlayer['CivName'] ?? '') as string;
  if (!civName) return 0;

  const oldVictory = (oldState.victory as Record<string, unknown>)[victoryKey] as Record<string, unknown> | undefined;
  const curVictory = (curState.victory as Record<string, unknown>)[victoryKey] as Record<string, unknown> | undefined;
  if (!oldVictory || !curVictory) return 0;

  const oldProgress = extractProgressValue(oldVictory, civName, victoryKey);
  const curProgress = extractProgressValue(curVictory, civName, victoryKey);

  const turnDiff = currentTurn - oldestTurn;
  if (turnDiff <= 0) return 0;

  const progressDiff = curProgress - oldProgress;
  return progressDiff > 0 ? progressDiff / turnDiff : 0;
}

/**
 * Extracts a normalized progress value (0-1) from victory data for a given civ.
 */
function extractProgressValue(victorySection: Record<string, unknown>, civName: string, victoryKey: string): number {
  const pData = victorySection[civName] as Record<string, unknown> | undefined;
  if (!pData || typeof pData !== 'object') return 0;

  if (victoryKey === 'ScienceVictory') {
    const parts = (pData.PartsCompleted ?? pData.SpaceshipParts ?? pData.Parts ?? 0) as number;
    const hasApollo = !!((pData.ApolloComplete ?? 0) as number > 0 || pData.HasApolloProgram || pData.Apollo);
    return (parts + (hasApollo ? 1 : 0)) / 7;
  }

  if (victoryKey === 'DominationVictory') {
    const rawCapitals = pData.CapitalsControlled ?? pData.CapitalsHeld ?? pData.Capitals;
    const capitals = Array.isArray(rawCapitals) ? rawCapitals.length : (typeof rawCapitals === 'number' ? rawCapitals : 0);
    const needed = (victorySection.CapitalsNeeded ?? 1) as number;
    return capitals / needed;
  }

  if (victoryKey === 'CulturalVictory') {
    const influenced = (pData.InfluentialCivs ?? pData.CivsInfluenced ?? pData.Influenced ?? 0) as number;
    const needed = (victorySection.CivsNeeded ?? 1) as number;
    return influenced / needed;
  }

  if (victoryKey === 'DiplomaticVictory') {
    const votes = (pData.Delegates ?? pData.Votes ?? 0) as number;
    const needed = (victorySection.VotesNeeded ?? 1) as number;
    return votes / needed;
  }

  return 0;
}

/**
 * Analyzes score/military/science trends for a player by comparing the oldest
 * available game state to the current state.
 * Returns a trend label with detail string, e.g. "ACCELERATING (score +22% over 10 turns)".
 */
function analyzeTrend(
  playerID: number,
  gameStates: Record<number, GameState>,
  currentTurn: number
): string {
  // Find the oldest available game state
  let oldestTurn: number | undefined;
  for (const turnStr of Object.keys(gameStates)) {
    const turn = Number(turnStr);
    if (turn < currentTurn && (oldestTurn === undefined || turn < oldestTurn)) {
      oldestTurn = turn;
    }
  }

  if (oldestTurn === undefined) return 'Unknown (no historical data)';

  const oldState = gameStates[oldestTurn];
  const curState = gameStates[currentTurn];
  if (!oldState?.players || !curState?.players) return 'Unknown (missing player data)';

  const oldPlayer = findPlayerSummary(oldState.players, playerID);
  const curPlayer = findPlayerSummary(curState.players, playerID);
  if (!oldPlayer || !curPlayer) return 'Unknown';

  const turnSpan = currentTurn - oldestTurn;
  if (turnSpan <= 0) return 'Unknown';

  // Compute percentage changes for key metrics
  const changes: { metric: string; pct: number }[] = [];

  const scoreOld = (oldPlayer['Score'] ?? 0) as number;
  const scoreCur = (curPlayer['Score'] ?? 0) as number;
  if (scoreOld > 0) {
    const pct = ((scoreCur - scoreOld) / scoreOld) * 100;
    changes.push({ metric: 'score', pct });
  }

  const milOld = (oldPlayer['MilitaryStrength'] ?? 0) as number;
  const milCur = (curPlayer['MilitaryStrength'] ?? 0) as number;
  if (milOld > 0) {
    const pct = ((milCur - milOld) / milOld) * 100;
    changes.push({ metric: 'military', pct });
  }

  const sciOld = (oldPlayer['SciencePerTurn'] ?? 0) as number;
  const sciCur = (curPlayer['SciencePerTurn'] ?? 0) as number;
  if (sciOld > 0) {
    const pct = ((sciCur - sciOld) / sciOld) * 100;
    changes.push({ metric: 'science', pct });
  }

  if (changes.length === 0) return 'Unknown';

  // Use the average change across all tracked metrics
  const avgPct = changes.reduce((sum, c) => sum + c.pct, 0) / changes.length;

  // Pick the most notable metric for the detail string
  const mostNotable = changes.reduce((best, c) => Math.abs(c.pct) > Math.abs(best.pct) ? c : best);
  const sign = mostNotable.pct > 0 ? '+' : '';
  const detail = `${mostNotable.metric} ${sign}${Math.round(mostNotable.pct)}% over ${turnSpan} turns`;

  if (avgPct > 15) return `ACCELERATING (${detail})`;
  if (avgPct < -5) return `DECLINING (${detail})`;
  return `STABLE (${detail})`;
}

/**
 * Assesses a player's military posture based on relative strength and war status.
 */
function assessMilitaryPosture(
  playerData: Record<string, unknown>,
  allPlayers: Record<string, unknown>[]
): string {
  const military = (playerData.MilitaryStrength ?? 0) as number;

  // Compute average military across all majors
  let totalMil = 0;
  let count = 0;
  for (const p of allPlayers) {
    if (p['IsMajor'] !== true) continue;
    const m = (p['MilitaryStrength'] ?? 0) as number;
    totalMil += m;
    count++;
  }
  const avgMil = count > 0 ? totalMil / count : 0;

  // Check if at war with anyone
  const relationships = playerData['Relationships'] as Record<string, unknown> | undefined;
  let atWar = false;
  if (relationships) {
    for (const civName in relationships) {
      const rel = relationships[civName];
      const relStr = Array.isArray(rel) ? rel.join(' ') : String(rel ?? '');
      if (relStr.includes('War') || relStr.includes('WAR') || relStr.includes('war')) {
        atWar = true;
        break;
      }
    }
  }

  const isHighMilitary = avgMil > 0 && military > avgMil * 1.3;
  const isLowMilitary = avgMil > 0 && military < avgMil * 0.6;

  if (atWar && isHighMilitary) return 'Aggressive (at war, high military)';
  if (atWar) return 'At war (active conflict)';
  if (isHighMilitary) return 'Defensive (high strength, no active wars)';
  if (isLowMilitary) return 'Weak (low military relative to average)';
  return 'Neutral';
}

/**
 * Identifies strategic vulnerabilities for a player.
 */
function identifyVulnerabilities(
  playerData: Record<string, unknown>,
  allPlayers: Record<string, unknown>[]
): string[] {
  const vulns: string[] = [];

  // Low happiness
  const happiness = playerData['HappinessSituation'] as string | undefined;
  if (happiness) {
    const lower = happiness.toLowerCase();
    if (lower.includes('unhappy') || lower.includes('revolt') || lower.includes('unrest')) {
      vulns.push('Low happiness');
    }
  }

  // Negative gold per turn
  const gpt = (playerData['GoldPerTurn'] ?? 0) as number;
  if (gpt < 0) {
    vulns.push(`Negative economy (${gpt} GPT)`);
  }

  // Overextended: many cities but low military per city
  const cities = (playerData['Cities'] ?? 0) as number;
  const military = (playerData['MilitaryStrength'] ?? 0) as number;
  if (cities >= 5 && military > 0) {
    const milPerCity = military / cities;
    // Compute average military-per-city across all majors for comparison
    let totalRatio = 0;
    let count = 0;
    for (const p of allPlayers) {
      if (p['IsMajor'] !== true) continue;
      const pCities = (p['Cities'] ?? 0) as number;
      const pMil = (p['MilitaryStrength'] ?? 0) as number;
      if (pCities > 0 && pMil > 0) {
        totalRatio += pMil / pCities;
        count++;
      }
    }
    const avgRatio = count > 0 ? totalRatio / count : 0;
    if (avgRatio > 0 && milPerCity < avgRatio * 0.5) {
      vulns.push('Overextended (many cities, low military per city)');
    }
  }

  // At war with multiple opponents
  const relationships = playerData['Relationships'] as Record<string, unknown> | undefined;
  if (relationships) {
    let warCount = 0;
    for (const civName in relationships) {
      const rel = relationships[civName];
      const relStr = Array.isArray(rel) ? rel.join(' ') : String(rel ?? '');
      if (relStr.includes('War') || relStr.includes('WAR') || relStr.includes('war')) {
        warCount++;
      }
    }
    if (warCount >= 2) {
      vulns.push(`At war with ${warCount} opponents`);
    }
  }

  return vulns;
}

/**
 * Returns a counter-recommendation string based on the opponent's likely victory path.
 */
function getCounterRecommendation(victoryType: string): string {
  switch (victoryType) {
    case 'Science':
      return 'Declare war to disrupt production. Assign spies to steal tech. Target their highest-science city.';
    case 'Domination':
      return 'Fortify remaining capitals. Seek defensive pacts. Build military units.';
    case 'Cultural':
      return 'Adopt opposing ideology. Close borders. Deny open borders agreements.';
    case 'Diplomatic':
      return 'Compete for city-state influence. Gift gold to contested city-states. Counter their proposals in World Congress.';
    default:
      return 'Monitor closely and prepare flexible countermeasures.';
  }
}

/**
 * Generates structured markdown dossiers for all visible opponents.
 * Returns empty string if no opponents have meaningful data (zero token cost).
 *
 * @param players - Player data from the get-players tool (object keyed by player index)
 * @param victory - Victory progress data from get-victory-progress
 * @param selfPlayerID - The player ID of the AI being controlled
 * @param gameStates - Historical game states keyed by turn number
 * @param currentTurn - The current game turn
 * @returns Markdown string with opponent dossiers, or empty string
 */
export function generateOpponentDossiers(
  players: GameState['players'],
  victory: VictoryProgressReport | undefined,
  selfPlayerID: number,
  gameStates: Record<number, GameState>,
  currentTurn: number
): string {
  if (!players) return '';

  const allPlayers = getAllMajorPlayers(players);
  if (allPlayers.length === 0) return '';

  const dossiers: string[] = [];

  for (const player of allPlayers) {
    const playerID = player['Key'] as number;
    if (playerID === selfPlayerID) continue;

    const civName = (player['Civilization'] ?? player['Name'] ?? player['CivName'] ?? `Player ${playerID}`) as string;

    // Detect likely victory path
    const victoryAssessment = detectLikelyVictory(player, victory, civName);

    // Estimate victory ETA
    const eta = estimateVictoryETA(
      victoryAssessment.type,
      victoryAssessment.progress,
      player,
      gameStates,
      playerID,
      currentTurn
    );

    // Analyze trends
    const trend = analyzeTrend(playerID, gameStates, currentTurn);

    // Assess military posture
    const posture = assessMilitaryPosture(player, allPlayers);

    // Identify vulnerabilities
    const vulns = identifyVulnerabilities(player, allPlayers);

    // Counter recommendation
    const counter = getCounterRecommendation(victoryAssessment.type);

    // Build dossier section
    const lines: string[] = [];
    lines.push(`## ${civName} (Player ${playerID})`);
    lines.push(`- **Likely Victory**: ${victoryAssessment.type} (${victoryAssessment.detail})`);
    lines.push(`- **Victory ETA**: ${eta}`);
    lines.push(`- **Trend**: ${trend}`);
    lines.push(`- **Military Posture**: ${posture}`);
    lines.push(`- **Vulnerability**: ${vulns.length > 0 ? vulns.join(', ') : 'None detected'}`);
    lines.push(`- **Counter**: ${counter}`);

    dossiers.push(lines.join('\n'));
  }

  if (dossiers.length === 0) return '';

  return '# Opponent Dossiers\n\n' + dossiers.join('\n\n') + '\n';
}
