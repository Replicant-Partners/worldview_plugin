# ElizaOS Worldview Plugin

An ElizaOS plugin that provides agents with evolving ontological worldviews. Agents continuously learn and refine their understanding of entities and relationships through interaction, creating a semantic scaffolding for interpretation.

## Features

- **Continuous Evolution**: Automatically detects patterns in conversations and evolves the ontology
- **Mermaid ER Diagrams**: Human-readable, git-diffable ontology storage
- **Semantic Cardinality**: Relationship cardinality carries semantic meaning for reasoning
- **Auto-Learning**: High-confidence patterns are automatically integrated
- **Suggestion Queue**: Medium-confidence patterns queued for review
- **Lightweight**: Minimal overhead, runs in background

## Installation

```bash
npm install @eliza/plugin-worldview
```

## Quick Start

```typescript
import { createWorldviewPlugin } from '@eliza/plugin-worldview'
import { AgentRuntime } from '@ai16z/eliza'

// Create plugin with optional config
const worldviewPlugin = createWorldviewPlugin({
  evolutionIntervalMs: 60000,    // Check for patterns every minute
  autoApplyThreshold: 0.9,        // Auto-apply suggestions with >90% confidence
  minObservations: 3,             // Require 3+ co-occurrences for patterns
  memoryLookback: 50              // Analyze last 50 memories
})

// Add to agent
const runtime = new AgentRuntime({
  plugins: [worldviewPlugin],
  // ... other config
})

await runtime.initialize()
```

## How It Works

### 1. Pattern Detection
The plugin continuously analyzes recent memories to detect:
- Entity co-occurrences
- Relationship patterns
- Cardinality inference from frequency

### 2. Suggestion Generation
Patterns generate suggestions with confidence scores:
- **>0.9**: Auto-applied to ontology
- **0.7-0.9**: Queued for review
- **<0.7**: Ignored

### 3. Ontology Evolution
The worldview evolves as:
```
Interactions → Memories → Pattern Detection → Suggestions → Ontology Updates
```

## Ontology Structure

### Entities
```typescript
{
  id: string              // Unique identifier
  type: string            // Entity type
  attributes: {}          // Custom attributes
  firstSeen: Date         // When first observed
  lastSeen: Date          // Most recent observation
  observationCount: number // Total observations
}
```

### Relationships
```typescript
{
  id: string              // Unique identifier
  type: string            // Relationship type
  source: string          // Source entity ID
  target: string          // Target entity ID
  cardinality: Cardinality // Semantic cardinality
  confidence: number      // Confidence score (0-1)
  observations: number    // Times observed
  metadata: {}            // Custom metadata
}
```

## Cardinality Semantics

Cardinality carries semantic meaning for reasoning:

| Cardinality | Symbol | Meaning | Example |
|-------------|--------|---------|---------|
| OneToOne | `\|\|--\|\|` | Equivalence, identity | USER \|\|--\|\| PROFILE |
| OneToMany | `\|\|--o{` | Composition, ownership | USER \|\|--o{ MESSAGE |
| ManyToOne | `}o--\|\|` | Attribution, categorization | MESSAGE }o--\|\| TOPIC |
| ManyToMany | `}o--o{` | Association | MESSAGE }o--o{ TAG |

### Semantic Implications

```typescript
// OneToMany implies ownership
USER ||--o{ GOAL
→ "Users have multiple goals, goals belong to users"
→ If user context ends, their goals become less relevant

// ManyToMany implies association
MESSAGE }o--o{ TOPIC  
→ "Messages can cover many topics, topics appear in many messages"
→ No ownership, pure association

// OneToOne implies equivalence
ACTION ||--|| INTENT
→ "Each action expresses exactly one intent"
→ Strong semantic binding
```

## Mermaid Storage Format

Worldviews are stored as Mermaid ER diagrams in `runtime/worldviews/{agentId}.mermaid`:

```mermaid
erDiagram
    USER ||--o{ MESSAGE : creates
    MESSAGE ||--|| INTENT : expresses
    INTENT }o--|| GOAL : serves
    MESSAGE }o--o{ TOPIC : discusses
    
    USER {
        string name
        string context
    }
    MESSAGE {
        string content
        string sentiment
    }
```

## API Reference

### Plugin Methods

```typescript
// Get current worldview graph
const graph = plugin.getGraph()

// Get pending suggestions
const suggestions = plugin.getSuggestions()

// Clear suggestion queue
plugin.clearSuggestions()

// Manually apply suggestion
plugin.applySuggestion(suggestion)
```

### Graph Methods

```typescript
// Query entities
const users = graph.query({ type: 'USER' })

// Get entity
const entity = graph.getEntity('USER')

// Get relationships
const rels = graph.getRelationships('USER')

// Check relationship exists
const exists = graph.hasRelationship('USER', 'MESSAGE', 'creates')

// Get statistics
const stats = graph.getStats()
// { entities: 5, relationships: 8, avgConnections: 1.6 }

// Render as Mermaid
const diagram = graph.toMermaid()
```

## Registered Actions

The plugin registers these actions with the runtime:

### GET_WORLDVIEW
Get the current worldview as a Mermaid diagram:

```typescript
const result = await runtime.executeAction('GET_WORLDVIEW', {})
// Returns: { success: true, diagram: string, stats: {} }
```

### QUERY_WORLDVIEW
Query entities in the worldview:

```typescript
const result = await runtime.executeAction('QUERY_WORLDVIEW', {
  content: { text: 'entity: USER' }
})
// Returns: { success: true, entities: [...], count: number }
```

### GET_SUGGESTIONS
Get pending suggestions:

```typescript
const result = await runtime.executeAction('GET_SUGGESTIONS', {})
// Returns: { success: true, suggestions: [...], count: number }
```

## Configuration

```typescript
interface WorldviewConfig {
  // How often to check for patterns (default: 60000ms)
  evolutionIntervalMs?: number
  
  // Auto-apply suggestions above this confidence (default: 0.9)
  autoApplyThreshold?: number
  
  // Minimum co-occurrences for pattern detection (default: 3)
  minObservations?: number
  
  // How many recent memories to analyze (default: 50)
  memoryLookback?: number
}
```

## Advanced Usage

### Custom Pattern Detection

```typescript
import { PatternObserver } from '@eliza/plugin-worldview'

const observer = new PatternObserver(graph)

// Adjust thresholds
observer.setThresholds(
  5,    // minObservations
  0.95, // highConfidenceThreshold
  0.8   // mediumConfidenceThreshold
)

// Analyze specific memories
const suggestions = observer.analyze(memories)
```

### Manual Ontology Management

```typescript
const graph = plugin.getGraph()

// Add entity
graph.addEntity({
  id: 'WORKFLOW',
  type: 'WORKFLOW',
  attributes: { priority: 'high' },
  firstSeen: new Date(),
  lastSeen: new Date(),
  observationCount: 1
})

// Add relationship
graph.addRelationship({
  id: 'USER_owns_WORKFLOW',
  type: 'owns',
  source: 'USER',
  target: 'WORKFLOW',
  cardinality: Cardinality.OneToMany,
  confidence: 1.0,
  observations: 1,
  metadata: { manual: true }
})

// Save changes
await graph.save()
```

### Visualizing Evolution

Since worldviews are stored as Mermaid files, you can:

1. **View in any Mermaid renderer**
2. **Track changes with git**
3. **Generate diagrams in CI/CD**
4. **Render in documentation**

```bash
# View worldview
cat runtime/worldviews/agent-123.mermaid

# Track evolution
git log runtime/worldviews/agent-123.mermaid

# Generate diagram
mmdc -i runtime/worldviews/agent-123.mermaid -o worldview.png
```

## Future Extensions

The lightweight ER foundation can evolve into more formal ontologies:

1. **Phase 1** (Current): Basic ER graph with CRUD operations
2. **Phase 2**: Inference rules (transitive relationships)
3. **Phase 3**: Conflict detection and resolution
4. **Phase 4**: Export to OWL/RDF for formal reasoning

## Environment Variables

```bash
# Directory for worldview storage (default: runtime/worldviews)
WORLDVIEW_DIR=./my-worldviews
```

## Examples

### Startup Log
```
[Worldview] Initializing worldview plugin
[Worldview] Loaded worldview { entities: 12, relationships: 18, avgConnections: 1.50 }
[Worldview] Starting evolution loop { intervalMs: 60000 }
```

### Evolution Log
```
[Worldview] Generated suggestions { count: 3, highConfidence: 1 }
[Worldview] Auto-applied suggestion { 
  type: 'new_relationship',
  confidence: 0.92,
  preview: 'USER ||--o{ PREFERENCE : has'
}
[Worldview] Evolution complete { applied: 1, queued: 2, entities: 13, relationships: 19 }
```

## Contributing

Contributions welcome! This is a foundational implementation designed to evolve with the community.

## License

MIT
