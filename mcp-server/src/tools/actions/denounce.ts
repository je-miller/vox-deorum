/**
 * Tool for denouncing a major civilization in Civilization V
 * Uses Lua Player API to check denounce eligibility and force denounce
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
const DenounceResultSchema = z.object({
  TargetPlayerName: z.string(),
  AlreadyDenounced: z.boolean().optional(),
  OnCooldown: z.boolean().optional()
});

type DenounceResultType = z.infer<typeof DenounceResultSchema>;

/**
 * Tool that publicly denounces a major civilization
 */
class DenounceTool extends LuaFunctionTool<DenounceResultType> {
  readonly name = "denounce";

  readonly description = "Publicly denounce a MAJOR civilization. Damages relations with the target and their friends. Has a cooldown period between denouncements.";

  inputSchema = z.object({
    PlayerID: z.number().min(0).describe("ID of the player denouncing"),
    TargetID: z.number().min(0).describe("ID of the target MAJOR civilization"),
    Rationale: z.string().describe("Briefly explain your rationale for denouncing")
  });

  protected resultSchema = DenounceResultSchema;

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

    -- Check if already denounced
    if activePlayer:IsDenouncedPlayer(targetPlayerID) then
      return { TargetPlayerName = targetPlayerName, AlreadyDenounced = true }
    end

    -- Check cooldown
    if activePlayer:IsDenounceMessageTooSoon(targetPlayerID) then
      return { TargetPlayerName = targetPlayerName, OnCooldown = true }
    end

    -- Denounce
    activePlayer:DoForceDenounce(targetPlayerID)

    return { TargetPlayerName = targetPlayerName }
  `;

  async execute(args: z.infer<typeof this.inputSchema>): Promise<z.infer<typeof this.outputSchema>> {
    const { PlayerID, TargetID, Rationale: rawRationale } = args;
    const Rationale = trimRationale(rawRationale);

    await validateDiplomaticAction(PlayerID, TargetID);

    const result = await super.call(PlayerID, TargetID);

    if (result.Success && result.Result) {
      const targetName = result.Result.TargetPlayerName;

      if (result.Result.AlreadyDenounced) {
        result.Success = false;
        result.Error = { Code: "ALREADY_DENOUNCED", Message: `Already denounced ${targetName}.` };
        delete result.Result;
        return result;
      }

      if (result.Result.OnCooldown) {
        result.Success = false;
        result.Error = { Code: "DENOUNCE_COOLDOWN", Message: `Cannot denounce ${targetName} yet — cooldown period has not elapsed.` };
        delete result.Result;
        return result;
      }

      // Store the action in the knowledge database
      const store = knowledgeManager.getStore();
      await store.storeTimedKnowledgeBatch('DiplomaticActions', [{
        data: { PlayerID, TargetID, Action: "Denounce", Rationale }
      }]);

      await addReplayMessages(PlayerID, `Denounced ${targetName}. Rationale: ${Rationale}`);
    }

    return result;
  }
}

/**
 * Creates a new instance of the denounce tool
 */
export default function createDenounceTool() {
  return new DenounceTool();
}
