import { MatchScore } from "./scorer";

/**
 * Reciprocal Rank Fusion (RRF)
 * From Agent-OM paper: combines multiple ranking signals
 *
 * Formula: RRF(entity) = Σ(1 / (k + rank_in_signal))
 *
 * Where:
 * - k is a constant (paper uses k=0, we default to k=60 for stability)
 * - rank_in_signal is the rank in each signal (syntactic, lexical, semantic)
 */

export interface RRFConfig {
  k?: number; // RRF constant (default: 60, paper uses 0)
  weights?: {
    syntactic?: number;
    lexical?: number;
    semantic?: number;
  };
}

export class RRFFusion {
  private k: number;
  private weights: {
    syntactic: number;
    lexical: number;
    semantic: number;
  };

  constructor(config: RRFConfig = {}) {
    this.k = config.k ?? 60; // Default to 60 for numerical stability
    this.weights = {
      syntactic: config.weights?.syntactic ?? 0.3,
      lexical: config.weights?.lexical ?? 0.4,
      semantic: config.weights?.semantic ?? 0.3,
    };
  }

  /**
   * Fuse multiple ranking signals using RRF
   *
   * @param syntacticRanks - Entities ranked by syntactic similarity
   * @param lexicalRanks - Entities ranked by lexical similarity
   * @param semanticRanks - Entities ranked by semantic similarity
   * @returns Combined ranking with RRF scores
   */
  fuse(
    syntacticRanks: MatchScore[],
    lexicalRanks: MatchScore[],
    semanticRanks: MatchScore[],
  ): MatchScore[] {
    // Create a map to accumulate RRF scores
    const rrfScores = new Map<string, number>();
    const entityData = new Map<string, MatchScore>();

    // Process syntactic ranks
    syntacticRanks.forEach((match, rank) => {
      const rrfScore = this.weights.syntactic / (this.k + rank + 1);
      rrfScores.set(
        match.entityId,
        (rrfScores.get(match.entityId) || 0) + rrfScore,
      );
      if (!entityData.has(match.entityId)) {
        entityData.set(match.entityId, { ...match });
      }
    });

    // Process lexical ranks
    lexicalRanks.forEach((match, rank) => {
      const rrfScore = this.weights.lexical / (this.k + rank + 1);
      rrfScores.set(
        match.entityId,
        (rrfScores.get(match.entityId) || 0) + rrfScore,
      );
      if (!entityData.has(match.entityId)) {
        entityData.set(match.entityId, { ...match });
      } else {
        const existing = entityData.get(match.entityId)!;
        existing.lexicalScore = match.lexicalScore;
      }
    });

    // Process semantic ranks
    semanticRanks.forEach((match, rank) => {
      const rrfScore = this.weights.semantic / (this.k + rank + 1);
      rrfScores.set(
        match.entityId,
        (rrfScores.get(match.entityId) || 0) + rrfScore,
      );
      if (!entityData.has(match.entityId)) {
        entityData.set(match.entityId, { ...match });
      } else {
        const existing = entityData.get(match.entityId)!;
        existing.semanticScore = match.semanticScore;
      }
    });

    // Create final ranked list
    const results: MatchScore[] = [];
    for (const [entityId, rrfScore] of rrfScores.entries()) {
      const data = entityData.get(entityId)!;
      results.push({
        ...data,
        rrfScore,
      });
    }

    // Sort by RRF score (descending)
    results.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));

    // Add final ranks
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    return results;
  }

  /**
   * Simplified fusion when only scores (not ranks) are available
   * Uses weighted average instead of RRF
   */
  fuseByScores(matches: MatchScore[]): MatchScore[] {
    const results = matches.map((match) => {
      const weightedScore =
        this.weights.syntactic * match.syntacticScore +
        this.weights.lexical * match.lexicalScore +
        this.weights.semantic * match.semanticScore;

      return {
        ...match,
        rrfScore: weightedScore,
      };
    });

    // Sort by weighted score
    results.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));

    // Add ranks
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    return results;
  }

  /**
   * Update weights
   */
  setWeights(weights: {
    syntactic?: number;
    lexical?: number;
    semantic?: number;
  }): void {
    if (weights.syntactic !== undefined)
      this.weights.syntactic = weights.syntactic;
    if (weights.lexical !== undefined) this.weights.lexical = weights.lexical;
    if (weights.semantic !== undefined)
      this.weights.semantic = weights.semantic;

    // Normalize weights to sum to 1.0
    const total =
      this.weights.syntactic + this.weights.lexical + this.weights.semantic;
    if (total > 0) {
      this.weights.syntactic /= total;
      this.weights.lexical /= total;
      this.weights.semantic /= total;
    }
  }

  /**
   * Get current weights
   */
  getWeights() {
    return { ...this.weights };
  }
}
