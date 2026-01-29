import { AgentRuntime } from '@ai16z/eliza'
import { createWorldviewPlugin } from '../src/index'

/**
 * Example: Basic worldview plugin integration
 */
async function basicExample() {
  console.log('=== Basic Worldview Plugin Example ===\n')

  // Create plugin with default config
  const worldview = createWorldviewPlugin()

  // Create agent runtime
  const runtime = new AgentRuntime({
    agentId: 'example-agent',
    plugins: [worldview],
    // ... other config
  })

  await runtime.initialize()

  // Plugin is now active and will:
  // - Analyze recent memories every 60 seconds
  // - Auto-apply high-confidence patterns
  // - Queue medium-confidence patterns for review

  console.log('Plugin initialized and evolution loop started')
}

/**
 * Example: Custom configuration
 */
async function customConfigExample() {
  console.log('=== Custom Configuration Example ===\n')

  const worldview = createWorldviewPlugin({
    evolutionIntervalMs: 30000,  // Check every 30 seconds (more frequent)
    autoApplyThreshold: 0.95,     // Only auto-apply very high confidence
    minObservations: 5,           // Require more observations for patterns
    memoryLookback: 100           // Analyze more memories
  })

  const runtime = new AgentRuntime({
    agentId: 'custom-agent',
    plugins: [worldview],
  })

  await runtime.initialize()

  console.log('Custom plugin configured')
}

/**
 * Example: Querying the worldview
 */
async function queryExample() {
  console.log('=== Worldview Query Example ===\n')

  const worldview = createWorldviewPlugin()
  const runtime = new AgentRuntime({
    agentId: 'query-agent',
    plugins: [worldview],
  })

  await runtime.initialize()

  // Wait for some patterns to develop
  await new Promise(resolve => setTimeout(resolve, 120000)) // 2 minutes

  // Get the graph
  const graph = worldview.getGraph()
  if (!graph) return

  // Get statistics
  const stats = graph.getStats()
  console.log('Worldview Stats:', stats)

  // Query entities
  const users = graph.query({ type: 'USER' })
  console.log('Users:', users)

  // Get entity relationships
  if (users.length > 0) {
    const userRels = graph.getRelationships(users[0].id)
    console.log('User relationships:', userRels)
  }

  // Get worldview as Mermaid
  const diagram = graph.toMermaid()
  console.log('Worldview Diagram:\n', diagram)
}

/**
 * Example: Manual ontology manipulation
 */
async function manualOntologyExample() {
  console.log('=== Manual Ontology Example ===\n')

  const worldview = createWorldviewPlugin()
  const runtime = new AgentRuntime({
    agentId: 'manual-agent',
    plugins: [worldview],
  })

  await runtime.initialize()

  const graph = worldview.getGraph()
  if (!graph) return

  // Manually add entities and relationships
  graph.addEntity({
    id: 'PROJECT',
    type: 'PROJECT',
    attributes: { domain: 'biotech' },
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 1
  })

  graph.addEntity({
    id: 'TASK',
    type: 'TASK',
    attributes: { status: 'pending' },
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 1
  })

  graph.addRelationship({
    id: 'PROJECT_contains_TASK',
    type: 'contains',
    source: 'PROJECT',
    target: 'TASK',
    cardinality: '||--o{', // OneToMany
    confidence: 1.0,
    observations: 1,
    metadata: { manual: true }
  })

  // Save the updated graph
  await graph.save()

  console.log('Manual entities and relationships added')
  console.log('Updated worldview:\n', graph.toMermaid())
}

/**
 * Example: Working with suggestions
 */
async function suggestionsExample() {
  console.log('=== Suggestions Example ===\n')

  const worldview = createWorldviewPlugin({
    autoApplyThreshold: 0.95, // Very high threshold
  })

  const runtime = new AgentRuntime({
    agentId: 'suggestions-agent',
    plugins: [worldview],
  })

  await runtime.initialize()

  // Wait for patterns to be detected
  await new Promise(resolve => setTimeout(resolve, 120000))

  // Get pending suggestions
  const suggestions = worldview.getSuggestions()
  console.log(`Found ${suggestions.length} pending suggestions:`)

  for (const suggestion of suggestions) {
    console.log('\nSuggestion:', {
      type: suggestion.type,
      confidence: suggestion.confidence,
      reasoning: suggestion.reasoning,
      preview: suggestion.preview
    })

    // Optionally apply manually
    if (suggestion.confidence > 0.8) {
      worldview.applySuggestion(suggestion)
      console.log('→ Applied')
    }
  }

  // Clear processed suggestions
  worldview.clearSuggestions()
}

/**
 * Example: Using registered actions
 */
async function actionsExample() {
  console.log('=== Actions Example ===\n')

  const worldview = createWorldviewPlugin()
  const runtime = new AgentRuntime({
    agentId: 'actions-agent',
    plugins: [worldview],
  })

  await runtime.initialize()

  // Use GET_WORLDVIEW action
  const worldviewResult = await runtime.executeAction('GET_WORLDVIEW', {})
  if (worldviewResult.success) {
    console.log('Current Worldview Diagram:')
    console.log(worldviewResult.diagram)
    console.log('Stats:', worldviewResult.stats)
  }

  // Use QUERY_WORLDVIEW action
  const queryResult = await runtime.executeAction('QUERY_WORLDVIEW', {
    content: { text: 'entity: USER' }
  })
  if (queryResult.success) {
    console.log(`Found ${queryResult.count} USER entities`)
  }

  // Use GET_SUGGESTIONS action
  const suggestionsResult = await runtime.executeAction('GET_SUGGESTIONS', {})
  if (suggestionsResult.success) {
    console.log(`Pending suggestions: ${suggestionsResult.count}`)
  }
}

/**
 * Example: Monitoring evolution
 */
async function evolutionMonitoringExample() {
  console.log('=== Evolution Monitoring Example ===\n')

  const worldview = createWorldviewPlugin({
    evolutionIntervalMs: 10000, // Every 10 seconds for demo
  })

  const runtime = new AgentRuntime({
    agentId: 'monitor-agent',
    plugins: [worldview],
  })

  await runtime.initialize()

  // Monitor evolution over time
  const checkInterval = setInterval(() => {
    const graph = worldview.getGraph()
    if (!graph) return

    const stats = graph.getStats()
    console.log('\nCurrent state:', {
      timestamp: new Date().toISOString(),
      entities: stats.entities,
      relationships: stats.relationships,
      avgConnections: stats.avgConnections.toFixed(2)
    })

    const suggestions = worldview.getSuggestions()
    if (suggestions.length > 0) {
      console.log(`→ ${suggestions.length} pending suggestions`)
    }
  }, 15000) // Check every 15 seconds

  // Run for 5 minutes then cleanup
  setTimeout(() => {
    clearInterval(checkInterval)
    console.log('\nMonitoring complete')
  }, 300000)
}

// Run examples
if (require.main === module) {
  const args = process.argv.slice(2)
  const example = args[0] || 'basic'

  switch (example) {
    case 'basic':
      basicExample()
      break
    case 'custom':
      customConfigExample()
      break
    case 'query':
      queryExample()
      break
    case 'manual':
      manualOntologyExample()
      break
    case 'suggestions':
      suggestionsExample()
      break
    case 'actions':
      actionsExample()
      break
    case 'monitor':
      evolutionMonitoringExample()
      break
    default:
      console.log('Available examples: basic, custom, query, manual, suggestions, actions, monitor')
  }
}

export {
  basicExample,
  customConfigExample,
  queryExample,
  manualOntologyExample,
  suggestionsExample,
  actionsExample,
  evolutionMonitoringExample
}
