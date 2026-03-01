/**
 * Tool for declaring war on a major civilization in Civilization V
 * Uses Lua Teams API to check war eligibility and declare war
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
const DeclareWarResultSchema = z.object({
  TargetPlayerName: z.string(),
  AlreadyAtWar: z.boolean().optional(),
  CannotDeclareWar: z.boolean().optional()
});

type DeclareWarResultType = z.infer<typeof DeclareWarResultSchema>;

/**
 * Tool that declares war on a major civilization
 */
class DeclareWarTool extends LuaFunctionTool<DeclareWarResultType> {
  readonly name = "declare-war";

  readonly description = "Declare war on a MAJOR civilization. Irreversible for several turns — consider military readiness. Does not work on city-states.";

  inputSchema = z.object({
    PlayerID: z.number().min(0).describe("ID of the player declaring war"),
    TargetID: z.number().min(0).describe("ID of the target MAJOR civilization"),
    Rationale: z.string().describe("Briefly explain your rationale for declaring war")
  });

  protected resultSchema = DeclareWarResultSchema;

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

    -- Check if already at war
    if activeTeam:IsAtWar(targetTeamID) then
      return { TargetPlayerName = targetPlayerName, AlreadyAtWar = true }
    end

    -- Check if war declaration is allowed
    if not activeTeam:CanDeclareWar(targetTeamID) then
      return { TargetPlayerName = targetPlayerName, CannotDeclareWar = true }
    end

    -- Declare war
    activeTeam:DeclareWar(targetTeamID)

    return { TargetPlayerName = targetPlayerName }
  `;

  async execute(args: z.infer<typeof this.inputSchema>): Promise<z.infer<typeof this.outputSchema>> {
    const { PlayerID, TargetID, Rationale: rawRationale } = args;
    const Rationale = trimRationale(rawRationale);

    await validateDiplomaticAction(PlayerID, TargetID);

    const result = await super.call(PlayerID, TargetID);

    if (result.Success && result.Result) {
      const targetName = result.Result.TargetPlayerName;

      if (result.Result.AlreadyAtWar) {
        result.Success = false;
        result.Error = { Code: "ALREADY_AT_WAR", Message: `Already at war with ${targetName}.` };
        delete result.Result;
        return result;
      }

      if (result.Result.CannotDeclareWar) {
        result.Success = false;
        result.Error = { Code: "CANNOT_DECLARE_WAR", Message: `Cannot declare war on ${targetName}. A peace treaty or game rule may be preventing this.` };
        delete result.Result;
        return result;
      }

      // Store the action in the knowledge database
      const store = knowledgeManager.getStore();
      await store.storeTimedKnowledgeBatch('DiplomaticActions', [{
        data: { PlayerID, TargetID, Action: "DeclareWar", Rationale }
      }]);

      await addReplayMessages(PlayerID, `Declared war on ${targetName}. Rationale: ${Rationale}`);
    }

    return result;
  }
}

/**
 * Creates a new instance of the declare-war tool
 */
export default function createDeclareWarTool() {
  return new DeclareWarTool();
}
