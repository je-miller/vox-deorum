/**
 * Tool for updating the strategic ledger for a player
 * Supports partial updates via read-merge-write pattern
 */

import { ToolBase } from "../base.js";
import * as z from "zod";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { MaxMajorCivs } from "../../knowledge/schema/base.js";
import { knowledgeManager } from "../../server.js";
import { composeVisibility } from "../../utils/knowledge/visibility.js";

/**
 * Input schema for the UpdateStrategicLedger tool
 */
const UpdateStrategicLedgerInputSchema = z.object({
  PlayerID: z.number().min(0).max(MaxMajorCivs - 1).describe("Player ID to update the strategic ledger for"),
  ActivePlan: z.string().nullable().optional().describe("Multi-turn plan with milestones"),
  Hypotheses: z.string().nullable().optional().describe("Assumptions about opponents"),
  DiplomaticCommitments: z.string().nullable().optional().describe("Promises, debts, trust assessments"),
  ThreatAssessment: z.string().nullable().optional().describe("Ranked threats with trends"),
  VictoryRoadmap: z.string().nullable().optional().describe("Milestones for victory path")
});

/**
 * Output schema for the UpdateStrategicLedger tool
 */
const UpdateStrategicLedgerOutputSchema = z.object({
  Success: z.boolean(),
  UpdatedFields: z.array(z.string())
});

/**
 * Tool for updating the strategic ledger
 */
class UpdateStrategicLedgerTool extends ToolBase {
  readonly name = "update-strategic-ledger";
  readonly description = "Updates the player's strategic ledger (cross-turn memory). Supports partial updates - only provided fields are changed.";

  readonly inputSchema = UpdateStrategicLedgerInputSchema;
  readonly outputSchema = UpdateStrategicLedgerOutputSchema;

  readonly annotations: ToolAnnotations = {
    readOnlyHint: false
  };

  readonly metadata = {
    autoComplete: ["PlayerID"]
  };

  async execute(args: z.infer<typeof this.inputSchema>): Promise<z.infer<typeof this.outputSchema>> {
    const store = knowledgeManager.getStore();
    const playerID = args.PlayerID;

    // Read current ledger for merge
    const current = await store.getMutableKnowledge('StrategicLedgers', playerID, playerID);

    // Merge: provided fields override, missing fields keep current values
    const merged = {
      ActivePlan: args.ActivePlan !== undefined ? args.ActivePlan : (current?.ActivePlan ?? null),
      Hypotheses: args.Hypotheses !== undefined ? args.Hypotheses : (current?.Hypotheses ?? null),
      DiplomaticCommitments: args.DiplomaticCommitments !== undefined ? args.DiplomaticCommitments : (current?.DiplomaticCommitments ?? null),
      ThreatAssessment: args.ThreatAssessment !== undefined ? args.ThreatAssessment : (current?.ThreatAssessment ?? null),
      VictoryRoadmap: args.VictoryRoadmap !== undefined ? args.VictoryRoadmap : (current?.VictoryRoadmap ?? null),
    };

    // Track which fields were actually updated
    const updatedFields = Object.keys(args).filter(k => k !== 'PlayerID') as string[];

    // Store the merged ledger
    await store.storeMutableKnowledge(
      'StrategicLedgers',
      playerID,
      merged,
      composeVisibility([playerID])
    );

    return {
      Success: true,
      UpdatedFields: updatedFields
    };
  }
}

/**
 * Creates a new instance of the update strategic ledger tool
 */
export default function createUpdateStrategicLedgerTool() {
  return new UpdateStrategicLedgerTool();
}
