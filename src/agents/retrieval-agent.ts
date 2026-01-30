import { Memory, elizaLogger } from "@elizaos/core";
import { WorldviewGraph } from "../graph";
import { EntityEnrichmentService } from "../enrichment/enrichment-service";
import { VectorStore } from "../storage/vector-store";
import { Entity, VectorRecord } from "../types";

/**
 * RetrievalAgent: Inspired by Agent-OM's Retrieval Agent
 *
 * Responsibilities:
 * 1. Extract entities from memories
 * 2. Enrich entities with syntactic/lexical/semantic information
 * 3. Store enrichments in graph + vector DB
 * 4. Track entity metadata (first/last seen, observation counts)
 *
 * Workflow:
 * Memories → Entity Extraction → Enrichment → Embedding Generation
 * → Hybrid Storage (Mermaid + Vector DB)
 */

export interface RetrievalResult {
  entitiesAdded: number;
  entitiesUpdated: number;
  enrichmentsGenerated: number;
  processingTimeMs: number;
}

export class RetrievalAgent {
  constructor(
    private graph: WorldviewGraph,
    private enrichmentService: EntityEnrichmentService,
    private vectorStore: VectorStore,
  ) {
    elizaLogger.info("[RetrievalAgent] Initialized");
  }

  /**
   * Process memories to extract and enrich entities
   */
  async processMemories(memories: Memory[]): Promise<RetrievalResult> {
    const startTime = Date.now();
    let entitiesAdded = 0;
    let entitiesUpdated = 0;
    let enrichmentsGenerated = 0;

    elizaLogger.info("[RetrievalAgent] Processing memories", {
      count: memories.length,
    });

    // Step 1: Extract entities from memories
    const extractedEntities = this.extractEntities(memories);
    elizaLogger.debug("[RetrievalAgent] Extracted entities", {
      count: extractedEntities.length,
    });

    // Step 2: Add/update entities in graph
    for (const entity of extractedEntities) {
      const existing = this.graph.getEntity(entity.id);
      if (existing) {
        entitiesUpdated++;
      } else {
        entitiesAdded++;
      }
      this.graph.addEntity(entity);
    }

    // Step 3: Enrich entities
    if (extractedEntities.length > 0) {
      elizaLogger.info("[RetrievalAgent] Enriching entities", {
        count: extractedEntities.length,
      });

      const enriched = await this.enrichmentService.enrichBatch(
        extractedEntities,
      );
      enrichmentsGenerated = enriched.length;

      // Step 4: Store enriched entities in vector database
      const records: VectorRecord[] = [];
      for (const enrichedEntity of enriched) {
        // Store syntactic embedding
        records.push({
          entity_id: enrichedEntity.id,
          category: "source",
          entity_type: enrichedEntity.type,
          content_type: "syntactic",
          content: enrichedEntity.syntactic,
          embedding: enrichedEntity.embeddings.syntactic,
          metadata: {
            agentId: "unknown", // Will be set by graph
            version: 0,
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
            agentId: "unknown",
            version: 0,
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
            agentId: "unknown",
            version: 0,
            created: new Date(),
          },
        });

        // Update entity with enrichment data
        const entity = this.graph.getEntity(enrichedEntity.id);
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
      elizaLogger.debug("[RetrievalAgent] Stored vectors", {
        records: records.length,
      });
    }

    const processingTimeMs = Date.now() - startTime;

    elizaLogger.info("[RetrievalAgent] Processing complete", {
      entitiesAdded,
      entitiesUpdated,
      enrichmentsGenerated,
      processingTimeMs,
    });

    return {
      entitiesAdded,
      entitiesUpdated,
      enrichmentsGenerated,
      processingTimeMs,
    };
  }

  /**
   * Extract entities from memories
   * Current implementation uses simple pattern matching
   * TODO: Enhance with NER model (see plan Phase 7)
   */
  private extractEntities(memories: Memory[]): Entity[] {
    const entityMap = new Map<string, Entity>();

    for (const memory of memories) {
      const text = memory.content?.text || "";

      // Extract entities using multiple patterns
      const entities = [
        ...this.extractCapitalizedWords(text),
        ...this.extractQuotedPhrases(text),
        ...this.extractCommonPatterns(text),
      ];

      // Deduplicate and add to map
      for (const entityId of entities) {
        if (!entityMap.has(entityId)) {
          entityMap.set(entityId, {
            id: entityId,
            type: entityId,
            attributes: {
              extractedFrom: memory.id,
            },
            firstSeen: new Date(memory.createdAt || Date.now()),
            lastSeen: new Date(memory.createdAt || Date.now()),
            observationCount: 1,
          });
        } else {
          const entity = entityMap.get(entityId)!;
          entity.observationCount++;
          entity.lastSeen = new Date(memory.createdAt || Date.now());
        }
      }
    }

    return Array.from(entityMap.values());
  }

  /**
   * Extract capitalized words (potential proper nouns)
   */
  private extractCapitalizedWords(text: string): string[] {
    const words = text.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g) || [];
    // Filter out common words
    const stopWords = new Set(["The", "This", "That", "These", "Those", "I"]);
    return words
      .filter((w) => !stopWords.has(w))
      .map((w) => this.normalizeEntity(w));
  }

  /**
   * Extract quoted phrases
   */
  private extractQuotedPhrases(text: string): string[] {
    const phrases = text.match(/"([^"]+)"/g) || [];
    return phrases
      .map((p) => p.replace(/"/g, ""))
      .map((p) => this.normalizeEntity(p));
  }

  /**
   * Extract common entity patterns
   */
  private extractCommonPatterns(text: string): string[] {
    const entities: string[] = [];

    // Common domain patterns
    const patterns = [
      /\b(user|agent|message|conversation|action|goal|intent|task|project|team|organization)\b/gi,
      /\b(code|function|class|method|variable|parameter)\b/gi,
      /\b(database|table|column|query|index)\b/gi,
      /\b(service|api|endpoint|request|response)\b/gi,
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern) || [];
      entities.push(...matches.map((m) => this.normalizeEntity(m)));
    }

    return entities;
  }

  /**
   * Normalize entity names
   */
  private normalizeEntity(entity: string): string {
    return entity.toUpperCase().replace(/\s+/g, "_");
  }

  /**
   * Update the graph reference
   */
  setGraph(graph: WorldviewGraph): void {
    this.graph = graph;
  }

  /**
   * Update the enrichment service
   */
  setEnrichmentService(service: EntityEnrichmentService): void {
    this.enrichmentService = service;
  }

  /**
   * Update the vector store
   */
  setVectorStore(store: VectorStore): void {
    this.vectorStore = store;
  }
}
