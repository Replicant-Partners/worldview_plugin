import {
  Plugin,
  IAgentRuntime,
  Memory,
  State,
  elizaLogger,
} from "@ai16z/eliza";
import { join } from "path";
import { WorldviewGraph, WorldviewGraphConfig } from "./graph";
import { PatternObserver } from "./observer";
import { Suggestion } from "./types";
import { LanceDBVectorStore } from "./storage/lance-store";
import {
  EntityEnrichmentService,
  EnrichmentConfig,
} from "./enrichment/enrichment-service";
import { RetrievalAgent } from "./agents/retrieval-agent";
import { MatchingAgent, MatchingConfig } from "./agents/matching-agent";

export interface WorldviewConfig {
  evolutionIntervalMs?: number; // How often to check for patterns (default: 60000)
  autoApplyThreshold?: number; // Auto-apply suggestions above this confidence (default: 0.9)
  minObservations?: number; // Minimum co-occurrences for pattern (default: 3)
  memoryLookback?: number; // How many recent memories to analyze (default: 50)
  enableInference?: boolean; // Enable Phase 2 inference rules (default: false)
  enableEnrichment?: boolean; // Enable Phase 1 Agent-OM enrichment (default: false)
  enableAgents?: boolean; // Enable Phase 2 Siamese agents (default: false, uses PatternObserver)
  enableValidation?: boolean; // Enable Phase 3 LLM validation (default: false)
  enrichment?: EnrichmentConfig; // Enrichment configuration
  matching?: MatchingConfig; // Matching agent configuration
  vectorStorePath?: string; // Path for vector database (default: runtime/vector_stores)
  embeddingModel?: string; // OpenAI embedding model (default: text-embedding-3-large)
  validationModel?: string; // Validation LLM model (e.g., gpt-4o, claude-opus-4-5)
}

export class WorldviewPlugin implements Plugin {
  name = "worldview";
  description = "Provides agents with an evolving ontological worldview";

  private graph: WorldviewGraph | null = null;
  private observer: PatternObserver | null = null;
  private retrievalAgent: RetrievalAgent | null = null;
  private matchingAgent: MatchingAgent | null = null;
  private suggestionQueue: Suggestion[] = [];
  private config: WorldviewConfig & {
    evolutionIntervalMs: number;
    autoApplyThreshold: number;
    minObservations: number;
    memoryLookback: number;
    enableInference: boolean;
    enableEnrichment: boolean;
    enableAgents: boolean;
    enableValidation: boolean;
  };
  private evolutionInterval: NodeJS.Timeout | null = null;

  constructor(config: WorldviewConfig = {}) {
    this.config = {
      evolutionIntervalMs: config.evolutionIntervalMs || 60000,
      autoApplyThreshold: config.autoApplyThreshold || 0.9,
      minObservations: config.minObservations || 3,
      memoryLookback: config.memoryLookback || 50,
      enableInference: config.enableInference || false,
      enableEnrichment: config.enableEnrichment || false,
      enableAgents: config.enableAgents || false,
      enableValidation: config.enableValidation || false,
      enrichment: config.enrichment
        ? {
            ...config.enrichment,
            embeddingModel:
              config.embeddingModel ||
              config.enrichment?.embeddingModel ||
              "text-embedding-3-large",
          }
        : undefined,
      matching: config.matching
        ? {
            ...config.matching,
            validationModel:
              config.validationModel || config.matching?.validationModel,
          }
        : undefined,
      vectorStorePath: config.vectorStorePath,
      embeddingModel: config.embeddingModel,
      validationModel: config.validationModel,
    };
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    elizaLogger.info("[Worldview] Initializing worldview plugin");

    // Load or create worldview graph
    const worldviewPath = join(
      runtime.getSetting("WORLDVIEW_DIR") || "runtime/worldviews",
      `${runtime.agentId}.mermaid`,
    );

    // Initialize vector store if enrichment is enabled
    let vectorStore = null;
    let enrichmentService = null;

    if (this.config.enableEnrichment) {
      const vectorStorePath = join(
        this.config.vectorStorePath || "runtime/vector_stores",
        runtime.agentId,
      );

      elizaLogger.info("[Worldview] Initializing vector store", {
        path: vectorStorePath,
      });

      vectorStore = new LanceDBVectorStore(vectorStorePath);
      await vectorStore.initialize();

      elizaLogger.info("[Worldview] Initializing enrichment service");
      enrichmentService = new EntityEnrichmentService(
        runtime,
        null as any, // Graph will be set after load
        this.config.enrichment,
      );
    }

    // Prepare graph configuration
    const graphConfig: WorldviewGraphConfig = {
      enableInference: this.config.enableInference,
      enableEnrichment: this.config.enableEnrichment,
      vectorStore: vectorStore || undefined,
      enrichmentService: enrichmentService || undefined,
      runtime,
    };

    this.graph = await WorldviewGraph.load(worldviewPath, graphConfig);

    // Set graph reference in enrichment service
    if (enrichmentService) {
      enrichmentService.setGraph(this.graph);
    }

    // Initialize agents based on configuration
    if (this.config.enableAgents && vectorStore && enrichmentService) {
      // Siamese Agent Architecture (Phase 2)
      elizaLogger.info("[Worldview] Initializing Siamese agents");

      this.retrievalAgent = new RetrievalAgent(
        this.graph,
        enrichmentService,
        vectorStore,
      );

      this.matchingAgent = new MatchingAgent(
        this.graph,
        vectorStore,
        this.config.matching,
        runtime, // Pass runtime for validation (Phase 3)
      );

      elizaLogger.info("[Worldview] Siamese agents initialized");
    } else {
      // Fallback to PatternObserver (Phase 1 behavior)
      this.observer = new PatternObserver(this.graph);
      elizaLogger.info("[Worldview] Using PatternObserver (legacy mode)");
    }

    const stats = this.graph.getStats();
    elizaLogger.info("[Worldview] Loaded worldview", {
      entities: stats.entities,
      relationships: stats.relationships,
      avgConnections: stats.avgConnections.toFixed(2),
      inferenceEnabled: this.config.enableInference,
      enrichmentEnabled: this.config.enableEnrichment,
      agentsEnabled: this.config.enableAgents,
    });

    // Start continuous evolution loop
    this.startEvolutionLoop(runtime);

    // Register actions for querying worldview
    this.registerActions(runtime);
  }

  private startEvolutionLoop(runtime: IAgentRuntime): void {
    elizaLogger.info("[Worldview] Starting evolution loop", {
      intervalMs: this.config.evolutionIntervalMs,
    });

    this.evolutionInterval = setInterval(async () => {
      try {
        await this.evolve(runtime);
      } catch (error) {
        elizaLogger.error("[Worldview] Evolution error", error);
      }
    }, this.config.evolutionIntervalMs);
  }

  private async evolve(runtime: IAgentRuntime): Promise<void> {
    if (!this.graph) return;

    // Get recent memories
    const memories = await runtime.messageManager.getMemories({
      roomId: runtime.agentId,
      count: this.config.memoryLookback,
    });

    if (memories.length === 0) return;

    let suggestions: Suggestion[] = [];
    let applied = 0;
    let queued = 0;

    // Use Siamese agents if enabled, otherwise use PatternObserver
    if (this.config.enableAgents && this.retrievalAgent && this.matchingAgent) {
      // Phase 2: Siamese Agent Architecture
      elizaLogger.debug("[Worldview] Using Siamese agents for evolution");

      // Step 1: Retrieval Agent - Extract and enrich entities
      const retrievalResult =
        await this.retrievalAgent.processMemories(memories);
      elizaLogger.debug("[Worldview] Retrieval complete", retrievalResult);

      // Step 2: Matching Agent - Detect relationships
      const allEntities = this.graph.getAllEntities();
      suggestions = await this.matchingAgent.detectRelationships(allEntities);

      elizaLogger.debug("[Worldview] Matching complete", {
        suggestions: suggestions.length,
      });
    } else if (this.observer) {
      // Phase 1: PatternObserver (legacy)
      elizaLogger.debug("[Worldview] Using PatternObserver for evolution");
      suggestions = this.observer.analyze(memories);
    } else {
      elizaLogger.warn("[Worldview] No evolution method available");
      return;
    }

    if (suggestions.length === 0) return;

    elizaLogger.debug("[Worldview] Generated suggestions", {
      count: suggestions.length,
      highConfidence: suggestions.filter(
        (s) => s.confidence >= this.config.autoApplyThreshold,
      ).length,
    });

    // Auto-apply high confidence suggestions
    for (const suggestion of suggestions) {
      if (suggestion.confidence >= this.config.autoApplyThreshold) {
        this.graph.apply(suggestion);
        applied++;
        elizaLogger.debug("[Worldview] Auto-applied suggestion", {
          type: suggestion.type,
          confidence: suggestion.confidence.toFixed(2),
          preview: suggestion.preview,
        });
      } else if (suggestion.confidence >= 0.7) {
        this.suggestionQueue.push(suggestion);
        queued++;
      }
    }

    // Execute inference rules if enabled (Phase 2)
    let inferred = 0;
    if (this.config.enableInference && applied > 0) {
      try {
        const inferenceResults = this.graph.executeInference();
        inferred = inferenceResults.reduce(
          (sum, r) => sum + r.inferred.length,
          0,
        );

        if (inferred > 0) {
          elizaLogger.debug("[Worldview] Inference complete", {
            inferred,
            rules: inferenceResults.length,
          });
        }
      } catch (error) {
        elizaLogger.error("[Worldview] Inference error", error);
      }
    }

    // Persist changes if any were applied or inferred
    if (applied > 0 || inferred > 0) {
      await this.graph.save();
      const stats = this.graph.getStats();
      elizaLogger.info("[Worldview] Evolution complete", {
        applied,
        inferred,
        queued,
        entities: stats.entities,
        relationships: stats.relationships,
      });
    }
  }

  private registerActions(runtime: IAgentRuntime): void {
    // Register custom actions for worldview queries
    // These can be expanded based on needs

    // Action to get worldview visualization
    runtime.registerAction({
      name: "GET_WORLDVIEW",
      similes: ["SHOW_WORLDVIEW", "VIEW_ONTOLOGY", "GET_GRAPH"],
      description: "Get the current worldview as a Mermaid diagram",
      validate: async () => true,
      handler: async (runtime: IAgentRuntime) => {
        if (!this.graph)
          return { success: false, error: "Worldview not initialized" };
        return {
          success: true,
          diagram: this.graph.toMermaid(),
          stats: this.graph.getStats(),
        };
      },
      examples: [],
    });

    // Action to query worldview
    runtime.registerAction({
      name: "QUERY_WORLDVIEW",
      similes: ["SEARCH_ENTITIES", "FIND_CONCEPTS", "QUERY_ONTOLOGY"],
      description: "Query entities in the worldview",
      validate: async () => true,
      handler: async (runtime: IAgentRuntime, message?: Memory) => {
        if (!this.graph)
          return { success: false, error: "Worldview not initialized" };

        // Extract entity type from message
        const text = message?.content?.text || "";
        const entityMatch = text.match(/entity[:\s]+(\w+)/i);
        const entity = entityMatch ? entityMatch[1] : undefined;

        if (entity) {
          const results = this.graph.query({ type: entity.toUpperCase() });
          return {
            success: true,
            entities: results,
            count: results.length,
          };
        }

        return { success: false, error: "No entity specified" };
      },
      examples: [
        [
          {
            user: "user",
            content: { text: "What entities do you know about?" },
          },
        ],
      ],
    });

    // Action to get pending suggestions
    runtime.registerAction({
      name: "GET_SUGGESTIONS",
      similes: ["LIST_SUGGESTIONS", "SHOW_PENDING", "GET_QUEUE"],
      description: "Get pending worldview suggestions",
      validate: async () => true,
      handler: async (runtime: IAgentRuntime) => {
        return {
          success: true,
          suggestions: this.suggestionQueue,
          count: this.suggestionQueue.length,
        };
      },
      examples: [],
    });
  }

  async cleanup(): Promise<void> {
    if (this.evolutionInterval) {
      clearInterval(this.evolutionInterval);
      this.evolutionInterval = null;
    }

    if (this.graph) {
      await this.graph.save();
    }

    elizaLogger.info("[Worldview] Plugin cleaned up");
  }

  /**
   * Get the current worldview graph
   */
  getGraph(): WorldviewGraph | null {
    return this.graph;
  }

  /**
   * Get pending suggestions
   */
  getSuggestions(): Suggestion[] {
    return [...this.suggestionQueue];
  }

  /**
   * Clear suggestion queue
   */
  clearSuggestions(): void {
    this.suggestionQueue = [];
  }

  /**
   * Manually apply a suggestion
   */
  applySuggestion(suggestion: Suggestion): void {
    if (this.graph) {
      this.graph.apply(suggestion);
    }
  }
}

// Export factory function for easy plugin creation
export function createWorldviewPlugin(
  config?: WorldviewConfig,
): WorldviewPlugin {
  return new WorldviewPlugin(config);
}

// Export all types
export * from "./types";
export * from "./graph";
export * from "./observer";
