import { Entity } from "../types";
import {
  IAgentRuntime,
  elizaLogger,
  generateText,
  ModelClass,
} from "@ai16z/eliza";

/**
 * LexicalEnricher: LLM-powered semantic understanding of entities
 * Inspired by Agent-OM's lexical retriever
 *
 * Generates context-aware meanings using LLMs:
 * - General meaning: What is this concept?
 * - Context meaning: What does it mean in this domain?
 * - Content meaning: Additional info from entity attributes
 */

export class LexicalEnricher {
  constructor(
    private runtime: IAgentRuntime,
    private context: string = "general knowledge",
  ) {}

  /**
   * Extract any textual descriptions from entity attributes
   */
  private extractContent(entity: Entity): string {
    const contentFields = [
      "description",
      "label",
      "comment",
      "definition",
      "note",
    ];

    const contents: string[] = [];

    for (const field of contentFields) {
      if (entity.attributes[field]) {
        contents.push(String(entity.attributes[field]));
      }
    }

    return contents.join(". ");
  }

  /**
   * Generate LLM prompt for entity meaning extraction
   */
  private generatePrompt(entity: Entity, syntactic: string): string {
    const content = this.extractContent(entity);
    const hasContent = content.length > 0;

    let prompt = `Question: What is the meaning of "${syntactic}"?\n`;
    prompt += `Context: ${this.context}\n`;

    if (hasContent) {
      prompt += `Additional Information: ${content}\n`;
    }

    prompt += `\nProvide a concise definition (2-3 sentences) of what "${syntactic}" means in the context of ${this.context}.`;

    if (hasContent) {
      prompt += ` Consider the additional information provided.`;
    }

    prompt += ` Be specific and focus on its role, purpose, or characteristics.`;

    return prompt;
  }

  /**
   * Enrich entity with lexical (meaning) information using LLM
   */
  async enrich(entity: Entity, syntactic: string): Promise<string> {
    try {
      const prompt = this.generatePrompt(entity, syntactic);

      elizaLogger.debug("[LexicalEnricher] Generating meaning", {
        entity: entity.id,
        syntactic,
        context: this.context,
      });

      // Use runtime's LLM to generate meaning
      const response = await generateText({
        runtime: this.runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
      });

      const meaning = response.trim();

      elizaLogger.debug("[LexicalEnricher] Generated meaning", {
        entity: entity.id,
        length: meaning.length,
      });

      return meaning;
    } catch (error) {
      elizaLogger.error("[LexicalEnricher] Error generating meaning", {
        entity: entity.id,
        error,
      });

      // Fallback: use syntactic + any available content
      const content = this.extractContent(entity);
      return content || syntactic;
    }
  }

  /**
   * Batch enrich multiple entities
   * Processes sequentially to avoid rate limits
   */
  async enrichBatch(
    entities: Entity[],
    syntactics: string[],
  ): Promise<string[]> {
    const results: string[] = [];

    for (let i = 0; i < entities.length; i++) {
      const meaning = await this.enrich(entities[i], syntactics[i]);
      results.push(meaning);
    }

    return results;
  }

  /**
   * Update the context for domain-specific enrichment
   */
  setContext(context: string): void {
    this.context = context;
  }
}
