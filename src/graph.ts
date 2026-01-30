import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import {
  Entity,
  Relationship,
  Cardinality,
  Suggestion,
  WorldviewState,
  CARDINALITY_SEMANTICS,
  InferenceRule,
  EnrichedEntity,
  VectorRecord,
} from "./types";
import { InferenceEngine } from "./inference-engine";
import { getDefaultRules } from "./inference/rules";
import { VectorStore } from "./storage/vector-store";
import { EntityEnrichmentService } from "./enrichment/enrichment-service";
import { elizaLogger, IAgentRuntime } from "@ai16z/eliza";

export interface WorldviewGraphConfig {
  enableInference?: boolean;
  enableEnrichment?: boolean;
  vectorStore?: VectorStore;
  enrichmentService?: EntityEnrichmentService;
  runtime?: IAgentRuntime;
}

export class WorldviewGraph {
  private entities: Map<string, Entity>;
  private relationships: Map<string, Relationship>;
  private version: number;
  private filePath: string;
  private inferenceEngine: InferenceEngine | null = null;
  private inferenceEnabled: boolean = false;
  private enrichmentEnabled: boolean = false;
  private vectorStore: VectorStore | null = null;
  private enrichmentService: EntityEnrichmentService | null = null;
  private runtime: IAgentRuntime | null = null;

  constructor(filePath: string, config: WorldviewGraphConfig = {}) {
    this.entities = new Map();
    this.relationships = new Map();
    this.version = 0;
    this.filePath = filePath;
    this.inferenceEnabled = config.enableInference || false;
    this.enrichmentEnabled = config.enableEnrichment || false;
    this.vectorStore = config.vectorStore || null;
    this.enrichmentService = config.enrichmentService || null;
    this.runtime = config.runtime || null;

    if (this.inferenceEnabled) {
      this.inferenceEngine = new InferenceEngine(this);
      // Register default rules
      const defaultRules = getDefaultRules();
      defaultRules.forEach((rule) => this.inferenceEngine!.registerRule(rule));
    }
  }

  /**
   * Load worldview from Mermaid ER diagram file
   */
  static async load(
    filePath: string,
    config: WorldviewGraphConfig = {},
  ): Promise<WorldviewGraph> {
    const graph = new WorldviewGraph(filePath, config);

    if (!existsSync(filePath)) {
      // Initialize empty graph
      await graph.save();
      return graph;
    }

    const content = readFileSync(filePath, "utf-8");
    graph.fromMermaid(content);

    // If enrichment enabled and vector store available, sync on load
    if (graph.enrichmentEnabled && graph.vectorStore) {
      elizaLogger.info("[WorldviewGraph] Syncing vector store on load");
      await graph.syncVectorStore();
    }

    return graph;
  }

  /**
   * Parse Mermaid ER diagram into graph structure
   */
  private fromMermaid(diagram: string): void {
    const lines = diagram.split("\n").map((l) => l.trim());

    for (const line of lines) {
      if (line.startsWith("erDiagram") || line === "") continue;

      // Parse entity definitions: ENTITY { ... }
      if (line.includes("{") && !line.includes("||") && !line.includes("}o")) {
        const entityMatch = line.match(/(\w+)\s*{/);
        if (entityMatch) {
          const entityId = entityMatch[1];
          this.addEntity({
            id: entityId,
            type: entityId,
            attributes: {},
            firstSeen: new Date(),
            lastSeen: new Date(),
            observationCount: 1,
          });
        }
      }

      // Parse relationships: ENTITY1 ||--o{ ENTITY2 : relationship_type
      const relMatch = line.match(
        /(\w+)\s+([\|\}][\|\o]--[\|\o][\{\|])\s+(\w+)\s*:\s*(\w+)/,
      );
      if (relMatch) {
        const [, source, cardinality, target, relType] = relMatch;

        // Ensure entities exist
        if (!this.entities.has(source)) {
          this.addEntity({
            id: source,
            type: source,
            attributes: {},
            firstSeen: new Date(),
            lastSeen: new Date(),
            observationCount: 1,
          });
        }
        if (!this.entities.has(target)) {
          this.addEntity({
            id: target,
            type: target,
            attributes: {},
            firstSeen: new Date(),
            lastSeen: new Date(),
            observationCount: 1,
          });
        }

        this.addRelationship({
          id: `${source}_${relType}_${target}`,
          type: relType,
          source,
          target,
          cardinality: cardinality as Cardinality,
          confidence: 1.0,
          observations: 1,
          metadata: {},
        });
      }
    }
  }

  /**
   * Serialize graph to Mermaid ER diagram format
   */
  toMermaid(): string {
    let diagram = "erDiagram\n";

    // Output relationships first
    for (const rel of this.relationships.values()) {
      diagram += `    ${rel.source} ${rel.cardinality} ${rel.target} : ${rel.type}\n`;
    }

    diagram += "\n";

    // Output entity definitions with attributes
    for (const entity of this.entities.values()) {
      const hasAttributes = Object.keys(entity.attributes).length > 0;
      if (hasAttributes) {
        diagram += `    ${entity.id} {\n`;
        for (const [key, value] of Object.entries(entity.attributes)) {
          diagram += `        string ${key}\n`;
        }
        diagram += `    }\n`;
      }
    }

    return diagram;
  }

  /**
   * Save worldview to Mermaid file
   */
  async save(): Promise<void> {
    const dir = join(this.filePath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = this.toMermaid();
    writeFileSync(this.filePath, content, "utf-8");
    this.version++;
  }

  /**
   * Add or update an entity
   */
  addEntity(entity: Entity): void {
    const existing = this.entities.get(entity.id);
    if (existing) {
      existing.lastSeen = new Date();
      existing.observationCount++;
      Object.assign(existing.attributes, entity.attributes);
    } else {
      this.entities.set(entity.id, entity);
    }
  }

  /**
   * Add or update a relationship
   */
  addRelationship(rel: Relationship): void {
    const existing = this.relationships.get(rel.id);
    if (existing) {
      existing.observations++;
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
    } else {
      this.relationships.set(rel.id, rel);
    }
  }

  /**
   * Check if relationship exists
   */
  hasRelationship(source: string, target: string, type?: string): boolean {
    for (const rel of this.relationships.values()) {
      if (rel.source === source && rel.target === target) {
        if (!type || rel.type === type) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get entity by id
   */
  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /**
   * Get all relationships for an entity
   */
  getRelationships(entityId: string): Relationship[] {
    return Array.from(this.relationships.values()).filter(
      (rel) => rel.source === entityId || rel.target === entityId,
    );
  }

  /**
   * Get all relationships in the graph
   */
  getAllRelationships(): Relationship[] {
    return Array.from(this.relationships.values());
  }

  /**
   * Query entities by pattern
   */
  query(pattern: { type?: string; attribute?: string; value?: any }): Entity[] {
    return Array.from(this.entities.values()).filter((entity) => {
      if (pattern.type && entity.type !== pattern.type) return false;
      if (
        pattern.attribute &&
        entity.attributes[pattern.attribute] !== pattern.value
      )
        return false;
      return true;
    });
  }

  /**
   * Apply a suggestion to the graph
   */
  apply(suggestion: Suggestion): void {
    switch (suggestion.type) {
      case "new_entity":
        if (suggestion.data.entity) {
          this.addEntity(suggestion.data.entity as Entity);
        }
        break;

      case "new_relationship":
        if (
          suggestion.data.source &&
          suggestion.data.target &&
          suggestion.data.relationship
        ) {
          this.addRelationship({
            id: `${suggestion.data.source}_${suggestion.data.relationship}_${suggestion.data.target}`,
            type: suggestion.data.relationship,
            source: suggestion.data.source,
            target: suggestion.data.target,
            cardinality: suggestion.data.cardinality || Cardinality.ManyToMany,
            confidence: suggestion.confidence,
            observations: 1,
            metadata: { auto_generated: true },
          });
        }
        break;

      case "modify_cardinality":
        if (
          suggestion.data.source &&
          suggestion.data.target &&
          suggestion.data.cardinality
        ) {
          const relId = `${suggestion.data.source}_${suggestion.data.relationship}_${suggestion.data.target}`;
          const rel = this.relationships.get(relId);
          if (rel) {
            rel.cardinality = suggestion.data.cardinality;
          }
        }
        break;
    }
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    entities: number;
    relationships: number;
    avgConnections: number;
  } {
    const entityCount = this.entities.size;
    const relCount = this.relationships.size;
    const avgConnections = entityCount > 0 ? relCount / entityCount : 0;

    return {
      entities: entityCount,
      relationships: relCount,
      avgConnections,
    };
  }

  /**
   * Get the current state for serialization
   */
  getState(): WorldviewState {
    return {
      entities: new Map(this.entities),
      relationships: new Map(this.relationships),
      version: this.version,
      lastModified: new Date(),
    };
  }

  /**
   * Execute inference rules to derive implicit relationships
   * Phase 2: Returns inferred relationships
   */
  executeInference() {
    if (!this.inferenceEngine) {
      throw new Error(
        "Inference engine not initialized. Enable inference in constructor.",
      );
    }
    return this.inferenceEngine.executeAll();
  }

  /**
   * Get the inference engine (for advanced usage)
   */
  getInferenceEngine(): InferenceEngine | null {
    return this.inferenceEngine;
  }

  /**
   * Register a custom inference rule
   */
  registerInferenceRule(rule: InferenceRule): void {
    if (!this.inferenceEngine) {
      throw new Error(
        "Inference engine not initialized. Enable inference in constructor.",
      );
    }
    this.inferenceEngine.registerRule(rule);
  }

  /**
   * Enable or disable a specific inference rule
   */
  setInferenceRuleEnabled(ruleName: string, enabled: boolean): void {
    if (!this.inferenceEngine) {
      throw new Error(
        "Inference engine not initialized. Enable inference in constructor.",
      );
    }
    this.inferenceEngine.setRuleEnabled(ruleName, enabled);
  }

  /**
   * Get all registered inference rules
   */
  getInferenceRules(): InferenceRule[] {
    if (!this.inferenceEngine) {
      return [];
    }
    return this.inferenceEngine.getRules();
  }

  /**
   * Sync entities to vector store (Phase 1: Agent-OM integration)
   * Enriches all entities and stores their embeddings
   */
  async syncVectorStore(): Promise<void> {
    if (
      !this.enrichmentEnabled ||
      !this.vectorStore ||
      !this.enrichmentService
    ) {
      elizaLogger.warn(
        "[WorldviewGraph] Enrichment or vector store not initialized, skipping sync",
      );
      return;
    }

    const startTime = Date.now();
    const entities = Array.from(this.entities.values());

    if (entities.length === 0) {
      elizaLogger.debug("[WorldviewGraph] No entities to sync");
      return;
    }

    try {
      // Enrich all entities
      elizaLogger.info("[WorldviewGraph] Enriching entities", {
        count: entities.length,
      });
      const enriched = await this.enrichmentService.enrichBatch(entities);

      // Store enriched entities in vector database
      const records: VectorRecord[] = [];
      for (const enrichedEntity of enriched) {
        // Store syntactic embedding
        records.push({
          entity_id: enrichedEntity.id,
          category: "source", // Can be configured later for cross-agent matching
          entity_type: enrichedEntity.type,
          content_type: "syntactic",
          content: enrichedEntity.syntactic,
          embedding: enrichedEntity.embeddings.syntactic,
          metadata: {
            agentId: this.runtime?.agentId || "unknown",
            version: this.version,
            created: new Date(),
          },
        });

        // Store lexical embedding
        records.push({
          entity_id: enrichedEntity.id,
          category: "source",
          entity_type: enrichedEntity.type,
          content_type: "lexical",
          content: enrichedEntity.lexical,
          embedding: enrichedEntity.embeddings.lexical,
          metadata: {
            agentId: this.runtime?.agentId || "unknown",
            version: this.version,
            created: new Date(),
          },
        });

        // Store semantic embedding
        records.push({
          entity_id: enrichedEntity.id,
          category: "source",
          entity_type: enrichedEntity.type,
          content_type: "semantic",
          content: enrichedEntity.semantic,
          embedding: enrichedEntity.embeddings.semantic,
          metadata: {
            agentId: this.runtime?.agentId || "unknown",
            version: this.version,
            created: new Date(),
          },
        });

        // Update entity with enrichment data
        const entity = this.entities.get(enrichedEntity.id);
        if (entity) {
          entity.enrichment = {
            syntactic: enrichedEntity.syntactic,
            lexical: enrichedEntity.lexical,
            semantic: enrichedEntity.semantic,
            lastEnriched: new Date(),
          };
        }
      }

      // Batch insert to vector store
      await this.vectorStore.addBatch(records);

      const duration = Date.now() - startTime;
      elizaLogger.info("[WorldviewGraph] Vector store sync complete", {
        entities: entities.length,
        records: records.length,
        durationMs: duration,
      });
    } catch (error) {
      elizaLogger.error("[WorldviewGraph] Vector store sync failed", {
        error,
      });
      throw error;
    }
  }

  /**
   * Find similar entities using vector similarity search (Phase 1: Agent-OM integration)
   */
  async findSimilarEntities(
    entityId: string,
    contentType: "syntactic" | "lexical" | "semantic" = "lexical",
    topK: number = 5,
  ): Promise<Entity[]> {
    if (!this.vectorStore) {
      elizaLogger.warn(
        "[WorldviewGraph] Vector store not initialized, returning empty results",
      );
      return [];
    }

    try {
      const results = await this.vectorStore.searchSimilar(
        entityId,
        contentType,
        topK,
      );

      // Map vector search results back to entities
      const similarEntities: Entity[] = [];
      for (const result of results) {
        const entity = this.entities.get(result.entity_id);
        if (entity) {
          similarEntities.push(entity);
        }
      }

      elizaLogger.debug("[WorldviewGraph] Found similar entities", {
        entityId,
        contentType,
        found: similarEntities.length,
      });

      return similarEntities;
    } catch (error) {
      elizaLogger.error("[WorldviewGraph] Similarity search failed", {
        entityId,
        error,
      });
      return [];
    }
  }

  /**
   * Get all entities in the graph
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Set enrichment service (for late initialization)
   */
  setEnrichmentService(service: EntityEnrichmentService): void {
    this.enrichmentService = service;
  }

  /**
   * Set vector store (for late initialization)
   */
  setVectorStore(store: VectorStore): void {
    this.vectorStore = store;
  }

  /**
   * Set runtime (for late initialization)
   */
  setRuntime(runtime: IAgentRuntime): void {
    this.runtime = runtime;
  }
}
