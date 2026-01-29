import { Memory } from '@ai16z/eliza'
import { WorldviewGraph } from './graph'
import { Suggestion, Cardinality, Entity } from './types'

interface EntityPair {
  source: string
  target: string
  count: number
  contexts: string[]
}

export class PatternObserver {
  private graph: WorldviewGraph
  private minObservations = 3  // Minimum co-occurrences to suggest relationship
  private highConfidenceThreshold = 0.9
  private mediumConfidenceThreshold = 0.7

  constructor(graph: WorldviewGraph) {
    this.graph = graph
  }

  /**
   * Analyze memories to detect patterns and generate suggestions
   */
  analyze(memories: Memory[]): Suggestion[] {
    const suggestions: Suggestion[] = []

    // Extract entity pairs and their co-occurrence patterns
    const entityPairs = this.extractEntityPairs(memories)

    // Suggest new relationships
    for (const pair of entityPairs) {
      if (pair.count >= this.minObservations) {
        const existing = this.graph.hasRelationship(pair.source, pair.target)
        
        if (!existing) {
          const cardinality = this.inferCardinality(pair, memories)
          const confidence = this.calculateConfidence(pair.count, memories.length)
          
          suggestions.push({
            type: 'new_relationship',
            confidence,
            reasoning: `Observed ${pair.count} co-occurrences across ${pair.contexts.length} contexts`,
            data: {
              source: pair.source,
              target: pair.target,
              relationship: 'relates_to',
              cardinality
            },
            preview: `${pair.source} ${cardinality} ${pair.target} : relates_to`
          })
        }
      }
    }

    // Suggest new entities
    const entityCandidates = this.extractEntityCandidates(memories)
    for (const candidate of entityCandidates) {
      if (!this.graph.getEntity(candidate.id)) {
        suggestions.push({
          type: 'new_entity',
          confidence: candidate.confidence,
          reasoning: `Frequently mentioned concept (${candidate.mentions} times)`,
          data: {
            entity: candidate.entity
          },
          preview: `${candidate.id} { }`
        })
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Extract entity pairs from memories
   */
  private extractEntityPairs(memories: Memory[]): EntityPair[] {
    const pairMap = new Map<string, EntityPair>()

    for (const memory of memories) {
      const entities = this.extractEntitiesFromText(memory.content?.text || '')
      
      // Create pairs from co-occurring entities
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const source = entities[i]
          const target = entities[j]
          const key = `${source}:${target}`
          
          if (!pairMap.has(key)) {
            pairMap.set(key, {
              source,
              target,
              count: 0,
              contexts: []
            })
          }
          
          const pair = pairMap.get(key)!
          pair.count++
          pair.contexts.push(memory.content?.text || '')
        }
      }
    }

    return Array.from(pairMap.values())
  }

  /**
   * Extract potential entities from text
   * Simple implementation - looks for capitalized words and common patterns
   */
  private extractEntitiesFromText(text: string): string[] {
    const entities: string[] = []
    
    // Extract capitalized words (potential proper nouns)
    const capitalizedWords = text.match(/\b[A-Z][a-z]+\b/g) || []
    entities.push(...capitalizedWords)
    
    // Extract quoted phrases
    const quotedPhrases = text.match(/"([^"]+)"/g) || []
    entities.push(...quotedPhrases.map(p => p.replace(/"/g, '')))
    
    // Extract common entity patterns (dates, locations, etc)
    // This is simplified - could use NER in future
    const commonPatterns = [
      /\b(user|agent|message|conversation|action|goal|intent)\b/gi
    ]
    
    for (const pattern of commonPatterns) {
      const matches = text.match(pattern) || []
      entities.push(...matches.map(m => m.toUpperCase()))
    }

    // Deduplicate and normalize
    return Array.from(new Set(entities.map(e => this.normalizeEntity(e))))
  }

  /**
   * Normalize entity names
   */
  private normalizeEntity(entity: string): string {
    return entity.toUpperCase().replace(/\s+/g, '_')
  }

  /**
   * Infer cardinality from observation patterns
   */
  private inferCardinality(pair: EntityPair, allMemories: Memory[]): Cardinality {
    // Count unique instances of each entity
    const sourceInstances = new Set<string>()
    const targetInstances = new Set<string>()

    for (const context of pair.contexts) {
      // This is simplified - in practice, you'd want more sophisticated entity tracking
      sourceInstances.add(pair.source)
      targetInstances.add(pair.target)
    }

    const sourceCount = sourceInstances.size
    const targetCount = targetInstances.size
    const ratio = sourceCount / targetCount

    // Infer cardinality based on instance ratios
    if (ratio > 2) {
      return Cardinality.ManyToOne
    } else if (ratio < 0.5) {
      return Cardinality.OneToMany
    } else if (pair.count > 10) {
      return Cardinality.ManyToMany
    } else {
      return Cardinality.ZeroOrMany
    }
  }

  /**
   * Calculate confidence score for a suggestion
   */
  private calculateConfidence(observations: number, totalMemories: number): number {
    // Confidence increases with observations but has diminishing returns
    const frequencyScore = Math.min(1.0, observations / 10)
    const proportionScore = Math.min(1.0, observations / totalMemories)
    
    // Weighted average favoring frequency
    return (frequencyScore * 0.7) + (proportionScore * 0.3)
  }

  /**
   * Extract potential new entities from memories
   */
  private extractEntityCandidates(memories: Memory[]): Array<{
    id: string
    entity: Entity
    mentions: number
    confidence: number
  }> {
    const candidates = new Map<string, { mentions: number; contexts: string[] }>()

    for (const memory of memories) {
      const entities = this.extractEntitiesFromText(memory.content?.text || '')
      
      for (const entity of entities) {
        if (!candidates.has(entity)) {
          candidates.set(entity, { mentions: 0, contexts: [] })
        }
        const candidate = candidates.get(entity)!
        candidate.mentions++
        candidate.contexts.push(memory.content?.text || '')
      }
    }

    return Array.from(candidates.entries())
      .filter(([id, data]) => data.mentions >= 3)
      .map(([id, data]) => ({
        id,
        entity: {
          id,
          type: id,
          attributes: {},
          firstSeen: new Date(),
          lastSeen: new Date(),
          observationCount: data.mentions
        },
        mentions: data.mentions,
        confidence: this.calculateConfidence(data.mentions, memories.length)
      }))
  }

  /**
   * Update thresholds for suggestion generation
   */
  setThresholds(min: number, high: number, medium: number): void {
    this.minObservations = min
    this.highConfidenceThreshold = high
    this.mediumConfidenceThreshold = medium
  }
}
