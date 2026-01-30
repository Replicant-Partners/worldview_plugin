import {
  InferenceRule,
  InferredRelationship,
  InferenceResult,
  Relationship,
  RelationshipPattern,
  Cardinality,
} from "./types";
import { WorldviewGraph } from "./graph";
import { elizaLogger } from "@ai16z/eliza";

/**
 * InferenceEngine: Execute logical inference rules on the worldview graph
 * Phase 2 implementation for deriving implicit relationships
 *
 * Features:
 * - Pattern matching against existing relationships
 * - Transitive closure for hierarchical relationships
 * - Confidence-based inference
 * - Pluggable rule system
 */

export class InferenceEngine {
  private rules: Map<string, InferenceRule> = new Map();
  private graph: WorldviewGraph;

  constructor(graph: WorldviewGraph) {
    this.graph = graph;
    elizaLogger.info("[InferenceEngine] Initialized");
  }

  /**
   * Register an inference rule
   */
  registerRule(rule: InferenceRule): void {
    this.rules.set(rule.name, rule);
    elizaLogger.debug("[InferenceEngine] Registered rule", {
      name: rule.name,
      description: rule.description,
    });
  }

  /**
   * Unregister an inference rule
   */
  unregisterRule(ruleName: string): void {
    this.rules.delete(ruleName);
    elizaLogger.debug("[InferenceEngine] Unregistered rule", {
      name: ruleName,
    });
  }

  /**
   * Enable or disable a rule
   */
  setRuleEnabled(ruleName: string, enabled: boolean): void {
    const rule = this.rules.get(ruleName);
    if (rule) {
      rule.enabled = enabled;
      elizaLogger.debug("[InferenceEngine] Rule enabled status changed", {
        name: ruleName,
        enabled,
      });
    }
  }

  /**
   * Get all registered rules
   */
  getRules(): InferenceRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Execute all enabled inference rules
   */
  executeAll(): InferenceResult[] {
    const results: InferenceResult[] = [];

    for (const rule of this.rules.values()) {
      if (rule.enabled) {
        const result = this.executeRule(rule);
        results.push(result);
      }
    }

    const totalInferred = results.reduce((sum, r) => sum + r.inferred.length, 0);
    elizaLogger.info("[InferenceEngine] Executed all rules", {
      rulesExecuted: results.length,
      totalInferred,
    });

    return results;
  }

  /**
   * Execute a specific inference rule
   */
  executeRule(rule: InferenceRule): InferenceResult {
    const startTime = Date.now();
    const inferred: InferredRelationship[] = [];
    const skipped: Array<{
      relationship: Partial<InferredRelationship>;
      reason: string;
    }> = [];

    elizaLogger.debug("[InferenceEngine] Executing rule", {
      name: rule.name,
    });

    // Find all combinations of relationships matching the IF pattern
    const matches = this.findPatternMatches(rule.pattern.if);

    for (const match of matches) {
      // Create inferred relationship from the THEN pattern
      const inferredRel = this.createInferredRelationship(
        rule,
        match.relationships,
        match.bindings,
      );

      // Check if this relationship already exists
      if (
        this.graph.hasRelationship(
          inferredRel.source,
          inferredRel.target,
          inferredRel.type,
        )
      ) {
        skipped.push({
          relationship: inferredRel,
          reason: "Relationship already exists",
        });
        continue;
      }

      // Check if source and target are the same (avoid self-loops unless explicitly allowed)
      if (inferredRel.source === inferredRel.target) {
        skipped.push({
          relationship: inferredRel,
          reason: "Self-loop not allowed",
        });
        continue;
      }

      inferred.push(inferredRel);

      // Add to graph
      this.graph.addRelationship(inferredRel);
    }

    const executionTimeMs = Date.now() - startTime;

    elizaLogger.debug("[InferenceEngine] Rule executed", {
      name: rule.name,
      matches: matches.length,
      inferred: inferred.length,
      skipped: skipped.length,
      executionTimeMs,
    });

    return {
      rule: rule.name,
      inferred,
      skipped,
      executionTimeMs,
    };
  }

  /**
   * Find all matches for a pattern in the graph
   */
  private findPatternMatches(
    patterns: RelationshipPattern[],
  ): Array<{
    relationships: Relationship[];
    bindings: Map<string, string>;
  }> {
    if (patterns.length === 0) return [];

    const results: Array<{
      relationships: Relationship[];
      bindings: Map<string, string>;
    }> = [];

    // Get all relationships from the graph
    const allRelationships = this.graph.getAllRelationships();

    // Match first pattern
    const firstPattern = patterns[0];
    const firstMatches = allRelationships.filter((rel) =>
      this.matchesPattern(rel, firstPattern, new Map()),
    );

    // For each match of the first pattern, try to match remaining patterns
    for (const firstMatch of firstMatches) {
      const bindings = new Map<string, string>();
      bindings.set(firstPattern.source, firstMatch.source);
      bindings.set(firstPattern.target, firstMatch.target);

      if (patterns.length === 1) {
        results.push({
          relationships: [firstMatch],
          bindings,
        });
      } else {
        // Try to match remaining patterns with these bindings
        const remainingMatches = this.matchRemainingPatterns(
          patterns.slice(1),
          allRelationships,
          [firstMatch],
          bindings,
        );

        results.push(...remainingMatches);
      }
    }

    return results;
  }

  /**
   * Recursively match remaining patterns
   */
  private matchRemainingPatterns(
    patterns: RelationshipPattern[],
    allRelationships: Relationship[],
    matchedSoFar: Relationship[],
    bindings: Map<string, string>,
  ): Array<{
    relationships: Relationship[];
    bindings: Map<string, string>;
  }> {
    if (patterns.length === 0) {
      return [{ relationships: matchedSoFar, bindings }];
    }

    const results: Array<{
      relationships: Relationship[];
      bindings: Map<string, string>;
    }> = [];

    const currentPattern = patterns[0];

    // Find relationships matching current pattern with existing bindings
    for (const rel of allRelationships) {
      // Skip if already matched
      if (matchedSoFar.includes(rel)) continue;

      const newBindings = new Map(bindings);
      if (this.matchesPattern(rel, currentPattern, newBindings)) {
        // Update bindings
        const source = newBindings.get(currentPattern.source) || rel.source;
        const target = newBindings.get(currentPattern.target) || rel.target;
        newBindings.set(currentPattern.source, source);
        newBindings.set(currentPattern.target, target);

        // Recursively match remaining patterns
        const remaining = this.matchRemainingPatterns(
          patterns.slice(1),
          allRelationships,
          [...matchedSoFar, rel],
          newBindings,
        );

        results.push(...remaining);
      }
    }

    return results;
  }

  /**
   * Check if a relationship matches a pattern
   */
  private matchesPattern(
    rel: Relationship,
    pattern: RelationshipPattern,
    bindings: Map<string, string>,
  ): boolean {
    // Check type
    if (rel.type !== pattern.type) return false;

    // Check cardinality if specified
    if (pattern.cardinality && rel.cardinality !== pattern.cardinality) {
      return false;
    }

    // Check source
    const boundSource = bindings.get(pattern.source);
    if (boundSource) {
      if (rel.source !== boundSource) return false;
    }

    // Check target
    const boundTarget = bindings.get(pattern.target);
    if (boundTarget) {
      if (rel.target !== boundTarget) return false;
    }

    return true;
  }

  /**
   * Create an inferred relationship from a rule and matched relationships
   */
  private createInferredRelationship(
    rule: InferenceRule,
    matchedRelationships: Relationship[],
    bindings: Map<string, string>,
  ): InferredRelationship {
    const then = rule.pattern.then;

    // Resolve bindings for source and target
    const source = bindings.get(then.source) || then.source;
    const target = bindings.get(then.target) || then.target;

    const inferredRel: InferredRelationship = {
      id: `${source}_${then.type}_${target}_inferred`,
      type: then.type,
      source,
      target,
      cardinality: then.cardinality,
      confidence: rule.confidence,
      observations: 0, // Inferred relationships start with 0 direct observations
      metadata: {
        inferred: true,
        inferredBy: rule.name,
        inferredFrom: matchedRelationships.map((r) => r.id),
        inferredAt: new Date(),
      },
      inferred: true,
      inferredBy: rule.name,
      inferredFrom: matchedRelationships.map((r) => r.id),
      inferredAt: new Date(),
    };

    return inferredRel;
  }

  /**
   * Update graph reference (useful when graph is reloaded)
   */
  setGraph(graph: WorldviewGraph): void {
    this.graph = graph;
  }
}
