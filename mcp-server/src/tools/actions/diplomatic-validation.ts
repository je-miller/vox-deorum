/**
 * Shared validation utility for diplomatic action tools
 * Validates player existence, major civ status, and self-targeting
 */

import { Selectable } from "kysely";
import { PlayerInformation } from "../../knowledge/schema/public.js";
import { readPublicKnowledgeBatch } from "../../utils/knowledge/cached.js";
import { getPlayerInformations } from "../../knowledge/getters/player-information.js";

/**
 * Validated player pair returned by validateDiplomaticAction
 */
export interface ValidatedPlayers {
  player: Selectable<PlayerInformation>;
  target: Selectable<PlayerInformation>;
}

/**
 * Validates that both players exist, target is a major civ, and no self-targeting
 * @throws Error if validation fails
 */
export async function validateDiplomaticAction(
  playerID: number,
  targetID: number
): Promise<ValidatedPlayers> {
  if (playerID === targetID) {
    throw new Error("Cannot target yourself for diplomatic actions.");
  }

  const playerInfos = await readPublicKnowledgeBatch(
    "PlayerInformations", getPlayerInformations
  ) as Selectable<PlayerInformation>[];

  const player = playerInfos.find(info => info.Key === playerID);
  if (!player) {
    throw new Error(`Player with ID ${playerID} not found.`);
  }

  const target = playerInfos.find(info => info.Key === targetID);
  if (!target) {
    throw new Error(`Target player with ID ${targetID} not found.`);
  }

  if (target.IsMajor !== 1) {
    throw new Error(`Target player ${target.Civilization} is not a major civilization. Diplomatic actions only work against major civs.`);
  }

  return { player, target };
}
