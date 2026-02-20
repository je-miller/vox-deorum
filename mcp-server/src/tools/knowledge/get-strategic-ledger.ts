/**
 * Tool for retrieving the strategic ledger for a player
 * Provides cross-turn memory and decision audit for the strategist
 */

import { ToolBase } from "../base.js";
import * as z from "zod";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { MaxMajorCivs } from "../../knowledge/schema/base.js";
import { knowledgeManager } from "../../server.js";

/**
 * Input schema for the GetStrategicLedger tool
 */
const GetStrategicLedgerInputSchema = z.object({
  PlayerID: z.number().min(0).max(MaxMajorCivs - 1).describe("Player ID to retrieve the strategic ledger for")
});

/**
 * Schema for a single decision audit entry
 */
const DecisionAuditEntrySchema = z.object({
  Turn: z.number(),
  GrandStrategy: z.string().nullable(),
  Rationale: z.string()
});

/**
 * Output schema for the GetStrategicLedger tool
 */
const GetStrategicLedgerOutputSchema = z.object({
  ActivePlan: z.string().nullable(),
  Hypotheses: z.string().nullable(),
  DiplomaticCommitments: z.string().nullable(),
  ThreatAssessment: z.string().nullable(),
  VictoryRoadmap: z.string().nullable(),
  DecisionAudit: z.array(DecisionAuditEntrySchema)
});

/**
 * Type for the tool's output
 */
export type StrategicLedgerReport = z.infer<typeof GetStrategicLedgerOutputSchema>;

/**
 * Tool for retrieving the strategic ledger for a player
 */
class GetStrategicLedgerTool extends ToolBase {
  readonly name = "get-strategic-ledger";
  readonly description = "Retrieves the player's strategic ledger (cross-turn memory) and recent decision audit";

  readonly inputSchema = GetStrategicLedgerInputSchema;
  readonly outputSchema = GetStrategicLedgerOutputSchema;

  readonly annotations: ToolAnnotations = {
    readOnlyHint: true
  };

  readonly metadata = {
    autoComplete: ["PlayerID"]
  };

  async execute(args: z.infer<typeof this.inputSchema>): Promise<z.infer<typeof this.outputSchema>> {
    const store = knowledgeManager.getStore();
    const playerID = args.PlayerID;

    // Read the latest ledger for this player
    const ledger = await store.getMutableKnowledge('StrategicLedgers', playerID, playerID);

    // Read last 5 LLM-authored strategy changes (filter out "Tweaked by In-Game AI" rationale)
    const strategyHistory = await store.getMutableKnowledgeHistory('StrategyChanges', playerID, playerID);
    const decisionAudit = strategyHistory
      .filter(entry => !entry.Rationale?.startsWith("Tweaked by In-Game AI"))
      .slice(0, 5)
      .map(entry => ({
        Turn: entry.Turn,
        GrandStrategy: entry.GrandStrategy,
        Rationale: entry.Rationale
      }));

    return {
      ActivePlan: ledger?.ActivePlan ?? null,
      Hypotheses: ledger?.Hypotheses ?? null,
      DiplomaticCommitments: ledger?.DiplomaticCommitments ?? null,
      ThreatAssessment: ledger?.ThreatAssessment ?? null,
      VictoryRoadmap: ledger?.VictoryRoadmap ?? null,
      DecisionAudit: decisionAudit
    };
  }
}

/**
 * Creates a new instance of the get strategic ledger tool
 */
export default function createGetStrategicLedgerTool() {
  return new GetStrategicLedgerTool();
}
