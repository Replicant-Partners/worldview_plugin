# Comprehensive Plan: Agent-OM Integration into ElizaOS Worldview Plugin

## Executive Summary

This plan integrates concepts from the Agent-OM paper (Agent for Ontology Matching) into the existing worldview plugin to create a more sophisticated, LLM-powered ontology learning and matching system. The upgrade transforms the plugin from a simple pattern-detection system into a dual-agent architecture with advanced retrieval, matching, validation, and cross-agent alignment capabilities.

## Current State Analysis

### Strengths
- Clean, modular architecture with separation of concerns
- Human-readable Mermaid storage (git-friendly)
- Confidence-based suggestion system
- Semantic cardinality with reasoning metadata
- Continuous background evolution

### Limitations
1. **Naive entity extraction**: Simple regex heuristics miss complex entities
2. **No semantic enrichment**: Entities lack contextual meaning and descriptions
3. **Basic pattern matching**: Simple co-occurrence counting
4. **No validation layer**: High-confidence patterns auto-applied without verification
5. **Single storage format**: Only Mermaid files, no similarity search
6. **No inter-agent alignment**: Can't match/merge worldviews across agents
7. **Limited reasoning**: No multi-signal fusion for better confidence

## Agent-OM Key Concepts to Integrate

From the paper's architecture:

1. **Siamese Agent Design**: Separate retrieval and matching responsibilities
2. **Hybrid Storage**: Relational + vector database for similarity search
3. **Multi-Faceted Retrieval**: Syntactic, lexical, and semantic information extraction
4. **RAG-Enhanced Processing**: LLM-powered entity enrichment with context
5. **Multi-Signal Matching**: Reciprocal Rank Fusion (RRF) for combining signals
6. **Validation Layer**: LLM-based verification to reduce hallucinations
7. **Ontology Alignment**: Cross-agent worldview matching capabilities

## Implementation Plan

### Phase 1: Enhanced Entity Retrieval System

**Goal**: Add multi-faceted entity analysis inspired by Agent-OM's Retrieval Agent

#### 1.1 Create Entity Enrichment Service (`src/enrichment.ts`)

**Components**:
- **SyntacticEnricher**: Improved tokenization and normalization
  - CamelCase splitting (`ProgramCommitteeChair` → `program committee chair`)
  - Snake_case handling
  - Acronym detection
  
- **LexicalEnricher**: LLM-powered semantic understanding
  - General meaning: `"What is {entity} in the context of {domain}?"`
  - Extract from entity metadata (labels, comments, descriptions)
  - Context-aware definitions
  
- **SemanticEnricher**: Relationship-based context
  - Extract entity's position in relationship graph
  - Verbalize relationships: `"USER creates MESSAGE"` → `"Users create messages"`
  - Identify semantic roles (hub, leaf, bridge)

**API Design**:
```typescript
interface EnrichedEntity {
  id: string
  type: string
  syntactic: string            // Normalized name
  lexical: string              // LLM-generated meaning
  semantic: string             // Relationship context
  embedding: {
    syntactic: number[]        // Embedding of syntactic form
    lexical: number[]          // Embedding of meaning
    semantic: number[]         // Embedding of context
  }
}

class EntityEnrichmentService {
  constructor(llmProvider: LLMProvider, embeddingModel: EmbeddingModel)
  
  async enrich(entity: Entity, graph: WorldviewGraph): Promise<EnrichedEntity>
  async enrichBatch(entities: Entity[], graph: WorldviewGraph): Promise<EnrichedEntity[]>
}
```

**Implementation Details**:
- Use runtime's LLM for lexical enrichment (already available in ElizaOS)
- Use embedding model for vectorization (OpenAI text-embedding-3-small or similar)
- Cache enrichments to avoid redundant LLM calls
- Async batch processing for efficiency

#### 1.2 Update Entity Storage Format

**Current**: Only metadata in `Entity` type

**Enhanced**:
```typescript
interface Entity {
  // Existing fields
  id: string
  type: string
  attributes: Record<string, any>
  firstSeen: Date
  lastSeen: Date
  observationCount: number
  
  // New enrichment fields
  enrichment?: {
    syntactic: string
    lexical: string
    semantic: string
    lastEnriched: Date
  }
}
```

### Phase 2: Hybrid Storage with Vector Database

**Goal**: Enable semantic similarity search while preserving Mermaid storage

#### 2.1 Add Vector Database Layer (`src/storage/vector-store.ts`)

**Options**:
1. **Embedded**: ChromaDB, LanceDB (JavaScript support)
2. **PostgreSQL + pgvector**: Matches Agent-OM approach
3. **In-memory with FAISS**: Simple, no dependencies

**Recommendation**: Start with **LanceDB** (serverless, embedded, TypeScript-native)

**Schema Design**:
```typescript
interface VectorRecord {
  entity_id: string              // Links to Entity.id
  category: 'source' | 'target'  // For cross-agent matching
  entity_type: string
  content_type: 'syntactic' | 'lexical' | 'semantic'
  content: string
  embedding: number[]            // 1536-dim for OpenAI
  metadata: {
    agentId: string
    version: number
    created: Date
  }
}
```

**API**:
```typescript
class VectorStore {
  async add(record: VectorRecord): Promise<void>
  async search(query: string | number[], topK: number, filters?: object): Promise<VectorRecord[]>
  async searchSimilar(entityId: string, contentType: string, topK: number): Promise<VectorRecord[]>
  async delete(entityId: string): Promise<void>
  async clear(): Promise<void>
}
```

#### 2.2 Dual Storage Architecture

**Strategy**: Keep Mermaid as source of truth, use vector DB as index

**Flow**:
1. Load Mermaid → populate graph
2. Enrich entities → generate embeddings
3. Store embeddings in vector DB
4. On save: update Mermaid, sync vector DB
5. On query: use vector DB for similarity, Mermaid for structure

**Implementation**:
```typescript
class WorldviewGraph {
  private vectorStore: VectorStore
  
  async save(): Promise<void> {
    // Save Mermaid (existing)
    await this.saveMermaid()
    
    // Sync vector store
    await this.syncVectorStore()
  }
  
  async syncVectorStore(): Promise<void> {
    // Clear old vectors
    // Enrich all entities
    // Insert new vectors
  }
  
  async findSimilarEntities(entityId: string, topK: number): Promise<Entity[]> {
    // Use vector search
  }
}
```

### Phase 3: Siamese Agent Architecture

**Goal**: Refactor into specialized Retrieval and Matching agents

#### 3.1 Create Retrieval Agent (`src/agents/retrieval-agent.ts`)

**Responsibilities**:
- Extract entities from memories
- Enrich entities with multi-faceted information
- Store enrichments in graph + vector DB
- Track entity metadata (first/last seen, observation counts)

**Workflow**:
```
Memories → Entity Extraction → Enrichment (Syntactic/Lexical/Semantic) 
→ Embedding Generation → Hybrid Storage (Mermaid + Vector DB)
```

**API**:
```typescript
class RetrievalAgent {
  constructor(
    graph: WorldviewGraph,
    enrichmentService: EntityEnrichmentService,
    vectorStore: VectorStore
  )
  
  async processMemories(memories: Memory[]): Promise<{
    entitiesAdded: number
    entitiesUpdated: number
    enrichmentsGenerated: number
  }>
}
```

#### 3.2 Create Matching Agent (`src/agents/matching-agent.ts`)

**Responsibilities**:
- Find similar entities using multi-signal matching
- Detect potential relationships
- Validate suggestions using LLM
- Generate high-confidence suggestions

**Matching Pipeline**:
```
Query Entity → Candidate Selection (Vector Search) 
→ Multi-Signal Scoring (Syntactic/Lexical/Semantic)
→ RRF Fusion → LLM Validation → Suggestions
```

**API**:
```typescript
class MatchingAgent {
  constructor(
    graph: WorldviewGraph,
    vectorStore: VectorStore,
    llmProvider: LLMProvider
  )
  
  async findMatches(entity: Entity): Promise<Match[]>
  async detectRelationships(entities: Entity[]): Promise<Suggestion[]>
  async validateSuggestion(suggestion: Suggestion): Promise<boolean>
}
```

#### 3.3 Update Main Plugin

**Refactor** `WorldviewPlugin` to orchestrate both agents:

```typescript
class WorldviewPlugin {
  private retrievalAgent: RetrievalAgent
  private matchingAgent: MatchingAgent
  
  async evolve(runtime: IAgentRuntime): Promise<void> {
    // Phase 1: Retrieval
    const retrievalResult = await this.retrievalAgent.processMemories(memories)
    
    // Phase 2: Matching
    const suggestions = await this.matchingAgent.detectRelationships(
      this.graph.getAllEntities()
    )
    
    // Phase 3: Apply suggestions
    await this.applySuggestions(suggestions)
  }
}
```

### Phase 4: Multi-Signal Matching with RRF

**Goal**: Combine syntactic, lexical, and semantic signals for better confidence

#### 4.1 Implement Matching Scorer (`src/matching/scorer.ts`)

**Components**:

**SyntacticMatcher**: String similarity
- Edit distance (Levenshtein)
- Token overlap (Jaccard)
- N-gram similarity

**LexicalMatcher**: Meaning similarity
- Vector cosine similarity on lexical embeddings
- Threshold-based ranking

**SemanticMatcher**: Context similarity
- Vector cosine similarity on semantic embeddings
- Relationship pattern matching

**API**:
```typescript
interface MatchScore {
  entityId: string
  syntacticScore: number
  lexicalScore: number
  semanticScore: number
  rank: number
}

class MatchingScorer {
  scoreSyntactic(entity1: Entity, entity2: Entity): number
  scoreLexical(entity1: Entity, entity2: Entity): number
  scoreSemantic(entity1: Entity, entity2: Entity): number
}
```

#### 4.2 Implement RRF Fusion (`src/matching/rrf.ts`)

**Reciprocal Rank Fusion** from Agent-OM paper:

```typescript
RRF(entity) = Σ(1 / (k + rank_in_signal))
```

Where signals are: syntactic, lexical, semantic

**Implementation**:
```typescript
class RRFFusion {
  constructor(k: number = 0) // Agent-OM uses k=0
  
  fuse(
    syntacticRanks: MatchScore[],
    lexicalRanks: MatchScore[],
    semanticRanks: MatchScore[]
  ): MatchScore[] {
    // Combine ranks using RRF formula
    // Return sorted by RRF score
  }
}
```

#### 4.3 Update Confidence Calculation

**Current**: Simple frequency-based

**Enhanced**: Multi-signal weighted average
```typescript
confidence = 
  0.3 * syntacticScore +
  0.4 * lexicalScore +
  0.3 * semanticScore
```

With adjustments based on:
- Observation frequency (existing)
- Validation result (new)
- Cross-signal agreement

### Phase 5: LLM Validation Layer

**Goal**: Reduce false positives before auto-applying suggestions

#### 5.1 Create Validation Service (`src/validation/validator.ts`)

**Approach**: Binary verification like Agent-OM's Matching Validator

**Prompts**:

**Entity Equivalence**:
```
Question: Are "{entity1}" and "{entity2}" the same concept?
Context: {domain_context}
Entity1 Description: {entity1.lexical}
Entity2 Description: {entity2.lexical}

Answer yes or no, then provide a brief explanation.
```

**Relationship Validity**:
```
Question: Does the relationship "{source} {type} {target}" make sense?
Context: {domain_context}
Source Description: {source.lexical}
Target Description: {target.lexical}
Relationship Type: {type}

Answer yes or no, then provide a brief explanation.
```

**API**:
```typescript
class SuggestionValidator {
  constructor(llmProvider: LLMProvider)
  
  async validateEntityMerge(
    entity1: Entity,
    entity2: Entity,
    context: string
  ): Promise<{
    valid: boolean
    explanation: string
    confidence: number
  }>
  
  async validateRelationship(
    source: Entity,
    target: Entity,
    relationType: string,
    context: string
  ): Promise<{
    valid: boolean
    explanation: string
    confidence: number
  }>
}
```

#### 5.2 Integrate into Suggestion Pipeline

**Update flow**:
```
Suggestion Generated → RRF Scoring → Validation → Apply/Queue/Reject
```

**Thresholds**:
- Confidence ≥ 0.9 + Validation = Yes → Auto-apply
- Confidence ≥ 0.7 + Validation = Yes → Queue for review
- Validation = No → Reject (log for analysis)

### Phase 6: Cross-Agent Ontology Alignment

**Goal**: Enable worldview matching between different agents

#### 6.1 Create Alignment Service (`src/alignment/aligner.ts`)

**Use Cases**:
1. **Agent Collaboration**: Find shared concepts between agents
2. **Knowledge Transfer**: Bootstrap new agent from experienced agent's worldview
3. **Consistency Checking**: Detect conflicting worldviews

**Architecture**:
```typescript
class OntologyAligner {
  constructor(
    vectorStore: VectorStore,
    matchingAgent: MatchingAgent,
    validator: SuggestionValidator
  )
  
  async alignWorldviews(
    sourceAgentId: string,
    targetAgentId: string
  ): Promise<AlignmentResult>
  
  async findEquivalentEntities(
    sourceEntity: Entity,
    targetAgentId: string
  ): Promise<Match[]>
  
  async suggestMerge(
    alignment: AlignmentResult
  ): Promise<Suggestion[]>
}

interface AlignmentResult {
  sourceAgentId: string
  targetAgentId: string
  matches: Array<{
    sourceEntity: Entity
    targetEntity: Entity
    confidence: number
    reasoning: string
  }>
  conflicts: Array<{
    entity: string
    sourceType: string
    targetType: string
    resolution?: string
  }>
  stats: {
    totalSource: number
    totalTarget: number
    matched: number
    unmatched: number
  }
}
```

#### 6.2 Add Alignment Actions

**New runtime actions**:
- `ALIGN_WORLDVIEWS`: Align with another agent's worldview
- `MERGE_WORLDVIEWS`: Import entities/relationships from another agent
- `COMPARE_WORLDVIEWS`: Show differences between worldviews

### Phase 7: Enhanced Pattern Observer

**Goal**: Upgrade pattern detection to use enriched entities and multi-signal matching

#### 7.1 Update PatternObserver

**Changes**:
- Use enriched entities instead of raw text extraction
- Leverage vector similarity for entity co-occurrence
- Apply RRF for relationship confidence
- Add cardinality inference from semantic context (not just ratios)

**Enhanced Workflow**:
```
Memories → Extract Entities → Enrich → Find Similar Entities (Vector)
→ Detect Co-occurrence → Multi-Signal Scoring → RRF Fusion 
→ Infer Cardinality → Validate → Generate Suggestions
```

#### 7.2 Cardinality Inference Enhancement

**Current**: Simple ratio-based

**Enhanced**: Multi-factor analysis
- Observation ratios (existing)
- Semantic context from lexical enrichment
- Relationship patterns in domain
- LLM-suggested cardinality: `"What is the cardinality of the relationship between {source} and {target} where {source} {type} {target}?"`

### Phase 8: Configuration and Observability

#### 8.1 Extended Configuration

```typescript
interface WorldviewConfig {
  // Existing
  evolutionIntervalMs?: number
  autoApplyThreshold?: number
  minObservations?: number
  memoryLookback?: number
  
  // New
  enrichment?: {
    enabled: boolean
    batchSize: number
    cacheSize: number
  }
  vectorStore?: {
    provider: 'lancedb' | 'chroma' | 'pgvector'
    dimension: number
    similarityMetric: 'cosine' | 'euclidean' | 'dot'
  }
  matching?: {
    topK: number
    syntacticWeight: number
    lexicalWeight: number
    semanticWeight: number
    rrfK: number
  }
  validation?: {
    enabled: boolean
    model?: string
    maxRetries: number
  }
  alignment?: {
    enabled: boolean
    autoMergeThreshold: number
  }
}
```

#### 8.2 Enhanced Logging and Metrics

**Add structured logging**:
- Enrichment performance (time, cache hits)
- Vector search performance (query time, result quality)
- Validation results (accept/reject rates)
- Evolution metrics (entities/relationships over time)

**Expose metrics API**:
```typescript
interface WorldviewMetrics {
  entities: {
    total: number
    enriched: number
    byType: Record<string, number>
  }
  relationships: {
    total: number
    validated: number
    byCardinality: Record<Cardinality, number>
  }
  suggestions: {
    generated: number
    applied: number
    queued: number
    rejected: number
  }
  performance: {
    enrichmentTimeMs: number
    matchingTimeMs: number
    validationTimeMs: number
  }
}
```

## Implementation Priority and Phases

### **Phase 1: Foundation** (Most Critical)
- Entity enrichment service with LLM integration
- Vector store integration (LanceDB)
- Dual storage architecture

**Why First**: Enables all subsequent improvements, provides immediate value through semantic search

### **Phase 2: Core Agents** (High Priority)
- Siamese agent refactoring
- Multi-signal matching with RRF
- Enhanced confidence calculation

**Why Second**: Builds on enrichment infrastructure, significantly improves accuracy

### **Phase 3: Quality Assurance** (High Priority)
- LLM validation layer
- Enhanced pattern observer
- Better cardinality inference

**Why Third**: Reduces false positives, validates the improvements from Phases 1-2

### **Phase 4: Advanced Features** (Medium Priority)
- Cross-agent ontology alignment
- Extended configuration options
- Metrics and observability

**Why Fourth**: Builds on stable foundation, adds advanced capabilities

## File Structure

```
src/
├── index.ts                    # Main plugin (refactored)
├── types.ts                    # Enhanced types
├── graph.ts                    # Updated with vector store integration
├── observer.ts                 # Enhanced pattern detection
├── enrichment/
│   ├── enrichment-service.ts  # Entity enrichment orchestrator
│   ├── syntactic-enricher.ts  # Syntactic analysis
│   ├── lexical-enricher.ts    # LLM-powered meaning extraction
│   └── semantic-enricher.ts   # Relationship context
├── storage/
│   ├── vector-store.ts        # Abstract vector store interface
│   ├── lance-store.ts         # LanceDB implementation
│   └── embedding-service.ts   # Embedding generation
├── agents/
│   ├── retrieval-agent.ts     # Entity extraction and enrichment
│   └── matching-agent.ts      # Similarity matching and relationship detection
├── matching/
│   ├── scorer.ts              # Multi-signal matching
│   ├── rrf.ts                 # Reciprocal rank fusion
│   └── matchers/
│       ├── syntactic.ts       # String similarity
│       ├── lexical.ts         # Meaning similarity
│       └── semantic.ts        # Context similarity
├── validation/
│   └── validator.ts           # LLM-based suggestion validation
├── alignment/
│   └── aligner.ts             # Cross-agent worldview alignment
└── utils/
    ├── cache.ts               # LRU cache for enrichments
    └── metrics.ts             # Performance tracking
```

## Critical Files to Modify

1. **src/index.ts** - Orchestrate new agents
2. **src/graph.ts** - Add vector store integration
3. **src/types.ts** - Add enrichment types
4. **src/observer.ts** - Upgrade pattern detection
5. **package.json** - Add dependencies (LanceDB, string similarity libs)

## Dependencies to Add

```json
{
  "dependencies": {
    "vectordb": "^0.4.0",           // LanceDB
    "apache-arrow": "^14.0.0",      // Required by LanceDB
    "string-similarity": "^4.0.4",  // Syntactic matching
    "natural": "^6.0.0"             // Text processing
  }
}
```

## Testing Strategy

### Unit Tests
- Entity enrichment services
- Matching scorers (syntactic/lexical/semantic)
- RRF fusion algorithm
- Validation prompts

### Integration Tests
- Retrieval agent with mocked LLM
- Matching agent with test vector store
- Full evolution cycle
- Alignment between two test agents

### End-to-End Tests
- Load seed ontology
- Process conversation memories
- Verify entities enriched
- Verify relationships detected
- Verify suggestions validated
- Verify worldview saved correctly

## Migration Strategy

### Backward Compatibility
- Keep existing Mermaid storage format
- Existing worldviews load without enrichment
- Enrichment happens lazily on first evolution cycle
- Old plugins continue working (enrichment optional)

### Migration Path
1. Deploy with `enrichment.enabled: false` (default)
2. Enable enrichment for test agents
3. Monitor performance and quality
4. Gradually enable for production agents

## Performance Considerations

### Optimization Strategies
1. **Batch processing**: Enrich entities in batches
2. **Caching**: LRU cache for enrichments
3. **Lazy enrichment**: Only enrich entities when needed
4. **Incremental updates**: Only process new entities
5. **Vector index tuning**: Optimize HNSW parameters

### Expected Performance
- **Enrichment**: ~100-200ms per entity (with LLM calls)
- **Vector search**: <10ms for top-k queries
- **Validation**: ~200-500ms per suggestion
- **Full evolution cycle**: <30s for 50 memories (with caching)

## Risks and Mitigations

### Risk 1: LLM Cost
**Mitigation**: 
- Cache enrichments aggressively
- Use smaller models for validation (GPT-4o-mini)
- Batch LLM calls
- Add cost tracking and limits

### Risk 2: Vector Store Overhead
**Mitigation**:
- Use embedded LanceDB (no server)
- Lazy indexing
- Configurable vector dimensions

### Risk 3: Backward Compatibility
**Mitigation**:
- Feature flags for new capabilities
- Graceful degradation
- Migration tooling

### Risk 4: Complexity
**Mitigation**:
- Incremental rollout
- Comprehensive testing
- Clear documentation
- Monitoring and alerting

## Success Metrics

### Quantitative
- **Accuracy**: Precision/recall of entity detection (target: >90%)
- **Confidence calibration**: Correlation between confidence and correctness
- **False positive rate**: Incorrect auto-applied suggestions (target: <5%)
- **Performance**: Evolution cycle time (target: <30s)

### Qualitative
- **Worldview quality**: Manual review of learned ontologies
- **Agent reasoning**: Improved agent responses using worldview
- **Developer experience**: Ease of customization and debugging

## Verification Steps

### Phase 1 Verification
1. Create test agent with bio-manufacturing seed
2. Feed 50 domain-specific conversation memories
3. Verify entities enriched with syntactic/lexical/semantic info
4. Check vector store populated correctly
5. Query similar entities, verify reasonable results
6. Confirm Mermaid file still valid

### Phase 2 Verification
1. Run retrieval agent on test memories
2. Verify entities extracted and enriched
3. Run matching agent on enriched entities
4. Verify multi-signal scores generated
5. Check RRF fusion produces sensible rankings
6. Compare suggestions to baseline pattern observer

### Phase 3 Verification
1. Generate high-confidence suggestions
2. Run validation on each suggestion
3. Verify validation prompts reasonable
4. Check accept/reject rates
5. Manually review rejected suggestions (should be correct rejections)
6. Measure false positive reduction

### Phase 4 Verification
1. Create two agents with overlapping domains
2. Run alignment between worldviews
3. Verify equivalent entities detected
4. Check conflict detection
5. Test merge suggestions
6. Verify both worldviews remain consistent

## Future Enhancements (Post-Implementation)

### Short Term
- Named Entity Recognition (NER) model for better entity extraction
- Active learning: User feedback on suggestions
- Relationship type inference from context
- Temporal reasoning: Track how relationships evolve

### Medium Term
- Inference rules (transitive relationships)
- Conflict detection and resolution
- Multi-hop reasoning over graph
- Worldview visualization UI

### Long Term
- Export to OWL/RDF for formal reasoning
- SPARQL query interface
- Federated worldviews across agent networks
- Continual learning from web sources

## Conclusion

This comprehensive plan transforms the worldview plugin from a pattern-detection system into a sophisticated, LLM-powered ontology learning and matching platform. The Siamese agent architecture, multi-signal matching, validation layer, and cross-agent alignment bring Agent-OM's research insights into a production-ready ElizaOS plugin.

The phased approach ensures incremental value delivery while maintaining backward compatibility. The foundation (enrichment + vector store) provides immediate benefits, while later phases add increasingly advanced capabilities.

**Estimated Development Time**: 
- Phase 1: 3-4 days
- Phase 2: 3-4 days  
- Phase 3: 2-3 days
- Phase 4: 2-3 days
- Testing & Polish: 2-3 days
- **Total**: 12-17 days

**Recommended Start**: Phase 1 (Foundation) - provides immediate value and enables all subsequent work.
