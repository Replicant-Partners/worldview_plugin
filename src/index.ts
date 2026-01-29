import {
  Plugin,
  IAgentRuntime,
  Memory,
  State,
  elizaLogger
} from '@ai16z/eliza'
import { join } from 'path'
import { WorldviewGraph } from './graph'
import { PatternObserver } from './observer'
import { Suggestion } from './types'

export interface WorldviewConfig {
  evolutionIntervalMs?: number  // How often to check for patterns (default: 60000)
  autoApplyThreshold?: number   // Auto-apply suggestions above this confidence (default: 0.9)
  minObservations?: number      // Minimum co-occurrences for pattern (default: 3)
  memoryLookback?: number       // How many recent memories to analyze (default: 50)
}

export class WorldviewPlugin implements Plugin {
  name = 'worldview'
  description = 'Provides agents with an evolving ontological worldview'
  
  private graph: WorldviewGraph | null = null
  private observer: PatternObserver | null = null
  private suggestionQueue: Suggestion[] = []
  private config: Required<WorldviewConfig>
  private evolutionInterval: NodeJS.Timeout | null = null

  constructor(config: WorldviewConfig = {}) {
    this.config = {
      evolutionIntervalMs: config.evolutionIntervalMs || 60000,
      autoApplyThreshold: config.autoApplyThreshold || 0.9,
      minObservations: config.minObservations || 3,
      memoryLookback: config.memoryLookback || 50
    }
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    elizaLogger.info('[Worldview] Initializing worldview plugin')
    
    // Load or create worldview graph
    const worldviewPath = join(
      runtime.getSetting('WORLDVIEW_DIR') || 'runtime/worldviews',
      `${runtime.agentId}.mermaid`
    )
    
    this.graph = await WorldviewGraph.load(worldviewPath)
    this.observer = new PatternObserver(this.graph)
    
    const stats = this.graph.getStats()
    elizaLogger.info('[Worldview] Loaded worldview', {
      entities: stats.entities,
      relationships: stats.relationships,
      avgConnections: stats.avgConnections.toFixed(2)
    })

    // Start continuous evolution loop
    this.startEvolutionLoop(runtime)

    // Register actions for querying worldview
    this.registerActions(runtime)
  }

  private startEvolutionLoop(runtime: IAgentRuntime): void {
    elizaLogger.info('[Worldview] Starting evolution loop', {
      intervalMs: this.config.evolutionIntervalMs
    })

    this.evolutionInterval = setInterval(async () => {
      try {
        await this.evolve(runtime)
      } catch (error) {
        elizaLogger.error('[Worldview] Evolution error', error)
      }
    }, this.config.evolutionIntervalMs)
  }

  private async evolve(runtime: IAgentRuntime): Promise<void> {
    if (!this.graph || !this.observer) return

    // Get recent memories
    const memories = await runtime.messageManager.getMemories({
      roomId: runtime.agentId,
      count: this.config.memoryLookback
    })

    if (memories.length === 0) return

    // Detect patterns and generate suggestions
    const suggestions = this.observer.analyze(memories)

    if (suggestions.length === 0) return

    elizaLogger.debug('[Worldview] Generated suggestions', {
      count: suggestions.length,
      highConfidence: suggestions.filter(s => s.confidence >= this.config.autoApplyThreshold).length
    })

    let applied = 0
    let queued = 0

    // Auto-apply high confidence suggestions
    for (const suggestion of suggestions) {
      if (suggestion.confidence >= this.config.autoApplyThreshold) {
        this.graph.apply(suggestion)
        applied++
        elizaLogger.debug('[Worldview] Auto-applied suggestion', {
          type: suggestion.type,
          confidence: suggestion.confidence.toFixed(2),
          preview: suggestion.preview
        })
      } else if (suggestion.confidence >= 0.7) {
        this.suggestionQueue.push(suggestion)
        queued++
      }
    }

    // Persist changes if any were applied
    if (applied > 0) {
      await this.graph.save()
      const stats = this.graph.getStats()
      elizaLogger.info('[Worldview] Evolution complete', {
        applied,
        queued,
        entities: stats.entities,
        relationships: stats.relationships
      })
    }
  }

  private registerActions(runtime: IAgentRuntime): void {
    // Register custom actions for worldview queries
    // These can be expanded based on needs
    
    // Action to get worldview visualization
    runtime.registerAction({
      name: 'GET_WORLDVIEW',
      description: 'Get the current worldview as a Mermaid diagram',
      validate: async () => true,
      handler: async () => {
        if (!this.graph) return { success: false, error: 'Worldview not initialized' }
        return {
          success: true,
          diagram: this.graph.toMermaid(),
          stats: this.graph.getStats()
        }
      },
      examples: []
    })

    // Action to query worldview
    runtime.registerAction({
      name: 'QUERY_WORLDVIEW',
      description: 'Query entities in the worldview',
      validate: async () => true,
      handler: async (message: Memory, state?: State) => {
        if (!this.graph) return { success: false, error: 'Worldview not initialized' }
        
        // Extract entity type from message
        const text = message.content?.text || ''
        const entityMatch = text.match(/entity[:\s]+(\w+)/i)
        const entity = entityMatch ? entityMatch[1] : undefined

        if (entity) {
          const results = this.graph.query({ type: entity.toUpperCase() })
          return {
            success: true,
            entities: results,
            count: results.length
          }
        }

        return { success: false, error: 'No entity specified' }
      },
      examples: [[{
        user: 'user',
        content: { text: 'What entities do you know about?' }
      }]]
    })

    // Action to get pending suggestions
    runtime.registerAction({
      name: 'GET_SUGGESTIONS',
      description: 'Get pending worldview suggestions',
      validate: async () => true,
      handler: async () => {
        return {
          success: true,
          suggestions: this.suggestionQueue,
          count: this.suggestionQueue.length
        }
      },
      examples: []
    })
  }

  async cleanup(): Promise<void> {
    if (this.evolutionInterval) {
      clearInterval(this.evolutionInterval)
      this.evolutionInterval = null
    }

    if (this.graph) {
      await this.graph.save()
    }

    elizaLogger.info('[Worldview] Plugin cleaned up')
  }

  /**
   * Get the current worldview graph
   */
  getGraph(): WorldviewGraph | null {
    return this.graph
  }

  /**
   * Get pending suggestions
   */
  getSuggestions(): Suggestion[] {
    return [...this.suggestionQueue]
  }

  /**
   * Clear suggestion queue
   */
  clearSuggestions(): void {
    this.suggestionQueue = []
  }

  /**
   * Manually apply a suggestion
   */
  applySuggestion(suggestion: Suggestion): void {
    if (this.graph) {
      this.graph.apply(suggestion)
    }
  }
}

// Export factory function for easy plugin creation
export function createWorldviewPlugin(config?: WorldviewConfig): WorldviewPlugin {
  return new WorldviewPlugin(config)
}

// Export all types
export * from './types'
export * from './graph'
export * from './observer'
