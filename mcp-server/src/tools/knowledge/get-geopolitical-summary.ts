/**
 * Tool for retrieving geopolitical summary for a player.
 * Computes neighbor distances, border terrain, coastal access, and route connectivity.
 */

import { LuaFunctionTool } from "../abstract/lua-function.js";
import * as z from "zod";
import { MaxMajorCivs } from "../../knowledge/schema/base.js";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/** Schema for a single neighbor's geopolitical data */
const NeighborSchema = z.object({
  CapitalDistance: z.number(),
  BorderTerrain: z.object({
    Mountain: z.number(),
    Hill: z.number(),
    Plains: z.number(),
    Water: z.number()
  }),
  HasCoastalCity: z.boolean(),
  RouteType: z.string()
});

/** Schema for the full geopolitical summary result */
const GeopoliticalSummaryResultSchema = z.object({
  Neighbors: z.record(z.string(), NeighborSchema),
  OurCoastalCities: z.number(),
  OurTotalCities: z.number()
});

/** Type for the geopolitical summary result */
export type GeopoliticalSummaryType = z.infer<typeof GeopoliticalSummaryResultSchema>;

/**
 * Retrieves geopolitical summary including neighbor distances, border terrain,
 * coastal access, and route connectivity for a given player.
 */
class GetGeopoliticalSummaryTool extends LuaFunctionTool<GeopoliticalSummaryType> {
  /** Unique identifier for the geopolitical summary tool */
  readonly name = "get-geopolitical-summary";

  /** Human-readable description of the tool */
  readonly description = "Retrieves geopolitical summary including neighbor distances, border terrain, and route connectivity";

  /** Schema for validating tool inputs */
  readonly inputSchema = z.object({
    PlayerID: z.number().min(0).max(MaxMajorCivs - 1).describe("Player ID to compute geopolitical summary for")
  });

  /** Schema for the result data */
  protected readonly resultSchema = GeopoliticalSummaryResultSchema;

  /** Lua function arguments */
  protected readonly arguments = ["playerID"];

  /** Path to the Lua script file */
  protected readonly scriptFile = "get-geopolitical-summary.lua";

  /** Tool annotations */
  readonly annotations: ToolAnnotations = { readOnlyHint: true };

  /** Tool metadata for auto-completion */
  readonly metadata = { autoComplete: ["PlayerID"] };

  /** Execute the tool with the provided arguments */
  async execute(args: z.infer<typeof this.inputSchema>) {
    const result = await this.call(args.PlayerID);
    if (!result.Success) {
      throw new Error(`Failed to get geopolitical summary: ${result.Error?.Message || 'Unknown error'}`);
    }
    return {
      Success: true,
      Result: result.Result
    };
  }
}

/** Creates a new instance of the geopolitical summary tool */
export default function createGetGeopoliticalSummaryTool() {
  return new GetGeopoliticalSummaryTool();
}
