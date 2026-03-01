/**
 * Tool for declaring friendship with a major civilization in Civilization V
 * Uses Lua Player API to force a mutual Declaration of Friendship
 */

import { LuaFunctionTool } from "../abstract/lua-function.js";
import * as z from "zod";
import { knowledgeManager } from "../../server.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { addReplayMessages } from "../../utils/lua/replay-messages.js";
import { validateDiplomaticAction } from "./diplomatic-validation.js";
import { trimRationale } from "../../utils/text.js";

/**
 * Schema for the result returned by the Lua script
 */
const DeclareFriendshipResultSchema = z.object({
  TargetPlayerName: z.string(),
  AtWar: z.boolean().optional(),
  AlreadyFriends: z.boolean().optional(),
  OnCooldown: z.boolean().optional()
});

type DeclareFriendshipResultType = z.infer<typeof DeclareFriendshipResultSchema>;

/**
 * Tool that forces a mutual Declaration of Friendship with a major civilization
 */
class DeclareFriendshipTool extends LuaFunctionTool<DeclareFriendshipResultType> {
  readonly name = "declare-friendship";

  readonly description = "Declare mutual friendship with a MAJOR civilization. Forces acceptance on both sides (bypasses the other AI's evaluation). Cannot be used while at war. Has a cooldown period.";

  inputSchema = z.object({
    PlayerID: z.number().min(0).describe("ID of the player declaring friendship"),
    TargetID: z.number().min(0).describe("ID of the target MAJOR civilization"),
    Rationale: z.string().describe("Briefly explain your rationale for declaring friendship")
  });

  protected resultSchema = DeclareFriendshipResultSchema;

  protected arguments = ["playerID", "targetPlayerID"];

  readonly annotations: ToolAnnotations = {
    readOnlyHint: false
  };

  readonly metadata = {
    autoComplete: ["PlayerID"]
  };

  protected script = `
    local activePlayer = Players[playerID]
    local targetPlayer = Players[targetPlayerID]
    local targetPlayerName = targetPlayer:GetCivilizationShortDescription()

    local activeTeamID = activePlayer:GetTeam()
    local targetTeamID = targetPlayer:GetTeam()
    local activeTeam = Teams[activeTeamID]

    -- Cannot declare friendship while at war
    if activeTeam:IsAtWar(targetTeamID) then
      return { TargetPlayerName = targetPlayerName, AtWar = true }
    end

    -- Check if already friends
    if activePlayer:IsDoFMessageTooSoon(targetPlayerID) then
      return { TargetPlayerName = targetPlayerName, OnCooldown = true }
    end

    if activePlayer:IsDoF(targetPlayerID) then
      return { TargetPlayerName = targetPlayerName, AlreadyFriends = true }
    end

    -- Force Declaration of Friendship (both sides)
    activePlayer:DoForceDoF(targetPlayerID)

    return { TargetPlayerName = targetPlayerName }
  `;

  async execute(args: z.infer<typeof this.inputSchema>): Promise<z.infer<typeof this.outputSchema>> {
    const { PlayerID, TargetID, Rationale: rawRationale } = args;
    const Rationale = trimRationale(rawRationale);

    await validateDiplomaticAction(PlayerID, TargetID);

    const result = await super.call(PlayerID, TargetID);

    if (result.Success && result.Result) {
      const targetName = result.Result.TargetPlayerName;

      if (result.Result.AtWar) {
        result.Success = false;
        result.Error = { Code: "AT_WAR", Message: `Cannot declare friendship with ${targetName} while at war.` };
        delete result.Result;
        return result;
      }

      if (result.Result.AlreadyFriends) {
        result.Success = false;
        result.Error = { Code: "ALREADY_FRIENDS", Message: `Already have a Declaration of Friendship with ${targetName}.` };
        delete result.Result;
        return result;
      }

      if (result.Result.OnCooldown) {
        result.Success = false;
        result.Error = { Code: "DOF_COOLDOWN", Message: `Cannot declare friendship with ${targetName} yet — cooldown period has not elapsed.` };
        delete result.Result;
        return result;
      }

      // Store the action in the knowledge database
      const store = knowledgeManager.getStore();
      await store.storeTimedKnowledgeBatch('DiplomaticActions', [{
        data: { PlayerID, TargetID, Action: "DeclareFriendship", Rationale }
      }]);

      await addReplayMessages(PlayerID, `Declared friendship with ${targetName}. Rationale: ${Rationale}`);
    }

    return result;
  }
}

/**
 * Creates a new instance of the declare-friendship tool
 */
export default function createDeclareFriendshipTool() {
  return new DeclareFriendshipTool();
}
