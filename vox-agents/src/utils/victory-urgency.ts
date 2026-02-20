/**
 * Victory urgency analysis utility
 * Detects when a player or opponent is close to winning and generates urgency prompts
 */

import type { VictoryProgressReport } from "../../../mcp-server/dist/tools/knowledge/get-victory-progress.js";

/** Urgency levels for victory proximity */
export type UrgencyLevel = 'none' | 'approaching' | 'imminent' | 'critical';

/** Self victory clinch information */
export interface VictoryClinchInfo {
  victoryType: string;
  urgency: UrgencyLevel;
  detail: string;
}

/** Opponent threat information */
export interface OpponentThreatInfo {
  playerName: string;
  victoryType: string;
  urgency: UrgencyLevel;
  detail: string;
}

/** Result of victory urgency analysis */
export interface VictoryUrgencyResult {
  selfClinch: VictoryClinchInfo[];
  opponentThreats: OpponentThreatInfo[];
  urgencyLevel: UrgencyLevel;
}

/**
 * Compares urgency levels and returns the higher one
 */
function maxUrgency(a: UrgencyLevel, b: UrgencyLevel): UrgencyLevel {
  const order: UrgencyLevel[] = ['none', 'approaching', 'imminent', 'critical'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/**
 * Analyzes domination victory progress for a single player
 */
function analyzeDomination(
  playerName: string,
  data: Record<string, any>,
  capitalsNeeded: number
): { urgency: UrgencyLevel; detail: string } | null {
  const playerData = data[playerName];
  if (!playerData || typeof playerData !== 'object') return null;

  const capitals = playerData.CapitalsHeld ?? playerData.Capitals ?? 0;
  if (typeof capitals !== 'number' || capitals <= 0) return null;

  const ratio = capitals / capitalsNeeded;

  if (capitals >= capitalsNeeded - 1) {
    return { urgency: 'critical', detail: `Holds ${capitals}/${capitalsNeeded} capitals needed` };
  } else if (capitals >= capitalsNeeded - 2) {
    return { urgency: 'imminent', detail: `Holds ${capitals}/${capitalsNeeded} capitals needed` };
  } else if (ratio >= 0.5) {
    return { urgency: 'approaching', detail: `Holds ${capitals}/${capitalsNeeded} capitals needed` };
  }
  return null;
}

/**
 * Analyzes science victory progress for a single player
 */
function analyzeScience(
  playerName: string,
  data: Record<string, any>
): { urgency: UrgencyLevel; detail: string } | null {
  const playerData = data[playerName];
  if (!playerData || typeof playerData !== 'object') return null;

  const parts = playerData.SpaceshipParts ?? playerData.Parts ?? 0;
  const hasApollo = playerData.HasApolloProgram ?? playerData.Apollo ?? false;
  if (!hasApollo && parts === 0) return null;

  if (parts >= 5) {
    return { urgency: 'critical', detail: `Apollo complete, ${parts}/6 spaceship parts built` };
  } else if (parts >= 4) {
    return { urgency: 'imminent', detail: `Apollo complete, ${parts}/6 spaceship parts built` };
  } else if (hasApollo && parts >= 2) {
    return { urgency: 'approaching', detail: `Apollo complete, ${parts}/6 spaceship parts built` };
  }
  return null;
}

/**
 * Analyzes cultural victory progress for a single player
 */
function analyzeCultural(
  playerName: string,
  data: Record<string, any>,
  civsNeeded: number
): { urgency: UrgencyLevel; detail: string } | null {
  const playerData = data[playerName];
  if (!playerData || typeof playerData !== 'object') return null;

  const influenced = playerData.CivsInfluenced ?? playerData.Influenced ?? 0;
  if (typeof influenced !== 'number' || influenced <= 0) return null;

  const ratio = influenced / civsNeeded;

  if (influenced >= civsNeeded - 1) {
    return { urgency: 'critical', detail: `Influential over ${influenced}/${civsNeeded} civilizations` };
  } else if (influenced >= civsNeeded - 2) {
    return { urgency: 'imminent', detail: `Influential over ${influenced}/${civsNeeded} civilizations` };
  } else if (ratio >= 0.5) {
    return { urgency: 'approaching', detail: `Influential over ${influenced}/${civsNeeded} civilizations` };
  }
  return null;
}

/**
 * Analyzes diplomatic victory progress for a single player
 */
function analyzeDiplomatic(
  playerName: string,
  data: Record<string, any>,
  votesNeeded: number
): { urgency: UrgencyLevel; detail: string } | null {
  const playerData = data[playerName];
  if (!playerData || typeof playerData !== 'object') return null;

  const votes = playerData.Votes ?? playerData.Delegates ?? 0;
  if (typeof votes !== 'number' || votes <= 0) return null;

  const ratio = votes / votesNeeded;
  const votingSoon = typeof data.Status === 'string' && data.Status.includes('Voting Now');

  if (ratio >= 0.9 && votingSoon) {
    return { urgency: 'critical', detail: `${votes}/${votesNeeded} votes, voting now` };
  } else if (ratio >= 0.9) {
    return { urgency: 'critical', detail: `${votes}/${votesNeeded} votes needed` };
  } else if (ratio >= 0.75) {
    return { urgency: 'imminent', detail: `${votes}/${votesNeeded} votes needed` };
  } else if (ratio >= 0.6) {
    return { urgency: 'approaching', detail: `${votes}/${votesNeeded} votes needed` };
  }
  return null;
}

/**
 * Extracts key thresholds from victory data
 */
function extractThresholds(data: Record<string, any>): {
  capitalsNeeded: number;
  civsNeeded: number;
  votesNeeded: number;
} {
  return {
    capitalsNeeded: data.CapitalsNeeded ?? 0,
    civsNeeded: data.CivsNeeded ?? 0,
    votesNeeded: data.VotesNeeded ?? 0
  };
}

/**
 * Analyzes victory progress data and determines urgency levels for self and opponents
 * @param victory - Victory progress report from the MCP server
 * @param selfCivName - The name of the player's own civilization
 * @returns Victory urgency analysis result
 */
export function analyzeVictoryUrgency(
  victory: VictoryProgressReport | undefined,
  selfCivName: string | undefined
): VictoryUrgencyResult {
  const result: VictoryUrgencyResult = {
    selfClinch: [],
    opponentThreats: [],
    urgencyLevel: 'none'
  };

  if (!victory || !selfCivName) return result;

  // Analyze each victory type
  // Domination
  if (victory.DominationVictory && typeof victory.DominationVictory === 'object' && !Array.isArray(victory.DominationVictory)) {
    const domData = victory.DominationVictory as Record<string, any>;
    const { capitalsNeeded } = extractThresholds(domData);
    if (capitalsNeeded > 0) {
      for (const playerName of Object.keys(domData)) {
        if (playerName === 'CapitalsNeeded' || playerName === 'Contender') continue;
        const analysis = analyzeDomination(playerName, domData, capitalsNeeded);
        if (analysis) {
          if (playerName === selfCivName) {
            result.selfClinch.push({ victoryType: 'Domination', ...analysis });
          } else {
            result.opponentThreats.push({ playerName, victoryType: 'Domination', ...analysis });
          }
          result.urgencyLevel = maxUrgency(result.urgencyLevel, analysis.urgency);
        }
      }
    }
  }

  // Science
  if (victory.ScienceVictory && typeof victory.ScienceVictory === 'object' && !Array.isArray(victory.ScienceVictory)) {
    const sciData = victory.ScienceVictory as Record<string, any>;
    for (const playerName of Object.keys(sciData)) {
      if (playerName === 'Contender') continue;
      const analysis = analyzeScience(playerName, sciData);
      if (analysis) {
        if (playerName === selfCivName) {
          result.selfClinch.push({ victoryType: 'Science', ...analysis });
        } else {
          result.opponentThreats.push({ playerName, victoryType: 'Science', ...analysis });
        }
        result.urgencyLevel = maxUrgency(result.urgencyLevel, analysis.urgency);
      }
    }
  }

  // Cultural
  if (victory.CulturalVictory && typeof victory.CulturalVictory === 'object' && !Array.isArray(victory.CulturalVictory)) {
    const culData = victory.CulturalVictory as Record<string, any>;
    const { civsNeeded } = extractThresholds(culData);
    if (civsNeeded > 0) {
      for (const playerName of Object.keys(culData)) {
        if (playerName === 'CivsNeeded' || playerName === 'Contender') continue;
        const analysis = analyzeCultural(playerName, culData, civsNeeded);
        if (analysis) {
          if (playerName === selfCivName) {
            result.selfClinch.push({ victoryType: 'Cultural', ...analysis });
          } else {
            result.opponentThreats.push({ playerName, victoryType: 'Cultural', ...analysis });
          }
          result.urgencyLevel = maxUrgency(result.urgencyLevel, analysis.urgency);
        }
      }
    }
  }

  // Diplomatic
  if (victory.DiplomaticVictory && typeof victory.DiplomaticVictory === 'object' && !Array.isArray(victory.DiplomaticVictory)) {
    const dipData = victory.DiplomaticVictory as Record<string, any>;
    const { votesNeeded } = extractThresholds(dipData);
    if (votesNeeded > 0) {
      for (const playerName of Object.keys(dipData)) {
        if (['VotesNeeded', 'Status', 'ActiveResolutions', 'Proposals', 'Contender'].includes(playerName)) continue;
        const analysis = analyzeDiplomatic(playerName, dipData, votesNeeded);
        if (analysis) {
          if (playerName === selfCivName) {
            result.selfClinch.push({ victoryType: 'Diplomatic', ...analysis });
          } else {
            result.opponentThreats.push({ playerName, victoryType: 'Diplomatic', ...analysis });
          }
          result.urgencyLevel = maxUrgency(result.urgencyLevel, analysis.urgency);
        }
      }
    }
  }

  return result;
}

/**
 * Formats urgency analysis into markdown sections for injection into strategist prompts
 * Returns empty string when no urgency is detected (zero token cost)
 */
export function formatUrgencySection(result: VictoryUrgencyResult): string {
  if (result.urgencyLevel === 'none') return '';

  const sections: string[] = [];

  if (result.selfClinch.length > 0) {
    sections.push('# VICTORY WITHIN REACH');
    sections.push('You are close to winning. Prioritize closing out the game.');
    for (const clinch of result.selfClinch) {
      sections.push(`- **${clinch.victoryType}** [${clinch.urgency.toUpperCase()}]: ${clinch.detail}`);
    }
    sections.push('');
  }

  if (result.opponentThreats.length > 0) {
    sections.push('# URGENT THREAT');
    sections.push('An opponent is approaching victory. Consider countermeasures immediately.');
    for (const threat of result.opponentThreats) {
      sections.push(`- **${threat.playerName}** — ${threat.victoryType} [${threat.urgency.toUpperCase()}]: ${threat.detail}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}
