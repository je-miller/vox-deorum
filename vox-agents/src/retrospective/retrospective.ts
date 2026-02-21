/**
 * @module retrospective/retrospective
 *
 * Retrospective agent that evaluates whether the previous strategy is working.
 * Runs before the strategist each turn to provide a self-evaluation feedback loop.
 */

import { ModelMessage } from "ai";
import { Briefer } from "../briefer/briefer.js";
import { VoxContext } from "../infra/vox-context.js";
import { StrategistParameters } from "../strategist/strategy-parameters.js";
import { getModelConfig } from "../utils/models/models.js";
import { Model } from "../types/index.js";

/**
 * Retrospective agent that analyzes whether the previous strategy is working
 * by comparing current vs. previous game state and the last strategy decision.
 *
 * @class
 */
export class Retrospective extends Briefer {
  readonly name = "retrospective";
  readonly description = "Evaluates previous strategy effectiveness by comparing game state deltas and recent decisions";

  /**
   * Gets the system prompt for the retrospective agent
   */
  public async getSystem(_parameters: StrategistParameters, _input: string, _context: VoxContext<StrategistParameters>): Promise<string> {
    return `You are a concise strategic analyst for Civilization V with the Vox Populi mod.
Evaluate whether the previous strategy is working based on the delta metrics, events, and relative position data.
Produce a 2-3 sentence assessment that is direct and actionable.
Focus on what changed, whether the changes align with the stated strategy, and any emerging risks or opportunities.
Pay attention to the relative position vs opponents and multi-turn trends — falling behind is a stronger signal than single-turn fluctuations.
Do NOT suggest specific actions — only assess the situation.`.trim();
  }

  /**
   * Gets the initial messages for the conversation
   */
  public async getInitialMessages(_parameters: StrategistParameters, input: string, _context: VoxContext<StrategistParameters>): Promise<ModelMessage[]> {
    return [{
      role: "user",
      content: input
    }];
  }

  /**
   * Gets the language model to use for this agent execution
   */
  public getModel(_parameters: StrategistParameters, _input: unknown, overrides: Record<string, Model | string>): Model {
    return getModelConfig("retrospective", "low", overrides);
  }

  /**
   * Override postprocessOutput to store in the "retrospective" report key instead of "briefing"
   */
  public postprocessOutput(
    parameters: StrategistParameters,
    _input: string,
    output: string
  ): string {
    parameters.gameStates[parameters.turn].reports["retrospective"] = output;
    return output;
  }
}
