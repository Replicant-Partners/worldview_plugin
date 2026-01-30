import { InferenceRule, Cardinality } from "../types";

/**
 * Built-in inference rules for the worldview plugin
 * Phase 2: Transitive relationship inference
 */

/**
 * Transitive Closure Rule: part_of relationships
 * If A is part_of B and B is part_of C, then A is part_of C
 *
 * Example:
 * - FUNCTION part_of MODULE
 * - MODULE part_of PACKAGE
 * → FUNCTION part_of PACKAGE (inferred)
 */
export const TRANSITIVE_PART_OF: InferenceRule = {
  name: "transitive_part_of",
  description:
    "Infers transitive part_of relationships: if A part_of B and B part_of C, then A part_of C",
  pattern: {
    if: [
      {
        source: "A",
        type: "part_of",
        target: "B",
      },
      {
        source: "B",
        type: "part_of",
        target: "C",
      },
    ],
    then: {
      source: "A",
      type: "part_of",
      target: "C",
      cardinality: Cardinality.ManyToOne,
      confidence: 0.8,
    },
  },
  confidence: 0.8,
  enabled: true,
};

/**
 * Transitive Closure Rule: belongs_to relationships
 * If A belongs_to B and B belongs_to C, then A belongs_to C
 *
 * Example:
 * - USER belongs_to TEAM
 * - TEAM belongs_to ORGANIZATION
 * → USER belongs_to ORGANIZATION (inferred)
 */
export const TRANSITIVE_BELONGS_TO: InferenceRule = {
  name: "transitive_belongs_to",
  description:
    "Infers transitive belongs_to relationships: if A belongs_to B and B belongs_to C, then A belongs_to C",
  pattern: {
    if: [
      {
        source: "A",
        type: "belongs_to",
        target: "B",
      },
      {
        source: "B",
        type: "belongs_to",
        target: "C",
      },
    ],
    then: {
      source: "A",
      type: "belongs_to",
      target: "C",
      cardinality: Cardinality.ManyToOne,
      confidence: 0.8,
    },
  },
  confidence: 0.8,
  enabled: true,
};

/**
 * Transitive Closure Rule: subclass_of relationships
 * If A subclass_of B and B subclass_of C, then A subclass_of C
 *
 * Example:
 * - CAR subclass_of VEHICLE
 * - VEHICLE subclass_of ENTITY
 * → CAR subclass_of ENTITY (inferred)
 */
export const TRANSITIVE_SUBCLASS_OF: InferenceRule = {
  name: "transitive_subclass_of",
  description:
    "Infers transitive subclass_of relationships: if A subclass_of B and B subclass_of C, then A subclass_of C",
  pattern: {
    if: [
      {
        source: "A",
        type: "subclass_of",
        target: "B",
      },
      {
        source: "B",
        type: "subclass_of",
        target: "C",
      },
    ],
    then: {
      source: "A",
      type: "subclass_of",
      target: "C",
      cardinality: Cardinality.ManyToOne,
      confidence: 0.9,
    },
  },
  confidence: 0.9,
  enabled: true,
};

/**
 * Transitive Closure Rule: depends_on relationships
 * If A depends_on B and B depends_on C, then A depends_on C
 *
 * Example:
 * - SERVICE_A depends_on SERVICE_B
 * - SERVICE_B depends_on DATABASE
 * → SERVICE_A depends_on DATABASE (inferred)
 */
export const TRANSITIVE_DEPENDS_ON: InferenceRule = {
  name: "transitive_depends_on",
  description:
    "Infers transitive depends_on relationships: if A depends_on B and B depends_on C, then A depends_on C",
  pattern: {
    if: [
      {
        source: "A",
        type: "depends_on",
        target: "B",
      },
      {
        source: "B",
        type: "depends_on",
        target: "C",
      },
    ],
    then: {
      source: "A",
      type: "depends_on",
      target: "C",
      cardinality: Cardinality.ManyToMany,
      confidence: 0.75,
    },
  },
  confidence: 0.75,
  enabled: true,
};

/**
 * Symmetric Relationship Rule: connected_to
 * If A connected_to B, then B connected_to A
 *
 * Example:
 * - USER_A connected_to USER_B
 * → USER_B connected_to USER_A (inferred)
 */
export const SYMMETRIC_CONNECTED_TO: InferenceRule = {
  name: "symmetric_connected_to",
  description:
    "Infers symmetric connected_to relationships: if A connected_to B, then B connected_to A",
  pattern: {
    if: [
      {
        source: "A",
        type: "connected_to",
        target: "B",
      },
    ],
    then: {
      source: "B",
      type: "connected_to",
      target: "A",
      cardinality: Cardinality.ManyToMany,
      confidence: 1.0,
    },
  },
  confidence: 1.0,
  enabled: true,
};

/**
 * Inverse Relationship Rule: creates / created_by
 * If A creates B, then B created_by A
 *
 * Example:
 * - USER creates MESSAGE
 * → MESSAGE created_by USER (inferred)
 */
export const INVERSE_CREATES: InferenceRule = {
  name: "inverse_creates",
  description:
    "Infers inverse created_by relationships: if A creates B, then B created_by A",
  pattern: {
    if: [
      {
        source: "A",
        type: "creates",
        target: "B",
      },
    ],
    then: {
      source: "B",
      type: "created_by",
      target: "A",
      cardinality: Cardinality.ManyToOne,
      confidence: 1.0,
    },
  },
  confidence: 1.0,
  enabled: true,
};

/**
 * All built-in inference rules
 */
export const BUILT_IN_RULES: InferenceRule[] = [
  TRANSITIVE_PART_OF,
  TRANSITIVE_BELONGS_TO,
  TRANSITIVE_SUBCLASS_OF,
  TRANSITIVE_DEPENDS_ON,
  SYMMETRIC_CONNECTED_TO,
  INVERSE_CREATES,
];

/**
 * Get default enabled rules
 */
export function getDefaultRules(): InferenceRule[] {
  return BUILT_IN_RULES.filter((rule) => rule.enabled);
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: "transitive" | "symmetric" | "inverse"): InferenceRule[] {
  switch (category) {
    case "transitive":
      return [
        TRANSITIVE_PART_OF,
        TRANSITIVE_BELONGS_TO,
        TRANSITIVE_SUBCLASS_OF,
        TRANSITIVE_DEPENDS_ON,
      ];
    case "symmetric":
      return [SYMMETRIC_CONNECTED_TO];
    case "inverse":
      return [INVERSE_CREATES];
    default:
      return [];
  }
}
