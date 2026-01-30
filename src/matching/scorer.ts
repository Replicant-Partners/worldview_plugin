import { Entity } from "../types";
import { compareTwoStrings } from "string-similarity";

/**
 * Multi-signal matching scorers inspired by Agent-OM
 *
 * Three types of similarity:
 * 1. Syntactic - String/token similarity
 * 2. Lexical - Meaning similarity (via embeddings)
 * 3. Semantic - Context similarity (via relationships)
 */

export interface MatchScore {
  entityId: string;
  syntacticScore: number;
  lexicalScore: number;
  semanticScore: number;
  rrfScore?: number;
  rank?: number;
}

export class MatchingScorer {
  /**
   * Score syntactic similarity using string similarity
   * Uses Dice coefficient (like string-similarity library)
   */
  scoreSyntactic(entity1: Entity, entity2: Entity): number {
    // Use enriched syntactic if available, otherwise use ID
    const text1 = entity1.enrichment?.syntactic || entity1.id.toLowerCase();
    const text2 = entity2.enrichment?.syntactic || entity2.id.toLowerCase();

    // String similarity (Dice coefficient)
    const stringSim = compareTwoStrings(text1, text2);

    // Token overlap (Jaccard)
    const tokens1 = new Set(text1.split(/\s+/));
    const tokens2 = new Set(text2.split(/\s+/));
    const intersection = new Set(
      [...tokens1].filter((t) => tokens2.has(t)),
    );
    const union = new Set([...tokens1, ...tokens2]);
    const jaccard = union.size > 0 ? intersection.size / union.size : 0;

    // Weighted average
    return 0.6 * stringSim + 0.4 * jaccard;
  }

  /**
   * Score lexical similarity using vector cosine similarity
   * Requires entities to have embeddings
   */
  scoreLexical(
    entity1: Entity,
    embedding1: number[],
    entity2: Entity,
    embedding2: number[],
  ): number {
    if (!embedding1 || !embedding2) {
      return 0;
    }

    if (embedding1.length !== embedding2.length) {
      return 0;
    }

    return this.cosineSimilarity(embedding1, embedding2);
  }

  /**
   * Score semantic similarity using relationship context
   * Measures how similar their relationship patterns are
   */
  scoreSemantic(
    entity1: Entity,
    embedding1: number[],
    entity2: Entity,
    embedding2: number[],
  ): number {
    if (!embedding1 || !embedding2) {
      return 0;
    }

    if (embedding1.length !== embedding2.length) {
      return 0;
    }

    return this.cosineSimilarity(embedding1, embedding2);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Compute edit distance (Levenshtein) for additional syntactic scoring
   */
  private editDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Normalize edit distance to 0-1 score
   */
  normalizedEditDistance(s1: string, s2: string): number {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.editDistance(s1, s2);
    return 1.0 - distance / maxLen;
  }
}
