/**
 * Tool for applying pre-computed flavor recipes to a player in Civilization V.
 * Recipes provide expert-tuned baseline flavor profiles for each victory path and game phase,
 * with optional per-flavor overrides for situational adjustments.
 */

import { LuaFunctionTool } from "../abstract/lua-function.js";
import * as z from "zod";
import { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { knowledgeManager } from "../../server.js";
import { MaxMajorCivs } from "../../knowledge/schema/base.js";
import { composeVisibility } from "../../utils/knowledge/visibility.js";
import { addReplayMessages } from "../../utils/lua/replay-messages.js";
import { pascalCase } from "change-case";
import { retrieveEnumName, retrieveEnumValue } from "../../utils/knowledge/enum.js";
import { loadFlavorDescriptions, loadFlavorRecipes } from "../../utils/strategies/loader.js";
import { FlavorChange } from "../../knowledge/schema/timed.js";
import { trimRationale } from "../../utils/text.js";
import { Insertable } from "kysely";

/** Valid victory type recipe names */
const recipeTypes = ["Conquest", "SpaceShip", "Culture", "UnitedNations"] as const;

/** Valid game phase names */
const phaseTypes = ["Early", "Mid", "Late"] as const;

/**
 * Schema for the result returned by the Lua script
 */
const SetFlavorsResultSchema = z.object({
  Changed: z.boolean(),
  GrandStrategy: z.number(),
  Flavors: z.record(z.string(), z.number())
});

type SetFlavorsResultType = z.infer<typeof SetFlavorsResultSchema>;

/**
 * Convert PascalCase flavor keys to FLAVOR_ format for the game engine
 */
function convertToFlavorFormat(key: string): string {
  let result = '';
  for (let i = 0; i < key.length; i++) {
    const char = key[i];
    const nextChar = key[i + 1];

    if (i > 0 && char === char.toUpperCase() &&
        (key[i - 1] === key[i - 1].toLowerCase() ||
         (nextChar && nextChar === nextChar.toLowerCase()))) {
      result += '_';
    }
    result += char.toUpperCase();
  }

  return 'FLAVOR_' + result;
}

/**
 * Tool that applies a pre-computed flavor recipe for a victory path and game phase,
 * optionally merging in caller-specified overrides before sending to the game engine.
 */
class SetStrategyRecipeTool extends LuaFunctionTool<SetFlavorsResultType> {
  /**
   * Unique identifier for the set-strategy-recipe tool
   */
  readonly name = "set-strategy-recipe";

  /**
   * Human-readable description of the tool
   */
  readonly description = "Apply a pre-computed flavor recipe for a victory path and game phase. Recipes provide expert-tuned baselines for all 34 flavors; use Overrides to tweak individual values without re-specifying the entire profile.";

  /**
   * Input schema for the set-strategy-recipe tool
   */
  inputSchema = z.object({
    PlayerID: z.number().min(0).max(MaxMajorCivs - 1).describe("ID of the player"),
    Recipe: z.enum(recipeTypes).describe("Victory path recipe to apply"),
    Phase: z.enum(phaseTypes).describe("Game phase: Early (turns 1-60), Mid (turns 61-150), Late (turns 151+)"),
    Overrides: z.record(
      z.string(),
      z.number()
    ).optional().describe("Optional flavor overrides that take precedence over recipe baseline values (0-100 scale)"),
    Rationale: z.string().describe("Briefly explain why this recipe and phase were chosen")
  });

  /**
   * Result schema - returns previous grand strategy and flavor values
   */
  protected resultSchema = SetFlavorsResultSchema;

  /**
   * The Lua function arguments
   */
  protected arguments = ["playerID", "flavors", "grandId"];

  /**
   * Annotations for the tool
   */
  readonly annotations: ToolAnnotations = {
    readOnlyHint: false
  }

  /**
   * Optional metadata
   */
  readonly metadata = {
    autoComplete: ["PlayerID"]
  }

  /**
   * The Lua script to execute - identical to set-flavors
   */
  protected script = `
    local activePlayer = Players[playerID]
    local changed = false

    -- Capture previous grand strategy
    local previousGrandStrategy = activePlayer:GetGrandStrategy()

    -- Get ALL current custom flavors using GetCustomFlavors
    local previousFlavors = activePlayer:GetCustomFlavors()

    -- Set grand strategy if provided
    if grandId ~= -1 then
      if activePlayer:SetGrandStrategy(grandId) then
        changed = true
      end
    end

    -- Set custom flavors if provided
    if flavors then
      if activePlayer:SetCustomFlavors(flavors) then
        changed = true
      end
    end

    -- Return the previous values
    return {
      Changed = changed,
      GrandStrategy = previousGrandStrategy,
      Flavors = previousFlavors
    }
  `;

  /**
   * Execute the set-strategy-recipe command
   */
  async execute(args: z.infer<typeof this.inputSchema>): Promise<z.infer<typeof this.outputSchema>> {
    const { Rationale: rawRationale, ...otherArgs } = args;
    const Rationale = trimRationale(rawRationale);

    // Load the recipe data and valid flavor keys
    const [recipes, validFlavors] = await Promise.all([
      loadFlavorRecipes(),
      loadFlavorDescriptions()
    ]);
    const validFlavorKeys = Object.keys(validFlavors);

    // Look up the requested recipe and phase
    const victoryRecipes = recipes[otherArgs.Recipe];
    if (!victoryRecipes) {
      return {
        Success: false,
        Error: {
          Code: "INVALID_RECIPE",
          Message: `Unknown recipe "${otherArgs.Recipe}". Valid recipes: ${recipeTypes.join(", ")}`
        }
      };
    }

    const phaseRecipe = victoryRecipes[otherArgs.Phase];
    if (!phaseRecipe) {
      return {
        Success: false,
        Error: {
          Code: "INVALID_PHASE",
          Message: `Unknown phase "${otherArgs.Phase}". Valid phases: ${phaseTypes.join(", ")}`
        }
      };
    }

    // Merge recipe baseline with overrides (overrides take precedence)
    const mergedFlavors: Record<string, number> = { ...phaseRecipe };
    if (otherArgs.Overrides) {
      for (const [key, value] of Object.entries(otherArgs.Overrides)) {
        if (validFlavorKeys.includes(key)) {
          mergedFlavors[key] = Math.max(0, Math.min(100, value));
        }
      }
    }

    // Convert PascalCase keys to FLAVOR_ format, filtering to valid flavors only
    const flavorsTable: Record<string, number> = {};
    const newFlavors: Record<string, number> = {};
    for (const [key, value] of Object.entries(mergedFlavors)) {
      if (validFlavorKeys.includes(key)) {
        const clampedValue = Math.max(0, Math.min(100, value));
        flavorsTable[convertToFlavorFormat(key)] = clampedValue;
        newFlavors[key] = clampedValue;
      }
    }

    // Resolve grand strategy enum from the recipe name
    const grandStrategyId = retrieveEnumValue("GrandStrategy", otherArgs.Recipe);

    // Call the Lua script
    const result = await super.call(otherArgs.PlayerID, flavorsTable, grandStrategyId);

    if (result.Success) {
      const store = knowledgeManager.getStore();
      const previous = result.Result!;

      // Build the flavor change record
      const flavorChange: Partial<Insertable<FlavorChange>> = {
        Rationale: Rationale
      };

      // Convert previous flavors from FLAVOR_ format to PascalCase
      const currentFlavors: Record<string, number> = {};
      for (const [key, value] of Object.entries(previous.Flavors)) {
        const withoutPrefix = key.replace(/^FLAVOR_/, '');
        const pascalKey = pascalCase(withoutPrefix);
        currentFlavors[pascalKey] = value as number;
      }

      const changeDescriptions: string[] = [];

      // Track grand strategy change
      const previousGrandStrategy = retrieveEnumName("GrandStrategy", previous.GrandStrategy);
      if (previousGrandStrategy !== otherArgs.Recipe) {
        changeDescriptions.push(`Grand Strategy: ${previousGrandStrategy} -> ${otherArgs.Recipe}`);
      }
      flavorChange.GrandStrategy = retrieveEnumName("GrandStrategy", grandStrategyId);

      // Compare flavor values and record changes
      for (const [key, value] of Object.entries(newFlavors)) {
        const beforeValue = currentFlavors?.[key];
        if (beforeValue !== undefined && beforeValue !== value) {
          changeDescriptions.push(`${key}: ${beforeValue} -> ${value}`);
        }
      }
      Object.assign(currentFlavors, newFlavors);

      // Store ALL flavors in the knowledge store
      for (const key of validFlavorKeys) {
        (flavorChange as any)[key] = currentFlavors[key] ?? 50;
      }

      // Persist to database
      await store.storeMutableKnowledge(
        'FlavorChanges',
        otherArgs.PlayerID,
        flavorChange,
        composeVisibility([otherArgs.PlayerID])
      );

      // Send replay messages for actual changes
      if (changeDescriptions.length > 0) {
        const message = `Recipe applied: ${otherArgs.Recipe}/${otherArgs.Phase}. Changes: ${changeDescriptions.join("; ")}. Rationale: ${Rationale}`;
        await addReplayMessages(otherArgs.PlayerID, message);
      }
    }

    delete result.Result;
    return result;
  }
}

/**
 * Creates a new instance of the set strategy recipe tool
 */
export default function createSetStrategyRecipeTool() {
  return new SetStrategyRecipeTool();
}
