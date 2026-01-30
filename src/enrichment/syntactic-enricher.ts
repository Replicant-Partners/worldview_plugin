import { Entity } from "../types";

/**
 * SyntacticEnricher: Normalizes entity names into readable text
 * Inspired by Agent-OM's syntactic retriever
 *
 * Handles:
 * - CamelCase splitting (ProgramCommitteeChair → program committee chair)
 * - snake_case handling (program_committee_chair → program committee chair)
 * - Acronym detection (PCChair → pc chair)
 * - Normalization (lowercase, spaces)
 */

export class SyntacticEnricher {
  /**
   * Split CamelCase into words
   * Example: "ProgramCommitteeChair" → "Program Committee Chair"
   */
  private splitCamelCase(text: string): string {
    return text
      // Insert space before uppercase letters that follow lowercase
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      // Insert space before uppercase letters that precede lowercase (for acronyms)
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .trim();
  }

  /**
   * Split snake_case into words
   * Example: "program_committee_chair" → "program committee chair"
   */
  private splitSnakeCase(text: string): string {
    return text.replace(/_/g, " ");
  }

  /**
   * Split kebab-case into words
   * Example: "program-committee-chair" → "program committee chair"
   */
  private splitKebabCase(text: string): string {
    return text.replace(/-/g, " ");
  }

  /**
   * Normalize text to lowercase with single spaces
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .trim();
  }

  /**
   * Enrich entity with syntactic information
   * Returns normalized, human-readable version of entity name
   */
  enrich(entity: Entity): string {
    let text = entity.id;

    // Try to use type as the entity name if it's more descriptive
    if (entity.type && entity.type !== entity.id) {
      text = entity.type;
    }

    // Handle different naming conventions
    text = this.splitCamelCase(text);
    text = this.splitSnakeCase(text);
    text = this.splitKebabCase(text);

    // Normalize
    text = this.normalize(text);

    return text;
  }

  /**
   * Batch enrich multiple entities
   */
  enrichBatch(entities: Entity[]): string[] {
    return entities.map((entity) => this.enrich(entity));
  }
}
