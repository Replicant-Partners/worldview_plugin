export interface Entity {
  id: string;
  type: string;
  attributes: Record<string, any>;
  firstSeen: Date;
  lastSeen: Date;
  observationCount: number;
}

export interface Relationship {
  id: string;
  type: string;
  source: string; // entity id
  target: string; // entity id
  cardinality: Cardinality;
  confidence: number;
  observations: number;
  metadata: Record<string, any>;
}

export enum Cardinality {
  OneToOne = "||--||",
  OneToMany = "||--o{",
  ManyToOne = "}o--||",
  ManyToMany = "}o--o{",
  ZeroOrOne = "||--o|",
  ZeroOrMany = "}o--o|",
}

export interface CardinalitySemantics {
  implies: string;
  deletionBehavior: "cascade" | "cascade_children" | "unlink_only";
  queryDirection: "bidirectional" | "hierarchical" | "graph_traversal";
  inferenceType: string;
}

export interface Suggestion {
  type:
    | "new_entity"
    | "new_relationship"
    | "modify_cardinality"
    | "merge_entities";
  confidence: number;
  reasoning: string;
  data: {
    source?: string;
    target?: string;
    relationship?: string;
    cardinality?: Cardinality;
    entity?: Partial<Entity>;
  };
  preview: string; // Mermaid snippet
}

export interface OntologyHealth {
  completeness: number;
  consistency: number;
  depth: number;
  orphanCount: number;
  hubEntities: string[];
  suggestions: Suggestion[];
  lastAnalyzed: Date;
}

export interface WorldviewState {
  entities: Map<string, Entity>;
  relationships: Map<string, Relationship>;
  version: number;
  lastModified: Date;
}

export const CARDINALITY_SEMANTICS: Record<Cardinality, CardinalitySemantics> =
  {
    [Cardinality.OneToOne]: {
      implies: "equivalence",
      deletionBehavior: "cascade",
      queryDirection: "bidirectional",
      inferenceType: "identity",
    },
    [Cardinality.OneToMany]: {
      implies: "composition",
      deletionBehavior: "cascade_children",
      queryDirection: "hierarchical",
      inferenceType: "ownership",
    },
    [Cardinality.ManyToOne]: {
      implies: "attribution",
      deletionBehavior: "unlink_only",
      queryDirection: "hierarchical",
      inferenceType: "categorization",
    },
    [Cardinality.ManyToMany]: {
      implies: "association",
      deletionBehavior: "unlink_only",
      queryDirection: "graph_traversal",
      inferenceType: "co-occurrence",
    },
    [Cardinality.ZeroOrOne]: {
      implies: "optional_dependency",
      deletionBehavior: "unlink_only",
      queryDirection: "bidirectional",
      inferenceType: "weak_binding",
    },
    [Cardinality.ZeroOrMany]: {
      implies: "loose_association",
      deletionBehavior: "unlink_only",
      queryDirection: "graph_traversal",
      inferenceType: "weak_pattern",
    },
  };
