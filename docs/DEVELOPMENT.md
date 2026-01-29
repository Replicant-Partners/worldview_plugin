# Development Guide

This guide covers the architecture and extension points for the Worldview Plugin.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      ElizaOS Runtime                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Worldview Plugin                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ WorldviewGraph│  │PatternObserver│ │ Evolution Loop  │   │
│  │              │  │              │  │                 │   │
│  │ - Entities   │  │ - Detect     │  │ - Check         │   │
│  │ - Relations  │  │   patterns   │  │   periodically  │   │
│  │ - Query      │  │ - Generate   │  │ - Auto-apply    │   │
│  │ - Mermaid    │  │   suggestions│  │ - Queue         │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              runtime/worldviews/{agentId}.mermaid            │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. WorldviewGraph (`src/graph.ts`)

Manages the ontology graph structure and persistence.

**Key responsibilities:**
- CRUD operations for entities and relationships
- Mermaid serialization/deserialization
- Query interface
- File I/O

**Extension points:**

```typescript
// Add custom query methods
class WorldviewGraph {
  // Example: Path finding
  findPath(source: string, target: string): Relationship[] {
    // Implement graph traversal
  }
  
  // Example: Subgraph extraction
  getSubgraph(entityId: string, depth: number): WorldviewState {
    // Extract local neighborhood
  }
  
  // Example: Conflict detection
  detectConflicts(): Array<{ rel1: Relationship, rel2: Relationship, reason: string }> {
    // Find contradictory relationships
  }
}
```

### 2. PatternObserver (`src/observer.ts`)

Detects patterns in memories and generates suggestions.

**Key responsibilities:**
- Entity extraction from text
- Co-occurrence analysis
- Cardinality inference
- Confidence scoring

**Extension points:**

```typescript
class PatternObserver {
  // Add custom entity extractors
  private extractors: Array<(text: string) => string[]> = []
  
  registerExtractor(extractor: (text: string) => string[]) {
    this.extractors.push(extractor)
  }
  
  // Add custom pattern detectors
  detectCustomPatterns(memories: Memory[]): Suggestion[] {
    // Implement domain-specific pattern detection
  }
  
  // Add machine learning
  async predictCardinality(
    pair: EntityPair, 
    model: MLModel
  ): Promise<Cardinality> {
    // Use trained model for inference
  }
}
```

### 3. WorldviewPlugin (`src/index.ts`)

Orchestrates the plugin lifecycle and integration with ElizaOS.

**Key responsibilities:**
- Initialize graph and observer
- Manage evolution loop
- Register actions
- Handle configuration

**Extension points:**

```typescript
class WorldviewPlugin {
  // Add custom actions
  private registerCustomActions(runtime: IAgentRuntime) {
    runtime.registerAction({
      name: 'EXPLAIN_WORLDVIEW',
      handler: async () => {
        // Generate natural language explanation
      }
    })
  }
  
  // Add hooks
  private hooks: {
    onEntityAdded?: (entity: Entity) => void
    onRelationshipAdded?: (rel: Relationship) => void
    onSuggestionGenerated?: (sug: Suggestion) => void
  }
}
```

## Evolution Phases

The plugin is designed to evolve through distinct phases:

### Phase 1: Basic ER Graph (Current)
- Simple entity-relationship model
- Frequency-based pattern detection
- Mermaid serialization
- Basic CRUD operations

### Phase 2: Inference Rules
Add logical inference capabilities:

```typescript
interface InferenceRule {
  name: string
  pattern: {
    if: RelationshipPattern[]
    then: Relationship
  }
  confidence: number
}

// Example: Transitive closure
{
  name: "transitivity",
  pattern: {
    if: [
      { source: "A", rel: "part_of", target: "B" },
      { source: "B", rel: "part_of", target: "C" }
    ],
    then: { source: "A", rel: "part_of", target: "C" }
  },
  confidence: 0.8
}
```

### Phase 3: Conflict Resolution
Detect and resolve contradictions:

```typescript
interface ConflictResolution {
  detect(): Conflict[]
  resolve(conflict: Conflict): Resolution
  strategies: {
    mostRecent: boolean
    highestConfidence: boolean
    userPrompt: boolean
  }
}
```

### Phase 4: OWL/RDF Export
Export to formal ontology languages:

```typescript
class OntologyExporter {
  toOWL(graph: WorldviewGraph): string {
    // Convert to OWL format
  }
  
  toRDF(graph: WorldviewGraph): string {
    // Convert to RDF triples
  }
  
  toSparql(query: Query): string {
    // Generate SPARQL queries
  }
}
```

## Advanced Entity Extraction

Current implementation is basic. Here's how to add sophisticated NER:

```typescript
import { pipeline } from '@huggingface/transformers'

class AdvancedEntityExtractor {
  private ner: any
  
  async initialize() {
    this.ner = await pipeline('ner', 'dbmdz/bert-large-cased-finetuned-conll03-english')
  }
  
  async extract(text: string): Promise<Array<{
    entity: string
    type: string
    confidence: number
  }>> {
    const results = await this.ner(text)
    return results.map(r => ({
      entity: r.word,
      type: r.entity,
      confidence: r.score
    }))
  }
}
```

## Custom Cardinality Semantics

Extend the semantic rules for cardinality:

```typescript
const CUSTOM_SEMANTICS: Record<Cardinality, CustomSemantics> = {
  [Cardinality.OneToMany]: {
    ...CARDINALITY_SEMANTICS[Cardinality.OneToMany],
    reasoningRules: [
      // Parent attributes can be inherited by children
      (parent: Entity, child: Entity) => ({
        inherited: true,
        attributes: filterInheritableAttributes(parent.attributes)
      })
    ],
    queryOptimization: {
      // Always query from parent to children
      direction: 'forward',
      index: 'parent_id'
    }
  }
}
```

## Memory Integration

Integrate with different memory systems:

```typescript
interface MemoryAdapter {
  getMemories(config: QueryConfig): Promise<Memory[]>
  filterRelevant(memories: Memory[], entities: string[]): Memory[]
}

class GraphitiAdapter implements MemoryAdapter {
  async getMemories(config: QueryConfig): Promise<Memory[]> {
    // Query Graphiti temporal knowledge graph
  }
}

class VectorStoreAdapter implements MemoryAdapter {
  async getMemories(config: QueryConfig): Promise<Memory[]> {
    // Query vector database
  }
}
```

## Visualization Extensions

Beyond Mermaid, add other visualizations:

```typescript
class WorldviewVisualizer {
  toD3Force(graph: WorldviewGraph): D3ForceGraph {
    // Generate force-directed graph
  }
  
  toGraphviz(graph: WorldviewGraph): string {
    // Generate DOT format
  }
  
  toCytoscape(graph: WorldviewGraph): CytoscapeGraph {
    // Generate Cytoscape.js format
  }
  
  async toImage(graph: WorldviewGraph, format: 'png' | 'svg'): Promise<Buffer> {
    // Render to image
  }
}
```

## Testing Strategy

### Unit Tests
Test individual components:

```typescript
describe('WorldviewGraph', () => {
  it('should add entities', () => {
    const graph = new WorldviewGraph('/tmp/test.mermaid')
    graph.addEntity(testEntity)
    expect(graph.getEntity(testEntity.id)).toBeDefined()
  })
  
  it('should infer transitive relationships', () => {
    // Test inference rules
  })
})
```

### Integration Tests
Test plugin with runtime:

```typescript
describe('WorldviewPlugin', () => {
  it('should detect patterns from memories', async () => {
    const plugin = createWorldviewPlugin()
    const runtime = createTestRuntime()
    await plugin.initialize(runtime)
    
    // Add test memories
    await addTestMemories(runtime)
    
    // Wait for evolution
    await sleep(2000)
    
    // Verify patterns detected
    const suggestions = plugin.getSuggestions()
    expect(suggestions.length).toBeGreaterThan(0)
  })
})
```

### Property-Based Tests
Test with generated data:

```typescript
import fc from 'fast-check'

fc.assert(
  fc.property(
    fc.array(generateMemory()),
    (memories) => {
      const graph = new WorldviewGraph('/tmp/test.mermaid')
      const observer = new PatternObserver(graph)
      const suggestions = observer.analyze(memories)
      
      // All suggestions should have valid confidence
      return suggestions.every(s => s.confidence >= 0 && s.confidence <= 1)
    }
  )
)
```

## Performance Optimization

### Caching
Add caching layer:

```typescript
class CachedWorldviewGraph extends WorldviewGraph {
  private cache: LRUCache<string, any>
  
  query(pattern: QueryPattern): Entity[] {
    const key = JSON.stringify(pattern)
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    
    const result = super.query(pattern)
    this.cache.set(key, result)
    return result
  }
}
```

### Incremental Updates
Only process changed memories:

```typescript
class IncrementalObserver extends PatternObserver {
  private lastProcessed: Date
  
  analyze(memories: Memory[]): Suggestion[] {
    const newMemories = memories.filter(
      m => m.createdAt > this.lastProcessed
    )
    
    this.lastProcessed = new Date()
    return super.analyze(newMemories)
  }
}
```

### Batching
Batch updates to reduce I/O:

```typescript
class BatchedGraph extends WorldviewGraph {
  private pendingChanges: Change[] = []
  private batchSize = 10
  
  addEntity(entity: Entity) {
    super.addEntity(entity)
    this.pendingChanges.push({ type: 'entity', data: entity })
    
    if (this.pendingChanges.length >= this.batchSize) {
      this.flush()
    }
  }
  
  async flush() {
    await this.save()
    this.pendingChanges = []
  }
}
```

## Configuration Patterns

### Environment-Based Config
```typescript
const config: WorldviewConfig = {
  evolutionIntervalMs: parseInt(process.env.WORLDVIEW_INTERVAL || '60000'),
  autoApplyThreshold: parseFloat(process.env.WORLDVIEW_AUTO_THRESHOLD || '0.9'),
  minObservations: parseInt(process.env.WORLDVIEW_MIN_OBS || '3'),
}
```

### Agent-Specific Config
```typescript
const characterConfig = {
  worldview: {
    focus: ['technical', 'creative'],
    ignoredEntities: ['noise', 'spam'],
    customRules: [
      { pattern: /code|programming/, boost: 1.2 },
      { pattern: /design|art/, boost: 1.1 }
    ]
  }
}
```

## Debugging

Add debug utilities:

```typescript
class WorldviewDebugger {
  logEvolution(graph: WorldviewGraph) {
    console.log('=== Worldview State ===')
    console.log('Entities:', Array.from(graph.entities.keys()))
    console.log('Relationships:', graph.relationships.size)
    console.log('Mermaid:\n', graph.toMermaid())
  }
  
  exportSnapshot(graph: WorldviewGraph, path: string) {
    // Save complete state for inspection
  }
  
  diffSnapshots(before: string, after: string) {
    // Show what changed
  }
}
```

## Contributing

When adding features:

1. **Maintain simplicity** - The core should remain lightweight
2. **Extend, don't modify** - Use inheritance and composition
3. **Document patterns** - Update this guide with new patterns
4. **Add tests** - Every feature needs tests
5. **Keep Mermaid central** - The diagram should always be the source of truth

## Roadmap

Planned features:

- [ ] ML-based entity extraction (using transformers)
- [ ] Inference rule engine
- [ ] Conflict detection and resolution
- [ ] OWL/RDF export
- [ ] Graph visualization API
- [ ] Multi-agent worldview merging
- [ ] Temporal versioning (worldview history)
- [ ] Schema validation
- [ ] Performance benchmarks
- [ ] Cloud storage adapter
