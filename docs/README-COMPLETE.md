# Worldview Plugin - Complete Package

## What You Have

A production-ready ElizaOS plugin (24 files, ~2,500 lines) with worldview seeding capability.

## Quick Start with Seeding

```typescript
import { createWorldviewPlugin } from '@eliza/plugin-worldview'

const worldview = createWorldviewPlugin({
  seedPath: './seeds/bio-manufacturing.json',  // Give agent domain knowledge
  evolutionIntervalMs: 60000,
  autoApplyThreshold: 0.9
})
```

## File Structure

```
worldview-plugin/
├── src/                           # Core implementation
│   ├── index.ts                   # Main plugin (380 lines)
│   ├── types.ts                   # Type definitions (120 lines)
│   ├── graph.ts                   # Graph management (330 lines) ✨ UPDATED
│   └── observer.ts                # Pattern detection (250 lines)
│
├── seeds/                         # ✨ NEW - Pre-built domain ontologies
│   ├── general-conversation.json  # Basic conversational (8 entities)
│   ├── bio-manufacturing.json     # Scientific domain (16 entities)
│   ├── project-management.mermaid # Task tracking (7 entities)
│   └── game-design.json          # Interactive experiences (11 entities)
│
├── examples/
│   ├── usage.ts                   # Usage examples
│   ├── test.ts                    # Test suite
│   ├── seeded-agents.ts          # ✨ NEW - Seeding examples (280 lines)
│   └── evolved-worldview.mermaid  # Example ontology
│
├── docs/
│   ├── README.md                  # Complete documentation ✨ UPDATED
│   ├── QUICKSTART.md              # 3-step setup ✨ UPDATED
│   ├── DEVELOPMENT.md             # Extension guide
│   ├── SEEDING.md                 # ✨ NEW - Complete seeding guide (650 lines)
│   ├── SEEDING-SUMMARY.md         # ✨ NEW - What changed for seeding
│   ├── SEEDING-QUICK-REF.md       # ✨ NEW - Quick reference card
│   ├── SEEDING-FLOW.mermaid       # ✨ NEW - Visual flow diagram
│   ├── ARCHITECTURE.mermaid       # System architecture
│   └── CHANGELOG.md               # Version history ✨ UPDATED
│
├── package.json
├── tsconfig.json
└── .gitignore
```

## What's New: Seeding Capability

### Core Changes
- `graph.ts`: Added `fromJSON()` method and `seedPath` parameter to `load()`
- `index.ts`: Added `seedPath` to plugin configuration
- Seeds loaded on first initialization, existing worldviews take precedence

### New Documentation
- `SEEDING.md` - 650 line comprehensive guide
- `SEEDING-SUMMARY.md` - Change overview
- `SEEDING-QUICK-REF.md` - Quick reference card
- `SEEDING-FLOW.mermaid` - Visual flow diagram

### Example Seeds (4 domains)
1. **General Conversation** - Basic assistant (USER, MESSAGE, INTENT, TASK)
2. **Bio-Manufacturing** - Scientific domain (ORGANISM, PROCESS, MATERIAL, EXPERIMENT)
3. **Project Management** - Task tracking (PROJECT, TASK, MILESTONE, GOAL)
4. **Game Design** - Interactive experiences (PLAYER, NARRATIVE, CHOICE, EMOTION)

### Usage Examples
- `seeded-agents.ts` - 6 complete examples showing different seeding patterns

## Installation & Setup

### 1. Download
Download the complete plugin from the file links above.

### 2. Install in Your Project

For standard ElizaOS monorepo:
```bash
# Unzip to packages/
cd your-project/packages/
# Place worldview-plugin here
mv worldview-plugin plugin-worldview

cd plugin-worldview
npm install
npm run build
```

### 3. Use in Your Agent

```typescript
import { createWorldviewPlugin } from '@eliza/plugin-worldview'

const worldview = createWorldviewPlugin({
  seedPath: './seeds/bio-manufacturing.json',  // Your domain
  evolutionIntervalMs: 60000,
  autoApplyThreshold: 0.9,
  minObservations: 3,
  memoryLookback: 50
})

const runtime = new AgentRuntime({
  agentId: 'your-agent',
  plugins: [worldview]
})

await runtime.initialize()
```

## How Seeding Works

```
First Run:
  Config → Check existing worldview? 
    No → Load seed → Save to runtime/worldviews/{agentId}.mermaid
    Yes → Load existing (seed ignored)

Every 60s:
  Analyze last 50 memories → Detect patterns → Generate suggestions
    Confidence > 0.9 → Auto-apply
    Confidence 0.7-0.9 → Queue for review
  Save updated worldview
```

## For Your Bio-Manufacturing Use Case

```typescript
const worldview = createWorldviewPlugin({
  seedPath: './packages/plugin-worldview/seeds/bio-manufacturing.json'
})
```

This gives your agent immediate understanding of:
- **Entities**: ORGANISM, PROCESS, MATERIAL, EQUIPMENT, EXPERIMENT, MEASUREMENT
- **Relationships**: How they connect (organisms perform processes, processes produce materials, etc.)

Then through interactions, it learns your specifics:
- Your particular organisms (e.g., "Acetobacter xylinum")
- Your processes (e.g., "bacterial cellulose cultivation")
- Your equipment (e.g., "bioreactor", "incubator")
- Your measurements (e.g., "pH", "yield", "thickness")

**Structure from seed + specifics from evolution = Domain expert agent**

## Creating Your Own Seed

```json
{
  "entities": [
    {"id": "YOUR_ENTITY", "type": "YOUR_ENTITY", "attributes": {}}
  ],
  "relationships": [
    {
      "source": "YOUR_ENTITY",
      "target": "OTHER_ENTITY",
      "type": "relates_to",
      "cardinality": "||--o{",
      "confidence": 1.0
    }
  ]
}
```

Save as `seeds/your-domain.json` and reference in plugin config.

## Cardinality Guide

Choose based on semantic meaning:

- `||--o{` (OneToMany) = **Ownership** (USER owns MESSAGEs)
- `}o--o{` (ManyToMany) = **Association** (MESSAGE discusses TOPICs)  
- `||--||` (OneToOne) = **Identity** (ACTION has one INTENT)
- `}o--||` (ManyToOne) = **Attribution** (MESSAGEs in CONVERSATION)

The cardinality tells the agent how to reason about relationships.

## Key Features

✓ **Continuous evolution** - Background pattern detection  
✓ **Semantic cardinality** - Relationship types carry meaning  
✓ **Mermaid storage** - Human-readable, git-diffable  
✓ **Domain seeding** - Start with knowledge, not blank slate  
✓ **Auto-learning** - High confidence patterns applied automatically  
✓ **Extensible** - Clean architecture, easy to customize  

## Documentation Hierarchy

1. **QUICKSTART.md** - Get running in 3 steps (5 min read)
2. **SEEDING-QUICK-REF.md** - Seeding reference card (2 min read)
3. **README.md** - Complete API documentation (15 min read)
4. **SEEDING.md** - Complete seeding guide (20 min read)
5. **DEVELOPMENT.md** - Extension patterns (30 min read)

Start with QUICKSTART, refer to others as needed.

## Testing

```bash
cd packages/plugin-worldview

# Run tests
npm run build
node examples/test.ts

# Try seeding examples
node examples/seeded-agents.ts bio          # Bio-manufacturing
node examples/seeded-agents.ts game         # Game design
node examples/seeded-agents.ts compare      # Seeded vs unseeded
node examples/seeded-agents.ts inspect      # Inspect seed
```

## Multi-Agent Systems

Use same seed across agents for shared vocabulary:

```typescript
const seed = './seeds/bio-manufacturing.json'

const labAgent = createAgent({ seedPath: seed })
const analysisAgent = createAgent({ seedPath: seed })
const reportingAgent = createAgent({ seedPath: seed })
```

All agents start with shared understanding, then specialize through interactions.

## Next Steps

1. **Immediate**: Download plugin, install, add to your agent
2. **Day 1**: Use provided seed or create custom seed for your domain
3. **Week 1**: Monitor worldview evolution in `runtime/worldviews/`
4. **Month 1**: Customize pattern detection, add domain-specific rules
5. **Quarter 1**: Export to OWL/RDF for formal reasoning (roadmap)

## Support

- Check `SEEDING.md` for comprehensive seeding guide
- Check `DEVELOPMENT.md` for extension patterns
- Check `examples/` for working code
- All 4 seed files are production-ready templates

## Stats

- **24 files** total
- **~2,500 lines** of code and documentation
- **4 production-ready seeds** included
- **6 complete examples** showing different patterns
- **Zero dependencies** (except ElizaOS core)

## You're Ready!

```bash
npm install && npm run build
```

Then add to your agent with your preferred seed. The worldview evolves from there!

## What Makes This Special

Most agent systems treat all interactions equally. This plugin gives agents:

1. **Interpretive frameworks** - Understand *why* things relate
2. **Semantic grounding** - Cardinality carries meaning
3. **Domain expertise** - Start with knowledge, not blank slate
4. **Continuous learning** - Refine understanding through interaction
5. **Git-friendly ontologies** - Track evolution, version, share

Your agents don't just remember facts - they understand domains.
