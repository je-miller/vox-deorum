/**
 * Tool for gifting gold to a city-state to gain influence in Civilization V
 * Uses Lua Player API to deduct gold and add influence with a minor civilization
 */

import { LuaFunctionTool } from "../abstract/lua-function.js";
import * as z from "zod";
import { knowledgeManager } from "../../server.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { addReplayMessages } from "../../utils/lua/replay-messages.js";
import { trimRationale } from "../../utils/text.js";

/**
 * Schema for the result returned by the Lua script
 */
const GiftCityStateResultSchema = z.object({
  TargetName: z.string(),
  NotCityState: z.boolean().optional(),
  InsufficientGold: z.boolean().optional(),
  CurrentGold: z.number().optional(),
  GoldSpent: z.number().optional(),
  InfluenceBefore: z.number().optional(),
  InfluenceAfter: z.number().optional(),
  InfluenceGained: z.number().optional(),
  RemainingGold: z.number().optional()
});

type GiftCityStateResultType = z.infer<typeof GiftCityStateResultSchema>;

/**
 * Tool that gifts gold to a city-state to gain influence
 */
class GiftCityStateTool extends LuaFunctionTool<GiftCityStateResultType> {
  readonly name = "gift-city-state";

  readonly description = "Gift gold to a city-state to gain influence. Amount must be a positive multiple of 250 (standard increments: 250, 500, 1000). Higher gifts yield proportionally more influence.";

  inputSchema = z.object({
    PlayerID: z.number().min(0).max(21).describe("ID of the player gifting gold"),
    CityStateID: z.number().min(0).max(62).describe("ID of the target city-state"),
    Amount: z.number().describe("Amount of gold to gift. Must be a positive multiple of 250 (standard gift increments: 250, 500, 1000)"),
    Rationale: z.string().describe("Briefly explain your rationale for gifting gold to this city-state")
  });

  protected resultSchema = GiftCityStateResultSchema;

  protected arguments = ["playerID", "cityStateID", "amount"];

  readonly annotations: ToolAnnotations = {
    readOnlyHint: false
  };

  readonly metadata = {
    autoComplete: ["PlayerID"]
  };

  protected script = `
    local activePlayer = Players[playerID]
    local targetPlayer = Players[cityStateID]
    local targetPlayerName = targetPlayer:GetCivilizationShortDescription()

    -- Verify target is a city-state
    if not targetPlayer:IsMinorCiv() then
      return { TargetName = targetPlayerName, NotCityState = true }
    end

    -- Check if player has enough gold
    local currentGold = activePlayer:GetGold()
    if currentGold < amount then
      return { TargetName = targetPlayerName, InsufficientGold = true, CurrentGold = currentGold }
    end

    -- Get influence before gift
    local influenceBefore = Players[cityStateID]:GetMinorCivFriendshipWithMajor(playerID)

    -- Calculate influence using the game's built-in formula
    -- Accounts for era, Patronage policies, city-state personality, traits, etc.
    local influenceChange = Players[cityStateID]:GetFriendshipFromGoldGift(playerID, amount)

    -- Execute the gift (deduct gold and add influence)
    activePlayer:ChangeGold(-amount)
    Players[cityStateID]:ChangeMinorCivFriendshipWithMajor(playerID, influenceChange)
    local influenceAfter = Players[cityStateID]:GetMinorCivFriendshipWithMajor(playerID)

    return {
      TargetName = targetPlayerName,
      GoldSpent = amount,
      InfluenceBefore = influenceBefore,
      InfluenceAfter = influenceAfter,
      InfluenceGained = influenceAfter - influenceBefore,
      RemainingGold = activePlayer:GetGold()
    }
  `;

  async execute(args: z.infer<typeof this.inputSchema>): Promise<z.infer<typeof this.outputSchema>> {
    const { PlayerID, CityStateID, Amount, Rationale: rawRationale } = args;
    const Rationale = trimRationale(rawRationale);

    // Validate that CityStateID is not the same as PlayerID
    if (CityStateID === PlayerID) {
      throw new Error("Cannot gift gold to yourself.");
    }

    // Validate Amount is positive and a multiple of 250
    if (Amount <= 0 || Amount % 250 !== 0) {
      throw new Error("Amount must be a positive multiple of 250 (e.g., 250, 500, 1000).");
    }

    const result = await super.call(PlayerID, CityStateID, Amount);

    if (result.Success && result.Result) {
      const targetName = result.Result.TargetName;

      if (result.Result.NotCityState) {
        result.Success = false;
        result.Error = { Code: "NOT_CITY_STATE", Message: `${targetName} is not a city-state. Use diplomatic tools for major civilizations.` };
        delete result.Result;
        return result;
      }

      if (result.Result.InsufficientGold) {
        result.Success = false;
        result.Error = { Code: "INSUFFICIENT_GOLD", Message: `Not enough gold to gift ${Amount} to ${targetName}. Current gold: ${result.Result.CurrentGold}.` };
        delete result.Result;
        return result;
      }

      // Store the action in the knowledge database
      const store = knowledgeManager.getStore();
      await store.storeTimedKnowledgeBatch('DiplomaticActions', [{
        data: { PlayerID, TargetID: CityStateID, Action: "GiftCityState", Amount, Rationale }
      }]);

      await addReplayMessages(PlayerID, `Gifted ${Amount} gold to ${targetName}. Gained ${result.Result.InfluenceGained} influence. Rationale: ${Rationale}`);
    }

    return result;
  }
}

/**
 * Creates a new instance of the gift-city-state tool
 */
export default function createGiftCityStateTool() {
  return new GiftCityStateTool();
}
