export interface Entity {
  id: string;
  type: string;
  attributes: Record<string, any>;
  firstSeen: Date;
  lastSeen: Date;
  observationCount: number;
  enrichment?: EntityEnrichment;
}

export interface EntityEnrichment {
  syntactic: string; // Normalized name (e.g., "program committee chair")
  lexical: string; // LLM-generated meaning/description
  semantic: string; // Relationship context
  lastEnriched: Date; // When enrichment was last updated
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

// Enrichment-related types for Agent-OM integration

export interface EnrichedEntity {
  id: string;
  type: string;
  syntactic: string;
  lexical: string;
  semantic: string;
  embeddings: {
    syntactic: number[];
    lexical: number[];
    semantic: number[];
  };
}

export interface VectorRecord {
  entity_id: string;
  category: "source" | "target";
  entity_type: string;
  content_type: "syntactic" | "lexical" | "semantic";
  content: string;
  embedding: number[];
  metadata: {
    agentId: string;
    version: number;
    created: Date;
  };
}

export interface MatchScore {
  entityId: string;
  syntacticScore: number;
  lexicalScore: number;
  semanticScore: number;
  rrfScore: number;
  rank: number;
}

export interface Match {
  entity: Entity;
  score: MatchScore;
  confidence: number;
  reasoning: string;
}

export interface ValidationResult {
  valid: boolean;
  explanation: string;
  confidence: number;
}

export interface AlignmentResult {
  sourceAgentId: string;
  targetAgentId: string;
  matches: Array<{
    sourceEntity: Entity;
    targetEntity: Entity;
    confidence: number;
    reasoning: string;
  }>;
  conflicts: Array<{
    entity: string;
    sourceType: string;
    targetType: string;
    resolution?: string;
  }>;
  stats: {
    totalSource: number;
    totalTarget: number;
    matched: number;
    unmatched: number;
  };
}

export interface WorldviewMetrics {
  entities: {
    total: number;
    enriched: number;
    byType: Record<string, number>;
  };
  relationships: {
    total: number;
    validated: number;
    byCardinality: Record<Cardinality, number>;
  };
  suggestions: {
    generated: number;
    applied: number;
    queued: number;
    rejected: number;
  };
  performance: {
    enrichmentTimeMs: number;
    matchingTimeMs: number;
    validationTimeMs: number;
  };
}

// Phase 2: Inference Rule Types

export interface RelationshipPattern {
  source: string;
  type: string;
  target: string;
  cardinality?: Cardinality;
}

export interface InferenceRule {
  name: string;
  description: string;
  pattern: {
    if: RelationshipPattern[];
    then: Omit<Relationship, "id" | "observations" | "metadata">;
  };
  confidence: number;
  enabled: boolean;
}

export interface InferredRelationship extends Relationship {
  inferred: true;
  inferredBy: string; // Rule name
  inferredFrom: string[]; // Source relationship IDs
  inferredAt: Date;
}

export interface InferenceResult {
  rule: string;
  inferred: InferredRelationship[];
  skipped: Array<{
    relationship: Partial<InferredRelationship>;
    reason: string;
  }>;
  executionTimeMs: number;
}
