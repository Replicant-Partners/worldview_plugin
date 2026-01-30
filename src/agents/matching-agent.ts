import { elizaLogger, IAgentRuntime } from "@ai16z/eliza";
import { WorldviewGraph } from "../graph";
import { VectorStore, SearchResult } from "../storage/vector-store";
import { Entity, Suggestion, Cardinality } from "../types";
import { MatchingScorer, MatchScore } from "../matching/scorer";
import { RRFFusion } from "../matching/rrf";
import { SuggestionValidator, ValidatorConfig } from "../validation/validator";

/**
 * MatchingAgent: Inspired by Agent-OM's Matching Agent
 *
 * Responsibilities:
 * 1. Find similar entities using multi-signal matching
 * 2. Detect potential relationships
 * 3. Generate high-confidence suggestions
 * 4. Use RRF fusion for combining signals
 *
 * Matching Pipeline:
 * Query Entity → Candidate Selection (Vector Search)
 * → Multi-Signal Scoring (Syntactic/Lexical/Semantic)
 * → RRF Fusion → Suggestions
 */

export interface MatchingConfig {
  topK?: number; // Number of candidates to retrieve (default: 10)
  syntacticWeight?: number; // Weight for syntactic matching (default: 0.3)
  lexicalWeight?: number; // Weight for lexical matching (default: 0.4)
  semanticWeight?: number; // Weight for semantic matching (default: 0.3)
  rrfK?: number; // RRF constant (default: 60)
  minConfidence?: number; // Minimum confidence for suggestions (default: 0.7)
  enableValidation?: boolean; // Enable LLM validation (default: false)
  validation?: ValidatorConfig; // Validator configuration
  validationModel?: string; // Validation LLM model (e.g., gpt-4o, claude-opus-4-5)
  context?: string; // Domain context for validation (default: "general knowledge")
}

export interface Match {
  entity: Entity;
  score: MatchScore;
  confidence: number;
  reasoning: string;
}

export class MatchingAgent {
  private scorer: MatchingScorer;
  private rrfFusion: RRFFusion;
  private validator: SuggestionValidator | null = null;
  private config: MatchingConfig & {
    topK: number;
    syntacticWeight: number;
    lexicalWeight: number;
    semanticWeight: number;
    rrfK: number;
    minConfidence: number;
    enableValidation: boolean;
    context: string;
  };

  constructor(
    private graph: WorldviewGraph,
    private vectorStore: VectorStore,
    config: MatchingConfig = {},
    runtime?: IAgentRuntime,
  ) {
    this.config = {
      topK: config.topK || 10,
      syntacticWeight: config.syntacticWeight || 0.3,
      lexicalWeight: config.lexicalWeight || 0.4,
      semanticWeight: config.semanticWeight || 0.3,
      rrfK: config.rrfK || 60,
      minConfidence: config.minConfidence || 0.7,
      enableValidation: config.enableValidation || false,
      validation: config.validation,
      context: config.context || "general knowledge",
    };

    this.scorer = new MatchingScorer();
    this.rrfFusion = new RRFFusion({
      k: this.config.rrfK,
      weights: {
        syntactic: this.config.syntacticWeight,
        lexical: this.config.lexicalWeight,
        semantic: this.config.semanticWeight,
      },
    });

    // Initialize validator if enabled and runtime available
    if (this.config.enableValidation && runtime) {
      this.validator = new SuggestionValidator(runtime, {
        ...this.config.validation,
        modelName: config.validationModel || this.config.validation?.modelName,
      });
      elizaLogger.info("[MatchingAgent] Validation enabled");
    }

    elizaLogger.info("[MatchingAgent] Initialized", {
      topK: this.config.topK,
      weights: {
        syntactic: this.config.syntacticWeight,
        lexical: this.config.lexicalWeight,
        semantic: this.config.semanticWeight,
      },
      validationEnabled: this.config.enableValidation,
    });
  }

  /**
   * Find matches for a given entity
   */
  async findMatches(entity: Entity): Promise<Match[]> {
    elizaLogger.debug("[MatchingAgent] Finding matches", {
      entityId: entity.id,
    });

    // Step 1: Retrieve candidates using vector similarity (lexical)
    const candidates = await this.retrieveCandidates(entity);

    if (candidates.length === 0) {
      return [];
    }

    // Step 2: Score candidates using multi-signal approach
    const matches = await this.scoreCandidates(entity, candidates);

    // Step 3: Filter by minimum confidence
    const filtered = matches.filter(
      (m) => m.confidence >= this.config.minConfidence,
    );

    elizaLogger.debug("[MatchingAgent] Found matches", {
      entityId: entity.id,
      candidates: candidates.length,
      matches: filtered.length,
    });

    return filtered;
  }

  /**
   * Detect potential relationships between entities
   */
  async detectRelationships(entities: Entity[]): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    elizaLogger.info("[MatchingAgent] Detecting relationships", {
      entityCount: entities.length,
    });

    // For each entity, find similar entities and suggest relationships
    for (const entity of entities) {
      const matches = await this.findMatches(entity);

      for (const match of matches) {
        // Skip if relationship already exists
        if (
          this.graph.hasRelationship(entity.id, match.entity.id) ||
          this.graph.hasRelationship(match.entity.id, entity.id)
        ) {
          continue;
        }

        // Infer relationship type and cardinality
        const relationType = this.inferRelationshipType(entity, match.entity);
        const cardinality = this.inferCardinality(entity, match.entity);

        const suggestion: Suggestion = {
          type: "new_relationship",
          confidence: match.confidence,
          reasoning: match.reasoning,
          data: {
            source: entity.id,
            target: match.entity.id,
            relationship: relationType,
            cardinality,
          },
          preview: `${entity.id} ${cardinality} ${match.entity.id} : ${relationType}`,
        };

        // Validate suggestion if validator is enabled
        if (this.validator) {
          const validationResult = await this.validator.validateSuggestion(
            suggestion,
            this.config.context,
          );

          if (!validationResult.valid) {
            elizaLogger.debug(
              "[MatchingAgent] Suggestion rejected by validator",
              {
                preview: suggestion.preview,
                reason: validationResult.explanation,
              },
            );
            continue; // Skip invalid suggestions
          }

          // Update confidence based on validation
          suggestion.confidence = validationResult.confidence;
          suggestion.reasoning += ` | Validated: ${validationResult.explanation}`;
        }

        suggestions.push(suggestion);
      }
    }

    elizaLogger.info("[MatchingAgent] Generated suggestions", {
      count: suggestions.length,
      validated: this.validator ? suggestions.length : 0,
    });

    return suggestions;
  }

  /**
   * Retrieve candidate entities using vector similarity
   */
  private async retrieveCandidates(entity: Entity): Promise<Entity[]> {
    try {
      // Search using lexical embeddings (meanings)
      const results = await this.vectorStore.searchSimilar(
        entity.id,
        "lexical",
        this.config.topK,
      );

      // Map results to entities
      const candidates: Entity[] = [];
      for (const result of results) {
        const candidate = this.graph.getEntity(result.entity_id);
        if (candidate && candidate.id !== entity.id) {
          candidates.push(candidate);
        }
      }

      return candidates;
    } catch (error) {
      elizaLogger.error("[MatchingAgent] Candidate retrieval failed", {
        entityId: entity.id,
        error,
      });
      return [];
    }
  }

  /**
   * Score candidates using multi-signal approach with RRF fusion
   */
  private async scoreCandidates(
    queryEntity: Entity,
    candidates: Entity[],
  ): Promise<Match[]> {
    const matches: Match[] = [];

    // Get embeddings for query entity
    const queryEmbeddings = await this.getEntityEmbeddings(queryEntity.id);

    if (!queryEmbeddings) {
      elizaLogger.warn("[MatchingAgent] No embeddings for query entity", {
        entityId: queryEntity.id,
      });
      return [];
    }

    // Score each candidate
    const scores: MatchScore[] = [];

    for (const candidate of candidates) {
      const candidateEmbeddings = await this.getEntityEmbeddings(candidate.id);

      if (!candidateEmbeddings) {
        continue;
      }

      // Calculate individual scores
      const syntacticScore = this.scorer.scoreSyntactic(queryEntity, candidate);
      const lexicalScore = this.scorer.scoreLexical(
        queryEntity,
        queryEmbeddings.lexical,
        candidate,
        candidateEmbeddings.lexical,
      );
      const semanticScore = this.scorer.scoreSemantic(
        queryEntity,
        queryEmbeddings.semantic,
        candidate,
        candidateEmbeddings.semantic,
      );

      scores.push({
        entityId: candidate.id,
        syntacticScore,
        lexicalScore,
        semanticScore,
      });
    }

    // Apply RRF fusion
    const fusedScores = this.rrfFusion.fuseByScores(scores);

    // Convert to matches
    for (const score of fusedScores) {
      const candidate = candidates.find((c) => c.id === score.entityId);
      if (!candidate) continue;

      const confidence = score.rrfScore || 0;
      const reasoning = this.generateReasoning(score);

      matches.push({
        entity: candidate,
        score,
        confidence,
        reasoning,
      });
    }

    return matches;
  }

  /**
   * Get entity embeddings from vector store
   */
  private async getEntityEmbeddings(entityId: string): Promise<{
    syntactic: number[];
    lexical: number[];
    semantic: number[];
  } | null> {
    try {
      const syntacticResults = await this.vectorStore.searchSimilar(
        entityId,
        "syntactic",
        1,
      );
      const lexicalResults = await this.vectorStore.searchSimilar(
        entityId,
        "lexical",
        1,
      );
      const semanticResults = await this.vectorStore.searchSimilar(
        entityId,
        "semantic",
        1,
      );

      if (
        syntacticResults.length === 0 ||
        lexicalResults.length === 0 ||
        semanticResults.length === 0
      ) {
        return null;
      }

      return {
        syntactic: syntacticResults[0].embedding,
        lexical: lexicalResults[0].embedding,
        semantic: semanticResults[0].embedding,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate human-readable reasoning for a match
   */
  private generateReasoning(score: MatchScore): string {
    const parts: string[] = [];

    if (score.syntacticScore > 0.7) {
      parts.push(`similar names (${(score.syntacticScore * 100).toFixed(0)}%)`);
    }
    if (score.lexicalScore > 0.7) {
      parts.push(
        `similar meanings (${(score.lexicalScore * 100).toFixed(0)}%)`,
      );
    }
    if (score.semanticScore > 0.7) {
      parts.push(
        `similar contexts (${(score.semanticScore * 100).toFixed(0)}%)`,
      );
    }

    if (parts.length === 0) {
      return `Low similarity across all signals`;
    }

    return `High ${parts.join(", ")}`;
  }

  /**
   * Infer relationship type between entities
   * Simple heuristic - can be enhanced with LLM
   */
  private inferRelationshipType(entity1: Entity, entity2: Entity): string {
    // Default to generic "relates_to"
    return "relates_to";
  }

  /**
   * Infer cardinality between entities
   * Based on observation counts and types
   */
  private inferCardinality(entity1: Entity, entity2: Entity): Cardinality {
    const ratio = entity1.observationCount / (entity2.observationCount || 1);

    if (ratio > 2) {
      return Cardinality.ManyToOne;
    } else if (ratio < 0.5) {
      return Cardinality.OneToMany;
    } else {
      return Cardinality.ManyToMany;
    }
  }

  /**
   * Update graph reference
   */
  setGraph(graph: WorldviewGraph): void {
    this.graph = graph;
  }

  /**
   * Update vector store
   */
  setVectorStore(store: VectorStore): void {
    this.vectorStore = store;
  }
}
