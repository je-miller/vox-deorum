/**
 * Tool for making peace with a major civilization in Civilization V
 * Uses Lua Teams API to check peace eligibility and force peace
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
const MakePeaceResultSchema = z.object({
  TargetPlayerName: z.string(),
  NotAtWar: z.boolean().optional(),
  CannotMakePeace: z.boolean().optional(),
  TurnsLockedIntoWar: z.number().optional()
});

type MakePeaceResultType = z.infer<typeof MakePeaceResultSchema>;

/**
 * Tool that forces peace with a major civilization (no deal negotiation)
 */
class MakePeaceTool extends LuaFunctionTool<MakePeaceResultType> {
  readonly name = "make-peace";

  readonly description = "End an ongoing war with a MAJOR civilization. Forces peace without deal terms. May fail if locked into minimum war turns.";

  inputSchema = z.object({
    PlayerID: z.number().min(0).describe("ID of the player making peace"),
    TargetID: z.number().min(0).describe("ID of the target MAJOR civilization"),
    Rationale: z.string().describe("Briefly explain your rationale for making peace")
  });

  protected resultSchema = MakePeaceResultSchema;

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

    -- Check if actually at war
    if not activeTeam:IsAtWar(targetTeamID) then
      return { TargetPlayerName = targetPlayerName, NotAtWar = true }
    end

    -- Check if peace is allowed (war lock-in period)
    if not activeTeam:CanChangeWarPeace(targetTeamID) then
      local turnsLocked = activeTeam:GetNumTurnsLockedIntoWar(targetTeamID)
      return { TargetPlayerName = targetPlayerName, CannotMakePeace = true, TurnsLockedIntoWar = turnsLocked }
    end

    -- Make peace
    activeTeam:MakePeace(targetTeamID)

    return { TargetPlayerName = targetPlayerName }
  `;

  async execute(args: z.infer<typeof this.inputSchema>): Promise<z.infer<typeof this.outputSchema>> {
    const { PlayerID, TargetID, Rationale: rawRationale } = args;
    const Rationale = trimRationale(rawRationale);

    await validateDiplomaticAction(PlayerID, TargetID);

    const result = await super.call(PlayerID, TargetID);

    if (result.Success && result.Result) {
      const targetName = result.Result.TargetPlayerName;

      if (result.Result.NotAtWar) {
        result.Success = false;
        result.Error = { Code: "NOT_AT_WAR", Message: `Not at war with ${targetName}.` };
        delete result.Result;
        return result;
      }

      if (result.Result.CannotMakePeace) {
        const turnsMsg = result.Result.TurnsLockedIntoWar
          ? ` ${result.Result.TurnsLockedIntoWar} turns of war lock-in remaining.`
          : "";
        result.Success = false;
        result.Error = { Code: "WAR_LOCKED", Message: `Cannot make peace with ${targetName} yet.${turnsMsg}` };
        delete result.Result;
        return result;
      }

      // Store the action in the knowledge database
      const store = knowledgeManager.getStore();
      await store.storeTimedKnowledgeBatch('DiplomaticActions', [{
        data: { PlayerID, TargetID, Action: "MakePeace", Rationale }
      }]);

      await addReplayMessages(PlayerID, `Made peace with ${targetName}. Rationale: ${Rationale}`);
    }

    return result;
  }
}

/**
 * Creates a new instance of the make-peace tool
 */
export default function createMakePeaceTool() {
  return new MakePeaceTool();
}
