import { AgentRuntime } from '@ai16z/eliza'
import { createWorldviewPlugin } from '../src/index'

/**
 * Example: Using a seeded worldview for a bio-manufacturing agent
 */
async function bioManufacturingAgent() {
  console.log('=== Bio-Manufacturing Agent with Seeded Worldview ===\n')

  // Create plugin with bio-manufacturing seed
  const worldview = createWorldviewPlugin({
    seedPath: './seeds/bio-manufacturing.json',
    evolutionIntervalMs: 60000,
    autoApplyThreshold: 0.9,
    minObservations: 3
  })

  const runtime = new AgentRuntime({
    agentId: 'bio-agent',
    plugins: [worldview],
  })

  await runtime.initialize()

  // Agent now has initial understanding of:
  // - USER, AGENT, MESSAGE, INTENT, GOAL
  // - ORGANISM, PROCESS, MATERIAL, EQUIPMENT, EXPERIMENT, MEASUREMENT
  
  const graph = worldview.getGraph()
  if (!graph) return

  console.log('Initial seeded worldview:')
  console.log(graph.toMermaid())
  console.log('\nStats:', graph.getStats())

  // Simulate some interactions that build on the seed
  console.log('\n=== As agent interacts, worldview evolves ===')
  console.log('Agent learns:')
  console.log('- PROTOCOL (new entity discovered from conversations about procedures)')
  console.log('- ORGANISM }o--o{ EQUIPMENT (organisms require specific equipment)')
  console.log('- PROCESS ||--o{ MEASUREMENT (processes generate measurements)')
  
  // After some time, check evolved worldview
  setTimeout(() => {
    console.log('\nEvolved worldview now includes both:')
    console.log('✓ Seeded domain knowledge')
    console.log('✓ Learned patterns from interactions')
  }, 5000)
}

/**
 * Example: Game design agent with seeded narrative structure
 */
async function gameDesignAgent() {
  console.log('=== Game Design Agent with Seeded Worldview ===\n')

  const worldview = createWorldviewPlugin({
    seedPath: './seeds/game-design.json',
    evolutionIntervalMs: 30000  // More frequent for rapid prototyping
  })

  const runtime = new AgentRuntime({
    agentId: 'game-agent',
    plugins: [worldview],
  })

  await runtime.initialize()

  const graph = worldview.getGraph()
  if (!graph) return

  console.log('Game design worldview includes:')
  const entities = graph.query({})
  console.log('Entities:', entities.map(e => e.id).join(', '))
  
  console.log('\nKey relationships:')
  const narrativeRels = graph.getRelationships('NARRATIVE')
  narrativeRels.forEach(rel => {
    console.log(`- ${rel.source} ${rel.cardinality} ${rel.target} : ${rel.type}`)
  })
}

/**
 * Example: Comparing seeded vs unseeded agents
 */
async function compareSeededVsUnseeded() {
  console.log('=== Seeded vs Unseeded Agent Comparison ===\n')

  // Agent without seed
  const unseeded = createWorldviewPlugin({
    evolutionIntervalMs: 60000
  })

  const unseededRuntime = new AgentRuntime({
    agentId: 'unseeded-agent',
    plugins: [unseeded],
  })

  await unseededRuntime.initialize()

  // Agent with seed
  const seeded = createWorldviewPlugin({
    seedPath: './seeds/general-conversation.json',
    evolutionIntervalMs: 60000
  })

  const seededRuntime = new AgentRuntime({
    agentId: 'seeded-agent',
    plugins: [seeded],
  })

  await seededRuntime.initialize()

  // Compare
  const unseededGraph = unseeded.getGraph()
  const seededGraph = seeded.getGraph()

  console.log('Unseeded agent:', unseededGraph?.getStats())
  console.log('Seeded agent:', seededGraph?.getStats())
  
  console.log('\nSeeded agent starts with domain knowledge!')
  console.log('Unseeded agent must discover everything from scratch.')
}

/**
 * Example: Custom seed for specific use case
 */
async function customSeedExample() {
  console.log('=== Custom Seed Example ===\n')

  // Create custom seed programmatically
  const customSeed = {
    entities: [
      { id: "CUSTOMER", type: "CUSTOMER" },
      { id: "PRODUCT", type: "PRODUCT" },
      { id: "INQUIRY", type: "INQUIRY" },
      { id: "RECOMMENDATION", type: "RECOMMENDATION" }
    ],
    relationships: [
      {
        source: "CUSTOMER",
        target: "INQUIRY",
        type: "asks",
        cardinality: "||--o{",
        confidence: 1.0
      },
      {
        source: "INQUIRY",
        target: "PRODUCT",
        type: "concerns",
        cardinality: "}o--||",
        confidence: 1.0
      },
      {
        source: "PRODUCT",
        target: "RECOMMENDATION",
        type: "supports",
        cardinality: "||--o{",
        confidence: 1.0
      }
    ]
  }

  // Save to file
  const fs = require('fs')
  fs.writeFileSync('./seeds/custom-ecommerce.json', JSON.stringify(customSeed, null, 2))

  // Use it
  const worldview = createWorldviewPlugin({
    seedPath: './seeds/custom-ecommerce.json'
  })

  console.log('Created and loaded custom e-commerce seed!')
}

/**
 * Example: Inspecting a seeded worldview
 */
async function inspectSeededWorldview() {
  console.log('=== Inspecting Seeded Worldview ===\n')

  const worldview = createWorldviewPlugin({
    seedPath: './seeds/bio-manufacturing.json'
  })

  const runtime = new AgentRuntime({
    agentId: 'inspect-agent',
    plugins: [worldview],
  })

  await runtime.initialize()

  const graph = worldview.getGraph()
  if (!graph) return

  // Get all seeded entities
  console.log('Seeded Entities:')
  const entities = graph.query({})
  entities.forEach(e => {
    console.log(`- ${e.id}: ${e.attributes.description || 'no description'}`)
  })

  console.log('\nSeeded Relationships:')
  const relationships = Array.from((graph as any).relationships.values())
  relationships.forEach(rel => {
    console.log(`- ${rel.source} ${rel.type} ${rel.target} [${rel.cardinality}]`)
    
    // Check if it was seeded (vs learned)
    if (rel.metadata?.seeded) {
      console.log('  ↳ (from seed)')
    }
  })

  // Show the mermaid representation
  console.log('\nMermaid Diagram:')
  console.log(graph.toMermaid())
}

/**
 * Example: Multi-agent system with shared seed
 */
async function multiAgentSharedSeed() {
  console.log('=== Multi-Agent System with Shared Seed ===\n')

  const sharedSeed = './seeds/general-conversation.json'

  // Create multiple agents with same seed
  const agents = []
  
  for (let i = 1; i <= 3; i++) {
    const worldview = createWorldviewPlugin({
      seedPath: sharedSeed,
      evolutionIntervalMs: 60000
    })

    const runtime = new AgentRuntime({
      agentId: `agent-${i}`,
      plugins: [worldview],
    })

    await runtime.initialize()
    agents.push({ id: `agent-${i}`, worldview })

    console.log(`Agent ${i} initialized with shared worldview`)
  }

  console.log('\nAll agents start with same vocabulary!')
  console.log('They will specialize based on their unique interactions.')

  // Each agent's worldview will evolve differently based on their conversations
  // But they all started with shared understanding
}

// Run examples
if (require.main === module) {
  const args = process.argv.slice(2)
  const example = args[0] || 'bio'

  switch (example) {
    case 'bio':
      bioManufacturingAgent()
      break
    case 'game':
      gameDesignAgent()
      break
    case 'compare':
      compareSeededVsUnseeded()
      break
    case 'custom':
      customSeedExample()
      break
    case 'inspect':
      inspectSeededWorldview()
      break
    case 'multi':
      multiAgentSharedSeed()
      break
    default:
      console.log('Available examples: bio, game, compare, custom, inspect, multi')
  }
}

export {
  bioManufacturingAgent,
  gameDesignAgent,
  compareSeededVsUnseeded,
  customSeedExample,
  inspectSeededWorldview,
  multiAgentSharedSeed
}
