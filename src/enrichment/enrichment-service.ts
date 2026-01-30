import { Entity, EnrichedEntity } from "../types";
import { WorldviewGraph } from "../graph";
import { SyntacticEnricher } from "./syntactic-enricher";
import { LexicalEnricher } from "./lexical-enricher";
import { SemanticEnricher } from "./semantic-enricher";
import { EmbeddingService } from "../storage/embedding-service";
import { LRUCache } from "../utils/cache";
import { IAgentRuntime, elizaLogger } from "@ai16z/eliza";

/**
 * EntityEnrichmentService: Orchestrates multi-faceted entity enrichment
 * Inspired by Agent-OM's Retrieval Agent
 *
 * Workflow:
 * 1. Syntactic enrichment: Normalize entity names
 * 2. Lexical enrichment: Generate LLM-powered meanings
 * 3. Semantic enrichment: Extract relationship context
 * 4. Embedding generation: Create vector representations
 * 5. Caching: Store results for reuse
 */

export interface EnrichmentConfig {
  enabled: boolean;
  batchSize: number;
  cacheSize: number;
  context?: string;
  embeddingModel?: string; // OpenAI embedding model (default: text-embedding-3-large)
}

export class EntityEnrichmentService {
  private syntacticEnricher: SyntacticEnricher;
  private lexicalEnricher: LexicalEnricher;
  private semanticEnricher: SemanticEnricher;
  private embeddingService: EmbeddingService;
  private cache: LRUCache<string, EnrichedEntity>;
  private config: Required<EnrichmentConfig>;

  constructor(
    private runtime: IAgentRuntime,
    private graph: WorldviewGraph,
    config: Partial<EnrichmentConfig> = {},
  ) {
    this.config = {
      enabled: config.enabled ?? true,
      batchSize: config.batchSize ?? 10,
      cacheSize: config.cacheSize ?? 1000,
      context: config.context ?? "general knowledge",
      embeddingModel: config.embeddingModel ?? "text-embedding-3-large",
    };

    // Initialize enrichers
    this.syntacticEnricher = new SyntacticEnricher();
    this.lexicalEnricher = new LexicalEnricher(runtime, this.config.context);
    this.semanticEnricher = new SemanticEnricher(graph);
    this.embeddingService = new EmbeddingService(
      runtime,
      this.config.embeddingModel,
    );
    this.cache = new LRUCache<string, EnrichedEntity>(this.config.cacheSize);

    elizaLogger.info("[EnrichmentService] Initialized", {
      enabled: this.config.enabled,
      batchSize: this.config.batchSize,
      cacheSize: this.config.cacheSize,
      embeddingModel: this.config.embeddingModel,
      embeddingDimension: this.embeddingService.dimension,
    });
  }

  /**
   * Enrich a single entity with all three facets
   */
  async enrich(entity: Entity): Promise<EnrichedEntity> {
    // Check cache first
    if (this.cache.has(entity.id)) {
      const cached = this.cache.get(entity.id)!;
      elizaLogger.debug("[EnrichmentService] Cache hit", {
        entityId: entity.id,
      });
      return cached;
    }

    if (!this.config.enabled) {
      // Return minimal enrichment
      return this.createMinimalEnrichment(entity);
    }

    const startTime = Date.now();

    try {
      // Step 1: Syntactic enrichment
      const syntactic = this.syntacticEnricher.enrich(entity);

      // Step 2: Lexical enrichment (LLM-powered)
      const lexical = await this.lexicalEnricher.enrich(entity, syntactic);

      // Step 3: Semantic enrichment (relationship context)
      const semantic = this.semanticEnricher.enrich(entity);

      // Step 4: Generate embeddings
      const [syntacticEmb, lexicalEmb, semanticEmb] = await Promise.all([
        this.embeddingService.embed(syntactic),
        this.embeddingService.embed(lexical),
        this.embeddingService.embed(semantic),
      ]);

      const enriched: EnrichedEntity = {
        id: entity.id,
        type: entity.type,
        syntactic,
        lexical,
        semantic,
        embeddings: {
          syntactic: syntacticEmb,
          lexical: lexicalEmb,
          semantic: semanticEmb,
        },
      };

      // Cache the result
      this.cache.set(entity.id, enriched);

      const duration = Date.now() - startTime;
      elizaLogger.debug("[EnrichmentService] Entity enriched", {
        entityId: entity.id,
        durationMs: duration,
      });

      return enriched;
    } catch (error) {
      elizaLogger.error("[EnrichmentService] Enrichment failed", {
        entityId: entity.id,
        error,
      });

      // Return minimal enrichment on error
      return this.createMinimalEnrichment(entity);
    }
  }

  /**
   * Enrich multiple entities in batches
   */
  async enrichBatch(entities: Entity[]): Promise<EnrichedEntity[]> {
    const results: EnrichedEntity[] = [];
    const batchSize = this.config.batchSize;

    // Filter out cached entities
    const uncached = entities.filter((e) => !this.cache.has(e.id));
    const cached = entities.filter((e) => this.cache.has(e.id));

    elizaLogger.info("[EnrichmentService] Batch enrichment started", {
      total: entities.length,
      cached: cached.length,
      toEnrich: uncached.length,
    });

    // Add cached entities
    for (const entity of cached) {
      results.push(this.cache.get(entity.id)!);
    }

    // Process uncached in batches
    for (let i = 0; i < uncached.length; i += batchSize) {
      const batch = uncached.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((entity) => this.enrich(entity)),
      );
      results.push(...batchResults);

      elizaLogger.debug("[EnrichmentService] Batch processed", {
        batch: Math.floor(i / batchSize) + 1,
        processed: Math.min(i + batchSize, uncached.length),
        total: uncached.length,
      });
    }

    return results;
  }

  /**
   * Create minimal enrichment (fallback when enrichment disabled or fails)
   */
  private createMinimalEnrichment(entity: Entity): EnrichedEntity {
    const syntactic = this.syntacticEnricher.enrich(entity);
    const lexical = syntactic;
    const semantic = `${entity.type} entity`;

    // Create zero embeddings
    const dim = this.embeddingService.dimension;
    const zeroEmb = new Array(dim).fill(0);

    return {
      id: entity.id,
      type: entity.type,
      syntactic,
      lexical,
      semantic,
      embeddings: {
        syntactic: zeroEmb,
        lexical: zeroEmb,
        semantic: zeroEmb,
      },
    };
  }

  /**
   * Update context for lexical enrichment
   */
  setContext(context: string): void {
    this.config.context = context;
    this.lexicalEnricher.setContext(context);
    elizaLogger.info("[EnrichmentService] Context updated", { context });
  }

  /**
   * Update graph reference for semantic enrichment
   */
  setGraph(graph: WorldviewGraph): void {
    this.graph = graph;
    this.semanticEnricher.setGraph(graph);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    elizaLogger.info("[EnrichmentService] Cache cleared");
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.stats;
  }

  /**
   * Enable or disable enrichment
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    elizaLogger.info("[EnrichmentService] Enrichment enabled status changed", {
      enabled,
    });
  }
}
