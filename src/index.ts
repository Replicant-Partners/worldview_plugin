import {
  type Plugin,
  type IAgentRuntime,
  type Memory,
  type State,
  type Action,
  type ActionResult,
  type HandlerCallback,
  Service,
  logger as elizaLogger,
} from "@elizaos/core";
import { join } from "path";
import { WorldviewGraph } from "./graph";
import { PatternObserver } from "./observer";
import { Suggestion } from "./types";

export interface WorldviewConfig {
  evolutionIntervalMs?: number;
  autoApplyThreshold?: number;
  minObservations?: number;
  memoryLookback?: number;
}

// Store plugin state globally (since ElizaOS plugins are plain objects)
const pluginState = new Map<
  string,
  {
    graph: WorldviewGraph;
    observer: PatternObserver;
    suggestionQueue: Suggestion[];
    evolutionInterval: NodeJS.Timeout | null;
    config: Required<WorldviewConfig>;
  }
>();

// Helper to get agent-specific state
function getState(runtime: IAgentRuntime) {
  return pluginState.get(runtime.agentId);
}

// Evolution function
async function evolve(runtime: IAgentRuntime): Promise<void> {
  const state = getState(runtime);
  if (!state) return;

  const { graph, observer, config } = state;

  try {
    // Get recent memories
    const memories = await runtime.getMemories({
      roomId: runtime.agentId,
      count: config.memoryLookback,
      unique: false,
      tableName: "messages",
    });

    if (memories.length === 0) return;

    // Detect patterns and generate suggestions
    const suggestions = observer.analyze(memories);
    if (suggestions.length === 0) return;

    elizaLogger.debug(
      `[Worldview] Generated suggestions - count: ${suggestions.length}, highConfidence: ${suggestions.filter((s) => s.confidence >= config.autoApplyThreshold).length}`,
    );

    let applied = 0;
    let queued = 0;

    // Auto-apply high confidence suggestions
    for (const suggestion of suggestions) {
      if (suggestion.confidence >= config.autoApplyThreshold) {
        graph.apply(suggestion);
        applied++;
        elizaLogger.debug(
          `[Worldview] Auto-applied suggestion - type: ${suggestion.type}, confidence: ${suggestion.confidence.toFixed(2)}, preview: ${suggestion.preview}`,
        );
      } else if (suggestion.confidence >= 0.7) {
        state.suggestionQueue.push(suggestion);
        queued++;
      }
    }

    // Persist changes if any were applied
    if (applied > 0) {
      await graph.save();
      const stats = graph.getStats();
      elizaLogger.info(
        `[Worldview] Evolution complete - applied: ${applied}, queued: ${queued}, entities: ${stats.entities}, relationships: ${stats.relationships}`,
      );
    }
  } catch (error) {
    elizaLogger.error("[Worldview] Evolution error", error);
  }
}

// Actions
const getWorldviewAction: Action = {
  name: "GET_WORLDVIEW",
  similes: ["SHOW_WORLDVIEW", "VIEW_WORLDVIEW"],
  description: "Get the current worldview as a Mermaid diagram",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
  ): Promise<ActionResult> => {
    const state = getState(runtime);
    if (!state) {
      return {
        success: false,
        error: new Error("Worldview not initialized"),
      };
    }

    const diagram = state.graph.toMermaid();
    const stats = state.graph.getStats();

    await callback({
      text: `Current Worldview:\n\`\`\`mermaid\n${diagram}\n\`\`\`\n\nStats: ${stats.entities} entities, ${stats.relationships} relationships`,
      source: message.content.source,
    });

    return {
      success: true,
      text: "Worldview retrieved",
      data: { diagram, stats },
    };
  },

  examples: [],
};

const queryWorldviewAction: Action = {
  name: "QUERY_WORLDVIEW",
  similes: ["SEARCH_WORLDVIEW", "FIND_ENTITIES"],
  description: "Query entities in the worldview",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
  ): Promise<ActionResult> => {
    const state = getState(runtime);
    if (!state) {
      return {
        success: false,
        error: new Error("Worldview not initialized"),
      };
    }

    // Extract entity type from message
    const text = message.content?.text || "";
    const entityMatch = text.match(/entity[:\s]+(\w+)/i);
    const entity = entityMatch ? entityMatch[1] : undefined;

    if (entity) {
      const results = state.graph.query({ type: entity.toUpperCase() });

      await callback({
        text: `Found ${results.length} entities of type ${entity}`,
        source: message.content.source,
      });

      return {
        success: true,
        text: `Query returned ${results.length} results`,
        data: { entities: results, count: results.length },
      };
    }

    await callback({
      text: "No entity specified in query",
      source: message.content.source,
    });

    return {
      success: false,
      error: new Error("No entity specified"),
    };
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "What entities do you know about?" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I can query my worldview for specific entity types.",
        },
      },
    ],
  ],
};

const getSuggestionsAction: Action = {
  name: "GET_SUGGESTIONS",
  similes: ["SHOW_SUGGESTIONS", "VIEW_SUGGESTIONS"],
  description: "Get pending worldview suggestions",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
  ): Promise<ActionResult> => {
    const state = getState(runtime);
    if (!state) {
      return {
        success: false,
        error: new Error("Worldview not initialized"),
      };
    }

    const suggestions = state.suggestionQueue;

    await callback({
      text: `Pending suggestions: ${suggestions.length}\n${suggestions.map((s, i) => `${i + 1}. ${s.preview} (confidence: ${s.confidence.toFixed(2)})`).join("\n")}`,
      source: message.content.source,
    });

    return {
      success: true,
      text: `Retrieved ${suggestions.length} suggestions`,
      data: { suggestions, count: suggestions.length },
    };
  },

  examples: [],
};

const plugin: Plugin = {
  name: "worldview",
  description: "Provides agents with an evolving ontological worldview",

  actions: [getWorldviewAction, queryWorldviewAction, getSuggestionsAction],

  async init(config: Record<string, any> = {}) {
    elizaLogger.info("[Worldview] Plugin init() called");
    // ElizaOS calls init() before runtime is available
    // We'll do actual initialization in the service
  },

  services: [
    class WorldviewService extends Service {
      static serviceType = "worldview";
      capabilityDescription =
        "Provides agents with an evolving ontological worldview";

      constructor(runtime: IAgentRuntime) {
        super(runtime);
      }

      static async start(runtime: IAgentRuntime) {
        elizaLogger.info("[Worldview] Service starting...");

        const config: Required<WorldviewConfig> = {
          evolutionIntervalMs: 60000, // 1 minute (from new plugin)
          autoApplyThreshold: 0.9, // Higher threshold (from new plugin)
          minObservations: 3, // Lower threshold (from new plugin)
          memoryLookback: 50, // (from new plugin)
        };

        try {
          // Load or create worldview graph
          const worldviewPath = join(
            process.env.WORLDVIEW_DIR || "runtime/worldviews",
            `${runtime.agentId}.mermaid`,
          );

          const graph = await WorldviewGraph.load(worldviewPath);
          const observer = new PatternObserver(graph);
          observer.setThresholds(config.minObservations, 0.9, 0.7);

          const stats = graph.getStats();
          elizaLogger.info(
            `[Worldview] Loaded worldview - entities: ${stats.entities}, relationships: ${stats.relationships}, avgConnections: ${stats.avgConnections.toFixed(2)}`,
          );

          // Start evolution loop
          const evolutionInterval = setInterval(async () => {
            await evolve(runtime);
          }, config.evolutionIntervalMs);

          elizaLogger.info(
            `[Worldview] Started evolution loop - intervalMs: ${config.evolutionIntervalMs}`,
          );

          // Store state
          pluginState.set(runtime.agentId, {
            graph,
            observer,
            suggestionQueue: [],
            evolutionInterval,
            config,
          });

          elizaLogger.info("[Worldview] Service started successfully");

          const service = new WorldviewService(runtime);
          return service;
        } catch (error) {
          elizaLogger.error("[Worldview] Service start failed", error);
          throw error;
        }
      }

      async stop(): Promise<void> {
        elizaLogger.info("[Worldview] Service stopping (instance)...");

        const state = pluginState.get(this.runtime.agentId);
        if (state) {
          if (state.evolutionInterval) {
            clearInterval(state.evolutionInterval);
          }

          await state.graph.save();
          pluginState.delete(this.runtime.agentId);
        }

        elizaLogger.info("[Worldview] Service stopped");
      }

      static async stop(runtime: IAgentRuntime): Promise<void> {
        elizaLogger.info("[Worldview] Service stopping (static)...");

        const state = pluginState.get(runtime.agentId);
        if (state) {
          if (state.evolutionInterval) {
            clearInterval(state.evolutionInterval);
          }

          await state.graph.save();
          pluginState.delete(runtime.agentId);
        }

        elizaLogger.info("[Worldview] Service stopped");
      }
    },
  ],
};

// Export factory function
export function createWorldviewPlugin(config?: WorldviewConfig): Plugin {
  const configStr = config ? JSON.stringify(config) : "default";
  elizaLogger.info(
    `[Worldview] createWorldviewPlugin() called with config: ${configStr}`,
  );

  // Apply custom config if provided
  if (config && plugin.services && plugin.services.length > 0) {
    const WorldviewService = plugin.services[0] as any;
    const originalStart = WorldviewService.start;

    WorldviewService.start = async function (runtime: IAgentRuntime) {
      const mergedConfig: Required<WorldviewConfig> = {
        evolutionIntervalMs: config.evolutionIntervalMs || 60000,
        autoApplyThreshold: config.autoApplyThreshold || 0.9,
        minObservations: config.minObservations || 3,
        memoryLookback: config.memoryLookback || 50,
      };

      // Store merged config for use in start
      (runtime as any).__worldviewConfig = mergedConfig;
      return originalStart.call(this, runtime);
    };
  }

  return plugin;
}

// Export all types
export * from "./types";
export * from "./graph";
export * from "./observer";
