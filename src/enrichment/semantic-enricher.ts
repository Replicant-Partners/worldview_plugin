import { Entity, Relationship } from "../types";
import { WorldviewGraph } from "../graph";

/**
 * SemanticEnricher: Extract relationship context for entities
 * Inspired by Agent-OM's semantic retriever
 *
 * Generates natural language descriptions of an entity's relationships:
 * - Outgoing relationships (what this entity does/has)
 * - Incoming relationships (what relates to this entity)
 * - Semantic role (hub, leaf, bridge)
 */

export class SemanticEnricher {
  constructor(private graph: WorldviewGraph) {}

  /**
   * Verbalize a relationship into natural language
   * Example: USER ||--o{ MESSAGE : creates
   * → "USER creates MESSAGE (one-to-many composition)"
   */
  private verbalizeRelationship(rel: Relationship, sourceEntity: Entity): string {
    const isOutgoing = rel.source === sourceEntity.id;
    const otherEntity = isOutgoing ? rel.target : rel.source;

    const direction = isOutgoing ? "outgoing" : "incoming";
    const verb = rel.type;

    // Get cardinality semantics
    let cardinalityDesc = "";
    if (rel.cardinality.includes("||--o{")) {
      cardinalityDesc = " (one-to-many)";
    } else if (rel.cardinality.includes("}o--||")) {
      cardinalityDesc = " (many-to-one)";
    } else if (rel.cardinality.includes("}o--o{")) {
      cardinalityDesc = " (many-to-many)";
    } else if (rel.cardinality.includes("||--||")) {
      cardinalityDesc = " (one-to-one)";
    }

    if (isOutgoing) {
      return `${sourceEntity.type} ${verb} ${otherEntity}${cardinalityDesc}`;
    } else {
      return `${otherEntity} ${verb} ${sourceEntity.type}${cardinalityDesc}`;
    }
  }

  /**
   * Determine semantic role of entity in the graph
   */
  private determineSemanticRole(
    entity: Entity,
    relationships: Relationship[]
  ): string {
    const incomingCount = relationships.filter(
      (r) => r.target === entity.id
    ).length;
    const outgoingCount = relationships.filter(
      (r) => r.source === entity.id
    ).length;

    const totalConnections = incomingCount + outgoingCount;

    if (totalConnections === 0) {
      return "isolated entity";
    } else if (totalConnections >= 5) {
      return "hub entity (highly connected)";
    } else if (incomingCount === 0 && outgoingCount > 0) {
      return "source entity (only outgoing relationships)";
    } else if (outgoingCount === 0 && incomingCount > 0) {
      return "leaf entity (only incoming relationships)";
    } else if (incomingCount > 0 && outgoingCount > 0) {
      return "bridge entity (connects other entities)";
    }

    return "entity";
  }

  /**
   * Enrich entity with semantic (relationship) context
   */
  enrich(entity: Entity): string {
    const relationships = this.graph.getRelationships(entity.id);

    if (relationships.length === 0) {
      return `${entity.type} has no relationships yet.`;
    }

    // Determine semantic role
    const role = this.determineSemanticRole(entity, relationships);

    // Verbalize relationships
    const relationshipDescriptions = relationships
      .slice(0, 10) // Limit to top 10 relationships
      .map((rel) => this.verbalizeRelationship(rel, entity));

    let description = `${entity.type} is a ${role}. `;
    description += `Relationships: ${relationshipDescriptions.join("; ")}.`;

    if (relationships.length > 10) {
      description += ` (and ${relationships.length - 10} more relationships)`;
    }

    return description;
  }

  /**
   * Batch enrich multiple entities
   */
  enrichBatch(entities: Entity[]): string[] {
    return entities.map((entity) => this.enrich(entity));
  }

  /**
   * Update the graph reference (useful when graph is reloaded)
   */
  setGraph(graph: WorldviewGraph): void {
    this.graph = graph;
  }
}
