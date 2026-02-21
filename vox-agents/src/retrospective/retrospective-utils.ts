/**
 * @module retrospective/retrospective-utils
 *
 * Delta computation and orchestration for the retrospective agent.
 * Compares current vs. previous game state to produce structured input for the retrospective agent.
 */

import { VoxContext } from "../infra/vox-context.js";
import { StrategistParameters, GameState } from "../strategist/strategy-parameters.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger('retrospective-utils');

/**
 * Computes the structured text input for the retrospective agent by comparing
 * current and previous game states.
 *
 * @param parameters - The strategist parameters containing game states
 * @returns Structured text input for the agent, or null if insufficient data
 */
export function computeRetrospectiveInput(parameters: StrategistParameters): string | null {
  const currentState = parameters.gameStates[parameters.turn];
  if (!currentState) return null;

  // Find the most recent previous state (not current turn)
  let previousState: GameState | undefined;
  let previousTurn: number | undefined;
  for (const turnStr of Object.keys(parameters.gameStates)) {
    const turn = Number(turnStr);
    if (turn < parameters.turn && (previousTurn === undefined || turn > previousTurn)) {
      previousTurn = turn;
      previousState = parameters.gameStates[turn];
    }
  }

  if (!previousState) return null;

  // Find self player summary from current and previous states
  const currentPlayers = currentState.players;
  const previousPlayers = previousState.players;
  if (!currentPlayers || !previousPlayers) return null;

  // PlayerSummaries is an array; find the entry for our player
  const currentSelf = findPlayerSummary(currentPlayers, parameters.playerID);
  const previousSelf = findPlayerSummary(previousPlayers, parameters.playerID);
  if (!currentSelf || !previousSelf) return null;

  // Compute deltas
  const deltas: string[] = [];
  addDelta(deltas, "Score", previousSelf.Score, currentSelf.Score);
  addDelta(deltas, "Military Strength", previousSelf.MilitaryStrength, currentSelf.MilitaryStrength);
  addDelta(deltas, "Gold/Turn", previousSelf.GoldPerTurn, currentSelf.GoldPerTurn);
  addDelta(deltas, "Science/Turn", previousSelf.SciencePerTurn, currentSelf.SciencePerTurn);
  addDelta(deltas, "Territory", previousSelf.Territory, currentSelf.Territory);
  addDelta(deltas, "Population", previousSelf.Population, currentSelf.Population);
  addDelta(deltas, "Cities", previousSelf.Cities, currentSelf.Cities);
  addDelta(deltas, "Culture/Turn", previousSelf.CulturePerTurn, currentSelf.CulturePerTurn);
  addDelta(deltas, "Tourism/Turn", previousSelf.TourismPerTurn, currentSelf.TourismPerTurn);

  // Extract last strategy decision from ledger
  let lastDecision = "No previous decision recorded.";
  if (currentState.ledger) {
    const audit = (currentState.ledger as Record<string, unknown>).DecisionAudit;
    if (Array.isArray(audit) && audit.length > 0) {
      lastDecision = typeof audit[0] === 'string' ? audit[0] : JSON.stringify(audit[0]);
    }
  }

  // Extract major events
  const majorEvents = extractMajorEvents(currentState);

  // Build the structured input
  const sections: string[] = [];

  sections.push(`## Previous Strategy (from Ledger)
${lastDecision}`);

  sections.push(`## Metric Changes (Turn ${previousTurn} → ${parameters.turn})
${deltas.length > 0 ? deltas.join('\n') : 'No significant changes.'}`);

  if (majorEvents.length > 0) {
    sections.push(`## Major Events This Turn
${majorEvents.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Finds a player's summary from the players report by playerID.
 */
function findPlayerSummary(players: any, playerID: number): any | undefined {
  if (Array.isArray(players)) {
    return players.find((p: any) => p.Key === playerID);
  }
  // Handle object format keyed by player name
  for (const key in players) {
    const p = players[key];
    if (p?.Key === playerID) return p;
  }
  return undefined;
}

/**
 * Adds a formatted delta line if both values are defined numbers.
 */
function addDelta(deltas: string[], label: string, prev: unknown, curr: unknown): void {
  if (typeof prev === 'number' && typeof curr === 'number') {
    const diff = curr - prev;
    const sign = diff > 0 ? '+' : '';
    deltas.push(`- ${label}: ${prev} → ${curr} (${sign}${diff})`);
  }
}

/**
 * Extracts major events from the current game state events.
 */
function extractMajorEvents(state: GameState): string[] {
  const events: string[] = [];
  if (!state.events) return events;

  // Events can be an array or object; iterate values
  const eventList = Array.isArray(state.events) ? state.events : Object.values(state.events);

  for (const event of eventList) {
    if (!event || typeof event !== 'object') continue;
    const type = (event as Record<string, unknown>).Type as string || (event as Record<string, unknown>).type as string || '';
    const desc = (event as Record<string, unknown>).Description as string
      || (event as Record<string, unknown>).description as string
      || (event as Record<string, unknown>).Message as string
      || '';

    // Filter for strategically significant events
    const significantTypes = [
      'WAR_DECLARED', 'PEACE_MADE', 'CITY_CAPTURED', 'CITY_FOUNDED',
      'WONDER_COMPLETED', 'PLAYER_ELIMINATED', 'GREAT_PERSON',
      'DoW', 'Peace', 'CityCapture', 'CityFounded', 'WonderBuilt',
      'WarDeclared', 'PeaceTreaty', 'CityRazed'
    ];

    if (significantTypes.some(t => type.includes(t))) {
      events.push(`- ${desc || type}`);
    }
  }

  return events;
}

/**
 * Orchestrates the retrospective agent execution.
 * Computes input, runs the agent, and stores the result.
 *
 * @param context - The VoxContext for agent execution
 * @param parameters - The strategist parameters
 * @returns The retrospective assessment text, or null if unavailable
 */
export async function requestRetrospective(
  context: VoxContext<StrategistParameters>,
  parameters: StrategistParameters
): Promise<string | null> {
  const input = computeRetrospectiveInput(parameters);
  if (!input) {
    logger.debug('No previous state available for retrospective, skipping');
    return null;
  }

  try {
    const result = await context.execute("retrospective", parameters, input);
    if (result && typeof result === 'string' && result.length > 10) {
      // Store in the current game state's reports
      parameters.gameStates[parameters.turn].reports["retrospective"] = result;
      return result;
    }
    logger.warn('Retrospective agent returned empty or short result');
    return null;
  } catch (error) {
    logger.warn('Retrospective agent failed, continuing without it', { error });
    return null;
  }
}
