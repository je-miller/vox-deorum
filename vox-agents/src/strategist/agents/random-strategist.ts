/**
 * @module strategist/random-strategist
 *
 * Random strategist agent implementation.
 * Used for testing or running games without LLM-based decision making.
 */

import { ModelMessage, StepResult, Tool } from "ai";
import { Strategist } from "../strategist.js";
import { VoxContext } from "../../infra/vox-context.js";
import { StrategistParameters } from "../strategy-parameters.js";
import { log } from "console";

/**
 * A do-nothing strategist agent that fetches game state but takes no actions.
 * Used as a baseline for performance comparison or testing infrastructure.
 *
 * @class
 */
export class RandomStrategist extends Strategist {
  /**
   * The name identifier for this agent
   */
  readonly name = "random-strategist";

  /**
   * Human-readable description of what this agent does
   */
  readonly description = "Random agent that fetches game state and modifies flavor weights randomly";

  readonly grandStrategies = [
    "Conquest",
    "Culture",
    "UnitedNations",
    "Spaceship"
  ];

  readonly flavorNames = [
    "Offense",
    "Defense",
    "UseNuke",
    "CityDefense",
    "MilitaryTraining",

    "Mobilization",
    "Recon",
    "Ranged",
    "Mobile",
    "Nuke",
    "Naval",
    "NavalRecon",
    "Air",
    "AirCarrier",
    "Antiair",
    "Airlift",

    "NavalGrowth",
    "NavalTileImprovement",
    "Expansion",
    "Growth",
    "TileImprovement",
    "Infrastructure",
    "Production",
    "Gold",
    "Science",
    "Culture",
    "WaterConnection",
    "Happiness",
    "GreatPeople",
    "Wonder",
    "Religion",
    "Diplomacy",
    "Spaceship",
    "Espionage",
  ];
  
  /**
   * Gets the system prompt for the strategist
   */
  public async getSystem(parameters: StrategistParameters, _input: unknown, context: VoxContext<StrategistParameters>): Promise<string> {
    log("Random strategist getSystem()");

    const grandStrategy = this.grandStrategies[Math.floor(Math.random() * this.grandStrategies.length)];
    console.log(`    Grand Strategy: ${grandStrategy}`);

    let flavors: Record<string, number> = {};
    this.flavorNames.forEach((flavor, index) => {
      flavors[flavor] = Math.floor(Math.random() * 10);
      console.log(`    Flavor: ${flavor}, Value: ${flavors[flavor]}`);
    });

    context.callTool("set-flavors",
    {
      PlayerID: parameters.playerID,
      GrandStrategy: grandStrategy,
      Rationale: "Randomly selected strategy and flavor weights",
      Flavors: flavors
    },
    {
      after: 0,
      before: 0,
      workingMemory: {},
      gameStates: {},
      mode: "Flavor",
      playerID: 0,
      gameID: "",
      turn: 0
    });
    return "";
  }
  
  /**
   * Gets the initial messages for the conversation
   */
  public async getInitialMessages(parameters: StrategistParameters, input: unknown, context: VoxContext<StrategistParameters>): Promise<ModelMessage[]> {
    // Get the information
    await super.getInitialMessages(parameters, input, context);
    // Return the messages
    return [];
  }
  
  /**
   * Determines whether the agent should stop execution
   */
  public stopCheck(
    _parameters: StrategistParameters,
    _input: unknown,
    _lastStep: StepResult<Record<string, Tool>>,
    _allSteps: StepResult<Record<string, Tool>>[]
  ): boolean {
    return true;
  }
}