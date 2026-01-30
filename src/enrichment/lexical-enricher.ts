import { Entity } from "../types";
import {
  IAgentRuntime,
  elizaLogger,
} from "@elizaos/core";
import { generateText, ModelClass } from "../compat/eliza-compat";

/**
 * LexicalEnricher: LLM-powered semantic understanding of entities
 * Inspired by Agent-OM's lexical retriever
 *
 * Generates context-aware meanings using LLMs:
 * - General meaning: What is this concept?
 * - Context meaning: What does it mean in this domain?
 */
export class LexicalEnricher {
  private runtime: IAgentRuntime;
  private context: string;
  private cache: Map<string, string>;

  constructor(runtime: IAgentRuntime, context: string = "") {
    this.runtime = runtime;
    this.context = context;
    this.cache = new Map();
  }

  /**
   * Enrich an entity with lexical (meaning-based) content
   * Uses LLM to generate context-aware definition
   */
  async enrich(entity: Entity): Promise<string> {
    // Check cache first
    const cacheKey = `${entity.id}:${this.context}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Extract syntactic representation (for LLM prompt)
    const syntactic = this.extractSyntactic(entity);

    // Build prompt for meaning generation
    const prompt = this.buildPrompt(entity.id, syntactic, this.context);

    try {
      // Generate meaning using LLM
      const response = await generateText({
        runtime: this.runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
      });

      const meaning = response.trim();

      elizaLogger.debug({
        entity: entity.id,
        length: meaning.length,
      }, "[LexicalEnricher] Generated meaning");

      // Cache for future use
      this.cache.set(cacheKey, meaning);

      return meaning;
    } catch (error) {
      elizaLogger.error({
        entity: entity.id,
        error,
      }, "[LexicalEnricher] Failed to generate meaning");

      // Fallback: Use syntactic representation
      return syntactic;
    }
  }

  /**
   * Extract syntactic representation from entity
   * Used as basis for LLM prompt
   */
  private extractSyntactic(entity: Entity): string {
    // Simple approach: normalize ID and extract components
    const normalized = entity.id.replace(/[-_]/g, " ").toLowerCase();
    return normalized;
  }

  /**
   * Build LLM prompt for lexical meaning generation
   */
  private buildPrompt(
    entityName: string,
    syntactic: string,
    context: string
  ): string {
    const contextNote = context
      ? `in the context of ${context}`
      : "in general terms";

    return `Define "${entityName}" (syntactically: "${syntactic}") ${contextNote}. 
Provide a concise, technical definition in 1-2 sentences. 
Focus on what it IS and what it DOES.`;
  }

  /**
   * Set context for lexical enrichment
   */
  setContext(context: string): void {
    this.context = context;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
