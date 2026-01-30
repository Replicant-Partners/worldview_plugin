import {
  IAgentRuntime,
  elizaLogger,
  generateText,
  ModelClass,
} from "@ai16z/eliza";
import { Entity, Suggestion, ValidationResult } from "../types";

/**
 * SuggestionValidator: LLM-based validation layer (Phase 3)
 * Inspired by Agent-OM's Matching Validator
 *
 * Reduces false positives by validating suggestions before auto-applying.
 * Uses binary LLM prompts for verification.
 *
 * Validation Types:
 * 1. Entity Equivalence - Are two entities the same concept?
 * 2. Relationship Validity - Does a relationship make sense?
 * 3. Merge Validity - Should entities be merged?
 */

export interface ValidatorConfig {
  enabled?: boolean; // Enable validation (default: true)
  model?: ModelClass; // Model to use (default: LARGE for better reasoning)
  modelName?: string; // Specific model name (e.g., "gpt-4o", "claude-opus-4-5")
  maxRetries?: number; // Max retries on error (default: 2)
  minConfidenceBoost?: number; // Boost for validated suggestions (default: 0.1)
}

export class SuggestionValidator {
  private config: Required<Omit<ValidatorConfig, "modelName">> & {
    modelName?: string;
  };

  constructor(
    private runtime: IAgentRuntime,
    config: ValidatorConfig = {},
  ) {
    // Get model name from config or environment
    const modelName =
      config.modelName ||
      runtime.getSetting("WORLDVIEW_VALIDATION_MODEL") ||
      process.env.WORLDVIEW_VALIDATION_MODEL;

    // Determine ModelClass based on model name if provided
    let modelClass = config.model ?? ModelClass.LARGE; // Default to LARGE for better reasoning

    if (modelName) {
      // Map specific models to ModelClass
      if (
        modelName.includes("gpt-4") ||
        modelName.includes("claude-opus") ||
        modelName.includes("claude-sonnet-4")
      ) {
        modelClass = ModelClass.LARGE;
      } else if (
        modelName.includes("gpt-3.5") ||
        modelName.includes("claude-sonnet-3") ||
        modelName.includes("claude-haiku")
      ) {
        modelClass = ModelClass.SMALL;
      }
    }

    this.config = {
      enabled: config.enabled ?? true,
      model: modelClass,
      modelName: modelName,
      maxRetries: config.maxRetries ?? 2,
      minConfidenceBoost: config.minConfidenceBoost ?? 0.1,
    };

    elizaLogger.info("[SuggestionValidator] Initialized", {
      enabled: this.config.enabled,
      model: this.config.model,
      modelName: this.config.modelName || "default",
    });
  }

  /**
   * Validate a suggestion before applying
   */
  async validateSuggestion(
    suggestion: Suggestion,
    context: string = "general knowledge",
  ): Promise<ValidationResult> {
    if (!this.config.enabled) {
      // Skip validation if disabled
      return {
        valid: true,
        explanation: "Validation disabled",
        confidence: suggestion.confidence,
      };
    }

    elizaLogger.debug("[SuggestionValidator] Validating suggestion", {
      type: suggestion.type,
      confidence: suggestion.confidence.toFixed(2),
    });

    try {
      switch (suggestion.type) {
        case "new_relationship":
          return await this.validateRelationship(suggestion, context);

        case "new_entity":
          return await this.validateEntity(suggestion, context);

        case "merge_entities":
          return await this.validateMerge(suggestion, context);

        case "modify_cardinality":
          return await this.validateCardinality(suggestion, context);

        default:
          return {
            valid: true,
            explanation: "Unknown suggestion type, skipping validation",
            confidence: suggestion.confidence,
          };
      }
    } catch (error) {
      elizaLogger.error("[SuggestionValidator] Validation error", { error });
      // On error, reject to be safe
      return {
        valid: false,
        explanation: `Validation error: ${error}`,
        confidence: 0,
      };
    }
  }

  /**
   * Validate entity equivalence
   * Checks if two entities represent the same concept
   */
  async validateEntityEquivalence(
    entity1: Entity,
    entity2: Entity,
    context: string = "general knowledge",
  ): Promise<ValidationResult> {
    if (!this.config.enabled) {
      return {
        valid: true,
        explanation: "Validation disabled",
        confidence: 1.0,
      };
    }

    const prompt = this.buildEntityEquivalencePrompt(entity1, entity2, context);

    const response = await this.queryLLM(prompt);
    return this.parseValidationResponse(response);
  }

  /**
   * Validate relationship validity
   */
  private async validateRelationship(
    suggestion: Suggestion,
    context: string,
  ): Promise<ValidationResult> {
    const { source, target, relationship, cardinality } = suggestion.data;

    if (!source || !target || !relationship) {
      return {
        valid: false,
        explanation: "Missing relationship data",
        confidence: 0,
      };
    }

    const prompt = this.buildRelationshipPrompt(
      source,
      target,
      relationship,
      cardinality?.toString() || "unknown",
      context,
    );

    const response = await this.queryLLM(prompt);
    const result = this.parseValidationResponse(response);

    // Boost confidence if validated
    if (result.valid) {
      result.confidence = Math.min(
        1.0,
        suggestion.confidence + this.config.minConfidenceBoost,
      );
    }

    return result;
  }

  /**
   * Validate new entity
   */
  private async validateEntity(
    suggestion: Suggestion,
    context: string,
  ): Promise<ValidationResult> {
    const entity = suggestion.data.entity;

    if (!entity) {
      return {
        valid: false,
        explanation: "Missing entity data",
        confidence: 0,
      };
    }

    const prompt = `Question: Is "${entity.id}" a valid concept in the context of ${context}?

Consider:
- Is this a meaningful entity type?
- Does it make sense in the domain of ${context}?
- Is it not too generic or too specific?

Answer yes or no, then provide a brief explanation (1-2 sentences).`;

    const response = await this.queryLLM(prompt);
    return this.parseValidationResponse(response);
  }

  /**
   * Validate entity merge
   */
  private async validateMerge(
    suggestion: Suggestion,
    context: string,
  ): Promise<ValidationResult> {
    const { source, target } = suggestion.data;

    if (!source || !target) {
      return {
        valid: false,
        explanation: "Missing merge data",
        confidence: 0,
      };
    }

    const prompt = `Question: Should "${source}" and "${target}" be merged into a single entity?

Context: ${context}

Consider:
- Do they represent the same concept?
- Would merging them lose important distinctions?
- Is one a specialization of the other?

Answer yes or no, then provide a brief explanation (1-2 sentences).`;

    const response = await this.queryLLM(prompt);
    return this.parseValidationResponse(response);
  }

  /**
   * Validate cardinality modification
   */
  private async validateCardinality(
    suggestion: Suggestion,
    context: string,
  ): Promise<ValidationResult> {
    const { source, target, relationship, cardinality } = suggestion.data;

    if (!source || !target || !relationship || !cardinality) {
      return {
        valid: false,
        explanation: "Missing cardinality data",
        confidence: 0,
      };
    }

    const prompt = `Question: Is the cardinality "${cardinality}" correct for the relationship "${source} ${relationship} ${target}"?

Context: ${context}

Consider:
- Can one ${source} have multiple ${target}s?
- Can one ${target} belong to multiple ${source}s?
- Does the cardinality make logical sense?

Answer yes or no, then provide a brief explanation (1-2 sentences).`;

    const response = await this.queryLLM(prompt);
    return this.parseValidationResponse(response);
  }

  /**
   * Build entity equivalence prompt
   */
  private buildEntityEquivalencePrompt(
    entity1: Entity,
    entity2: Entity,
    context: string,
  ): string {
    let prompt = `Question: Are "${entity1.id}" and "${entity2.id}" the same concept?\n\n`;
    prompt += `Context: ${context}\n\n`;

    // Add entity descriptions if available
    if (entity1.enrichment?.lexical) {
      prompt += `Entity 1 Description: ${entity1.enrichment.lexical}\n`;
    }
    if (entity2.enrichment?.lexical) {
      prompt += `Entity 2 Description: ${entity2.enrichment.lexical}\n`;
    }

    prompt += `\nConsider:\n`;
    prompt += `- Do they refer to the same thing?\n`;
    prompt += `- Are they different aspects of the same concept?\n`;
    prompt += `- Is one a specialization of the other?\n\n`;
    prompt += `Answer yes or no, then provide a brief explanation (1-2 sentences).`;

    return prompt;
  }

  /**
   * Build relationship validation prompt
   */
  private buildRelationshipPrompt(
    source: string,
    target: string,
    relationType: string,
    cardinality: string,
    context: string,
  ): string {
    let prompt = `Question: Does the relationship "${source} ${relationType} ${target}" make sense?\n\n`;
    prompt += `Context: ${context}\n`;
    prompt += `Relationship Type: ${relationType}\n`;
    prompt += `Cardinality: ${cardinality}\n\n`;

    prompt += `Consider:\n`;
    prompt += `- Is this a logical relationship between these entities?\n`;
    prompt += `- Does the relationship type accurately describe the connection?\n`;
    prompt += `- Would this relationship be useful for understanding the domain?\n\n`;
    prompt += `Answer yes or no, then provide a brief explanation (1-2 sentences).`;

    return prompt;
  }

  /**
   * Query LLM with retry logic
   */
  private async queryLLM(prompt: string): Promise<string> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await generateText({
          runtime: this.runtime,
          context: prompt,
          modelClass: this.config.model,
        });

        return response.trim();
      } catch (error) {
        lastError = error;
        elizaLogger.warn("[SuggestionValidator] LLM query failed", {
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
          error,
        });

        if (attempt < this.config.maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    throw lastError;
  }

  /**
   * Parse LLM response into ValidationResult
   * Expects format: "Yes/No. Explanation..."
   */
  private parseValidationResponse(response: string): ValidationResult {
    const lowerResponse = response.toLowerCase();

    // Check for yes/no in first sentence
    const firstSentence = response.split(/[.!?]/)[0].toLowerCase();
    const isYes = firstSentence.includes("yes");
    const isNo = firstSentence.includes("no");

    // Extract explanation (everything after yes/no)
    const explanation = response.replace(/^(yes|no)[,.\s]*/i, "").trim();

    if (isYes && !isNo) {
      return {
        valid: true,
        explanation: explanation || "LLM validated as correct",
        confidence: 0.9,
      };
    } else if (isNo && !isYes) {
      return {
        valid: false,
        explanation: explanation || "LLM rejected as incorrect",
        confidence: 0.1,
      };
    } else {
      // Ambiguous response, be conservative
      elizaLogger.warn("[SuggestionValidator] Ambiguous response", {
        response,
      });
      return {
        valid: false,
        explanation: `Ambiguous response: ${response}`,
        confidence: 0.5,
      };
    }
  }

  /**
   * Batch validate multiple suggestions
   */
  async validateBatch(
    suggestions: Suggestion[],
    context: string = "general knowledge",
  ): Promise<Map<Suggestion, ValidationResult>> {
    const results = new Map<Suggestion, ValidationResult>();

    // Validate sequentially to avoid rate limits
    for (const suggestion of suggestions) {
      const result = await this.validateSuggestion(suggestion, context);
      results.set(suggestion, result);
    }

    const validCount = Array.from(results.values()).filter(
      (r) => r.valid,
    ).length;
    elizaLogger.info("[SuggestionValidator] Batch validation complete", {
      total: suggestions.length,
      valid: validCount,
      rejected: suggestions.length - validCount,
    });

    return results;
  }

  /**
   * Enable or disable validation
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Check if validation is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}
