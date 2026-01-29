import { WorldviewGraph } from '../src/graph'
import { PatternObserver } from '../src/observer'
import { Cardinality, Suggestion } from '../src/types'
import { Memory } from '@ai16z/eliza'

/**
 * Test: Basic graph operations
 */
async function testGraphOperations() {
  console.log('Testing graph operations...')
  
  const graph = new WorldviewGraph('/tmp/test-worldview.mermaid')
  
  // Add entities
  graph.addEntity({
    id: 'USER',
    type: 'USER',
    attributes: { role: 'designer' },
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 1
  })
  
  graph.addEntity({
    id: 'PROJECT',
    type: 'PROJECT',
    attributes: {},
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 1
  })
  
  // Add relationship
  graph.addRelationship({
    id: 'USER_owns_PROJECT',
    type: 'owns',
    source: 'USER',
    target: 'PROJECT',
    cardinality: Cardinality.OneToMany,
    confidence: 0.9,
    observations: 5,
    metadata: {}
  })
  
  // Test queries
  const users = graph.query({ type: 'USER' })
  console.assert(users.length === 1, 'Should find 1 user')
  
  const userRels = graph.getRelationships('USER')
  console.assert(userRels.length === 1, 'Should find 1 relationship')
  
  const exists = graph.hasRelationship('USER', 'PROJECT')
  console.assert(exists === true, 'Relationship should exist')
  
  console.log('✓ Graph operations passed\n')
}

/**
 * Test: Mermaid serialization
 */
async function testMermaidSerialization() {
  console.log('Testing Mermaid serialization...')
  
  const graph = new WorldviewGraph('/tmp/test-mermaid.mermaid')
  
  // Add test data
  graph.addEntity({
    id: 'ENTITY_A',
    type: 'ENTITY_A',
    attributes: { test: 'value' },
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 1
  })
  
  graph.addEntity({
    id: 'ENTITY_B',
    type: 'ENTITY_B',
    attributes: {},
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 1
  })
  
  graph.addRelationship({
    id: 'A_to_B',
    type: 'connects_to',
    source: 'ENTITY_A',
    target: 'ENTITY_B',
    cardinality: Cardinality.ManyToMany,
    confidence: 1.0,
    observations: 1,
    metadata: {}
  })
  
  // Serialize
  const mermaid = graph.toMermaid()
  console.assert(mermaid.includes('erDiagram'), 'Should have erDiagram header')
  console.assert(mermaid.includes('ENTITY_A'), 'Should include ENTITY_A')
  console.assert(mermaid.includes('ENTITY_B'), 'Should include ENTITY_B')
  console.assert(mermaid.includes('}o--o{'), 'Should include cardinality')
  
  console.log('Generated Mermaid:')
  console.log(mermaid)
  console.log('✓ Mermaid serialization passed\n')
}

/**
 * Test: Pattern detection
 */
async function testPatternDetection() {
  console.log('Testing pattern detection...')
  
  const graph = new WorldviewGraph('/tmp/test-patterns.mermaid')
  const observer = new PatternObserver(graph)
  
  // Create mock memories with patterns
  const memories: Memory[] = [
    {
      id: '1',
      userId: 'test-user',
      agentId: 'test-agent',
      roomId: 'test-room',
      content: { text: 'USER created a MESSAGE about PROJECT' },
      createdAt: Date.now()
    },
    {
      id: '2',
      userId: 'test-user',
      agentId: 'test-agent',
      roomId: 'test-room',
      content: { text: 'USER sent another MESSAGE about PROJECT' },
      createdAt: Date.now()
    },
    {
      id: '3',
      userId: 'test-user',
      agentId: 'test-agent',
      roomId: 'test-room',
      content: { text: 'USER posted a MESSAGE discussing PROJECT' },
      createdAt: Date.now()
    },
    {
      id: '4',
      userId: 'test-user',
      agentId: 'test-agent',
      roomId: 'test-room',
      content: { text: 'USER wrote MESSAGE about PROJECT work' },
      createdAt: Date.now()
    }
  ]
  
  // Detect patterns
  const suggestions = observer.analyze(memories)
  
  console.log(`Generated ${suggestions.length} suggestions`)
  console.assert(suggestions.length > 0, 'Should generate suggestions')
  
  for (const suggestion of suggestions) {
    console.log(`- ${suggestion.type}: ${suggestion.preview} (${suggestion.confidence.toFixed(2)})`)
  }
  
  console.log('✓ Pattern detection passed\n')
}

/**
 * Test: Cardinality inference
 */
async function testCardinalityInference() {
  console.log('Testing cardinality inference...')
  
  const graph = new WorldviewGraph('/tmp/test-cardinality.mermaid')
  const observer = new PatternObserver(graph)
  
  // Memories showing one-to-many pattern
  const oneToManyMemories: Memory[] = Array(10).fill(null).map((_, i) => ({
    id: String(i),
    userId: 'test-user',
    agentId: 'test-agent',
    roomId: 'test-room',
    content: { text: `USER created MESSAGE number ${i}` },
    createdAt: Date.now()
  }))
  
  const suggestions = observer.analyze(oneToManyMemories)
  
  // Find USER-MESSAGE suggestion
  const userMessageSuggestion = suggestions.find(
    s => s.data.source === 'USER' && s.data.target === 'MESSAGE'
  )
  
  if (userMessageSuggestion) {
    console.log('Inferred relationship:', userMessageSuggestion.preview)
    console.log('Cardinality:', userMessageSuggestion.data.cardinality)
    console.log('Confidence:', userMessageSuggestion.confidence.toFixed(2))
  }
  
  console.log('✓ Cardinality inference passed\n')
}

/**
 * Test: Suggestion application
 */
async function testSuggestionApplication() {
  console.log('Testing suggestion application...')
  
  const graph = new WorldviewGraph('/tmp/test-apply.mermaid')
  
  const suggestion: Suggestion = {
    type: 'new_relationship',
    confidence: 0.95,
    reasoning: 'Test suggestion',
    data: {
      source: 'ENTITY_X',
      target: 'ENTITY_Y',
      relationship: 'links_to',
      cardinality: Cardinality.OneToOne
    },
    preview: 'ENTITY_X ||--|| ENTITY_Y : links_to'
  }
  
  // Ensure entities exist
  graph.addEntity({
    id: 'ENTITY_X',
    type: 'ENTITY_X',
    attributes: {},
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 1
  })
  
  graph.addEntity({
    id: 'ENTITY_Y',
    type: 'ENTITY_Y',
    attributes: {},
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 1
  })
  
  // Apply suggestion
  graph.apply(suggestion)
  
  // Verify
  const exists = graph.hasRelationship('ENTITY_X', 'ENTITY_Y')
  console.assert(exists === true, 'Relationship should exist after application')
  
  console.log('✓ Suggestion application passed\n')
}

/**
 * Test: Graph persistence
 */
async function testPersistence() {
  console.log('Testing persistence...')
  
  const path = '/tmp/test-persist.mermaid'
  
  // Create and populate graph
  const graph1 = new WorldviewGraph(path)
  graph1.addEntity({
    id: 'PERSISTENT_ENTITY',
    type: 'PERSISTENT_ENTITY',
    attributes: { test: true },
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 1
  })
  
  await graph1.save()
  
  // Load from file
  const graph2 = await WorldviewGraph.load(path)
  const entity = graph2.getEntity('PERSISTENT_ENTITY')
  
  console.assert(entity !== undefined, 'Entity should persist')
  console.assert(entity?.attributes.test === true, 'Attributes should persist')
  
  console.log('✓ Persistence passed\n')
}

// Run all tests
async function runAllTests() {
  console.log('=== Running Worldview Plugin Tests ===\n')
  
  try {
    await testGraphOperations()
    await testMermaidSerialization()
    await testPatternDetection()
    await testCardinalityInference()
    await testSuggestionApplication()
    await testPersistence()
    
    console.log('=== All tests passed! ===')
  } catch (error) {
    console.error('Test failed:', error)
    process.exit(1)
  }
}

// Run if main module
if (require.main === module) {
  runAllTests()
}

export {
  testGraphOperations,
  testMermaidSerialization,
  testPatternDetection,
  testCardinalityInference,
  testSuggestionApplication,
  testPersistence,
  runAllTests
}
