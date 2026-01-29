import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import {
  Entity,
  Relationship,
  Cardinality,
  Suggestion,
  WorldviewState,
  CARDINALITY_SEMANTICS,
} from "./types";

export class WorldviewGraph {
  private entities: Map<string, Entity>;
  private relationships: Map<string, Relationship>;
  private version: number;
  private filePath: string;

  constructor(filePath: string) {
    this.entities = new Map();
    this.relationships = new Map();
    this.version = 0;
    this.filePath = filePath;
  }

  /**
   * Load worldview from Mermaid ER diagram file
   */
  static async load(filePath: string): Promise<WorldviewGraph> {
    const graph = new WorldviewGraph(filePath);

    if (!existsSync(filePath)) {
      // Initialize empty graph
      await graph.save();
      return graph;
    }

    const content = readFileSync(filePath, "utf-8");
    graph.fromMermaid(content);
    return graph;
  }

  /**
   * Parse Mermaid ER diagram into graph structure
   */
  private fromMermaid(diagram: string): void {
    const lines = diagram.split("\n").map((l) => l.trim());

    for (const line of lines) {
      if (line.startsWith("erDiagram") || line === "") continue;

      // Parse entity definitions: ENTITY { ... }
      if (line.includes("{") && !line.includes("||") && !line.includes("}o")) {
        const entityMatch = line.match(/(\w+)\s*{/);
        if (entityMatch) {
          const entityId = entityMatch[1];
          this.addEntity({
            id: entityId,
            type: entityId,
            attributes: {},
            firstSeen: new Date(),
            lastSeen: new Date(),
            observationCount: 1,
          });
        }
      }

      // Parse relationships: ENTITY1 ||--o{ ENTITY2 : relationship_type
      const relMatch = line.match(
        /(\w+)\s+([\|\}][\|\o]--[\|\o][\{\|])\s+(\w+)\s*:\s*(\w+)/,
      );
      if (relMatch) {
        const [, source, cardinality, target, relType] = relMatch;

        // Ensure entities exist
        if (!this.entities.has(source)) {
          this.addEntity({
            id: source,
            type: source,
            attributes: {},
            firstSeen: new Date(),
            lastSeen: new Date(),
            observationCount: 1,
          });
        }
        if (!this.entities.has(target)) {
          this.addEntity({
            id: target,
            type: target,
            attributes: {},
            firstSeen: new Date(),
            lastSeen: new Date(),
            observationCount: 1,
          });
        }

        this.addRelationship({
          id: `${source}_${relType}_${target}`,
          type: relType,
          source,
          target,
          cardinality: cardinality as Cardinality,
          confidence: 1.0,
          observations: 1,
          metadata: {},
        });
      }
    }
  }

  /**
   * Serialize graph to Mermaid ER diagram format
   */
  toMermaid(): string {
    let diagram = "erDiagram\n";

    // Output relationships first
    for (const rel of this.relationships.values()) {
      diagram += `    ${rel.source} ${rel.cardinality} ${rel.target} : ${rel.type}\n`;
    }

    diagram += "\n";

    // Output entity definitions with attributes
    for (const entity of this.entities.values()) {
      const hasAttributes = Object.keys(entity.attributes).length > 0;
      if (hasAttributes) {
        diagram += `    ${entity.id} {\n`;
        for (const [key, value] of Object.entries(entity.attributes)) {
          diagram += `        string ${key}\n`;
        }
        diagram += `    }\n`;
      }
    }

    return diagram;
  }

  /**
   * Save worldview to Mermaid file
   */
  async save(): Promise<void> {
    const dir = join(this.filePath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = this.toMermaid();
    writeFileSync(this.filePath, content, "utf-8");
    this.version++;
  }

  /**
   * Add or update an entity
   */
  addEntity(entity: Entity): void {
    const existing = this.entities.get(entity.id);
    if (existing) {
      existing.lastSeen = new Date();
      existing.observationCount++;
      Object.assign(existing.attributes, entity.attributes);
    } else {
      this.entities.set(entity.id, entity);
    }
  }

  /**
   * Add or update a relationship
   */
  addRelationship(rel: Relationship): void {
    const existing = this.relationships.get(rel.id);
    if (existing) {
      existing.observations++;
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
    } else {
      this.relationships.set(rel.id, rel);
    }
  }

  /**
   * Check if relationship exists
   */
  hasRelationship(source: string, target: string, type?: string): boolean {
    for (const rel of this.relationships.values()) {
      if (rel.source === source && rel.target === target) {
        if (!type || rel.type === type) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get entity by id
   */
  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  /**
   * Get all relationships for an entity
   */
  getRelationships(entityId: string): Relationship[] {
    return Array.from(this.relationships.values()).filter(
      (rel) => rel.source === entityId || rel.target === entityId,
    );
  }

  /**
   * Query entities by pattern
   */
  query(pattern: { type?: string; attribute?: string; value?: any }): Entity[] {
    return Array.from(this.entities.values()).filter((entity) => {
      if (pattern.type && entity.type !== pattern.type) return false;
      if (
        pattern.attribute &&
        entity.attributes[pattern.attribute] !== pattern.value
      )
        return false;
      return true;
    });
  }

  /**
   * Apply a suggestion to the graph
   */
  apply(suggestion: Suggestion): void {
    switch (suggestion.type) {
      case "new_entity":
        if (suggestion.data.entity) {
          this.addEntity(suggestion.data.entity as Entity);
        }
        break;

      case "new_relationship":
        if (
          suggestion.data.source &&
          suggestion.data.target &&
          suggestion.data.relationship
        ) {
          this.addRelationship({
            id: `${suggestion.data.source}_${suggestion.data.relationship}_${suggestion.data.target}`,
            type: suggestion.data.relationship,
            source: suggestion.data.source,
            target: suggestion.data.target,
            cardinality: suggestion.data.cardinality || Cardinality.ManyToMany,
            confidence: suggestion.confidence,
            observations: 1,
            metadata: { auto_generated: true },
          });
        }
        break;

      case "modify_cardinality":
        if (
          suggestion.data.source &&
          suggestion.data.target &&
          suggestion.data.cardinality
        ) {
          const relId = `${suggestion.data.source}_${suggestion.data.relationship}_${suggestion.data.target}`;
          const rel = this.relationships.get(relId);
          if (rel) {
            rel.cardinality = suggestion.data.cardinality;
          }
        }
        break;
    }
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    entities: number;
    relationships: number;
    avgConnections: number;
  } {
    const entityCount = this.entities.size;
    const relCount = this.relationships.size;
    const avgConnections = entityCount > 0 ? relCount / entityCount : 0;

    return {
      entities: entityCount,
      relationships: relCount,
      avgConnections,
    };
  }

  /**
   * Get the current state for serialization
   */
  getState(): WorldviewState {
    return {
      entities: new Map(this.entities),
      relationships: new Map(this.relationships),
      version: this.version,
      lastModified: new Date(),
    };
  }
}
