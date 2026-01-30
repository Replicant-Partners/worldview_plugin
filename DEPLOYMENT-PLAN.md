# ElizaOS Worldview Plugin - Deployment Plan

## Overview
This document outlines the deployment strategy for integrating the Agent-OM enhanced worldview plugin into an ElizaOS environment running on Railway with Supabase Postgres.

## Architecture Considerations

### Current Plugin Architecture
- **Vector Store**: LanceDB (embedded, file-based)
- **Graph Storage**: Mermaid files + in-memory graph
- **Enrichment**: OpenAI embeddings (ada-002, text-embedding-3-small)
- **Validation**: OpenAI GPT-4 for LLM validation
- **Agent Architecture**: Siamese agents (Retrieval + Matching)

### Railway + Supabase Environment
- **Platform**: Railway (ephemeral filesystem)
- **Database**: External Supabase Postgres
- **Considerations**:
  - Railway containers have ephemeral storage (resets on deploy)
  - Need persistent storage for LanceDB vector store
  - Supabase Postgres available for persistent data

## Deployment Phases

### Phase 1: Package as NPM Module

#### 1.1 Prepare Package
```bash
# In worldview_plugin directory
npm run build

# Update package.json with proper metadata
{
  "name": "@your-org/elizaos-worldview-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "README.md"],
  "peerDependencies": {
    "@ai16z/eliza": "*"
  }
}
```

#### 1.2 Publish Options
**Option A: Private NPM Registry**
```bash
npm publish --access private
```

**Option B: Local Path (for testing)**
```json
// In ElizaOS package.json
{
  "dependencies": {
    "@your-org/elizaos-worldview-plugin": "file:../worldview_plugin"
  }
}
```

**Option C: Git Dependency**
```json
{
  "dependencies": {
    "@your-org/elizaos-worldview-plugin": "git+https://github.com/your-org/worldview-plugin.git"
  }
}
```

### Phase 2: Handle Persistent Storage on Railway

#### 2.1 Vector Store Persistence
**Problem**: LanceDB stores data in files, Railway has ephemeral filesystem.

**Solution A: Railway Volume (Recommended)**
```yaml
# railway.toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"

[[volumes]]
name = "worldview-data"
mountPath = "/data/worldview"
```

Configure plugin to use volume:
```typescript
// In ElizaOS initialization
const worldviewPlugin = new WorldviewPlugin({
  worldviewDir: process.env.WORLDVIEW_DIR || '/data/worldview',
  enableEnrichment: true,
  enableAgents: true,
  enableValidation: true
});
```

**Solution B: Supabase Storage (Alternative)**
- Store LanceDB data in Supabase Storage buckets
- Sync on startup, periodic backups
- Requires implementing storage adapter

#### 2.2 Mermaid File Storage
**Current**: File-based in worldviewDir
**Options**:
1. Use Railway volume (same as vector store)
2. Store in Supabase (as JSON or files in storage)
3. Hybrid: Keep in volume, backup to Supabase

### Phase 3: Environment Configuration

#### 3.1 Required Environment Variables
```bash
# Railway Environment Variables

# API Keys
OPENAI_API_KEY=sk-...                    # For embeddings
ANTHROPIC_API_KEY=sk-ant-...             # If using Claude for validation

# Model Configuration (2026 Best Practice)
WORLDVIEW_EMBEDDING_MODEL=text-embedding-3-large      # 3072 dimensions (recommended)
WORLDVIEW_VALIDATION_MODEL=claude-opus-4-5            # Best reasoning (or claude-sonnet-4-5)

# Storage
WORLDVIEW_DIR=/data/worldview            # Persistent volume path

# Feature Flags
WORLDVIEW_ENABLE_ENRICHMENT=true         # Enable Phase 1 features
WORLDVIEW_ENABLE_AGENTS=true             # Enable Phase 2 Siamese agents
WORLDVIEW_ENABLE_VALIDATION=true         # Enable Phase 3 LLM validation

# Supabase (Optional)
SUPABASE_URL=https://xxx.supabase.co     # If using Supabase integration
SUPABASE_KEY=eyJ...                       # Service role key
DATABASE_URL=postgresql://...             # Supabase Postgres connection
```

> **Note:** See [MODEL-CONFIGURATION.md](./MODEL-CONFIGURATION.md) for detailed model selection guide and cost analysis.

#### 3.2 Configure in Railway
1. Go to Railway project
2. Navigate to Variables tab
3. Add all required environment variables
4. Ensure WORLDVIEW_DIR matches volume mount path

### Phase 4: ElizaOS Integration

#### 4.1 Install Plugin
```bash
# In ElizaOS project root
npm install @your-org/elizaos-worldview-plugin
# or
npm install file:../worldview_plugin
```

#### 4.2 Register Plugin
```typescript
// In your ElizaOS agent configuration file
import { WorldviewPlugin } from '@your-org/elizaos-worldview-plugin';

// Character definition or agent initialization
const character = {
  name: "YourAgent",
  plugins: [
    new WorldviewPlugin({
      // Feature flags
      enableEnrichment: process.env.WORLDVIEW_ENABLE_ENRICHMENT === 'true',
      enableAgents: process.env.WORLDVIEW_ENABLE_AGENTS === 'true',
      enableValidation: process.env.WORLDVIEW_ENABLE_VALIDATION === 'true',
      
      // Model configuration (2026 best practice)
      embeddingModel: process.env.WORLDVIEW_EMBEDDING_MODEL || 'text-embedding-3-large',
      validationModel: process.env.WORLDVIEW_VALIDATION_MODEL || 'claude-opus-4-5',
      
      // Storage
      vectorStorePath: process.env.WORLDVIEW_DIR || './worldviews',
      
      // Optional: Fine-tune matching parameters
      matching: {
        topK: 10,
        minConfidence: 0.7,
        syntacticWeight: 0.3,
        lexicalWeight: 0.4,
        semanticWeight: 0.3
      }
    })
  ],
  // ... rest of character config
};
```

#### 4.3 Runtime Initialization
```typescript
// In your main ElizaOS runtime initialization
import { AgentRuntime } from '@ai16z/eliza';

const runtime = new AgentRuntime({
  // ... your runtime config
  plugins: [
    // ... other plugins
    worldviewPlugin
  ]
});

// Ensure plugin has access to runtime for validation
await runtime.initialize();
```

### Phase 5: Database Integration (Optional)

#### 5.1 Supabase Schema for Worldview Metadata
If you want to leverage Supabase Postgres for metadata:

```sql
-- Track worldview versions and sync status
CREATE TABLE worldview_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  worldview_name TEXT NOT NULL,
  version INTEGER NOT NULL,
  last_synced TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  vector_count INTEGER,
  entity_count INTEGER,
  mermaid_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track entity enrichment status
CREATE TABLE worldview_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worldview_id UUID REFERENCES worldview_metadata(id),
  entity_name TEXT NOT NULL,
  entity_type TEXT,
  syntactic_embedding VECTOR(1536),  -- If using pgvector
  lexical_embedding VECTOR(1536),
  semantic_embedding VECTOR(1536),
  enriched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB
);

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 5.2 Implement Supabase Adapter (Future Enhancement)
```typescript
// src/storage/supabase-adapter.ts
export class SupabaseVectorStore implements VectorStore {
  async addBatch(records: VectorRecord[]): Promise<void> {
    // Store in Supabase using pgvector
  }
  
  async searchSimilar(embedding: number[], k: number): Promise<SearchResult[]> {
    // Query Supabase with vector similarity
  }
}
```

### Phase 6: Build & Deploy

#### 6.1 Build Configuration
```json
// package.json in ElizaOS project
{
  "scripts": {
    "build": "tsc && npm run build:plugin",
    "build:plugin": "cd node_modules/@your-org/elizaos-worldview-plugin && npm run build",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  }
}
```

#### 6.2 Railway Deployment
```bash
# Option A: Deploy via Railway CLI
railway up

# Option B: Deploy via Git
git add .
git commit -m "Add worldview plugin"
git push origin main
# Railway auto-deploys
```

#### 6.3 Post-Deployment Verification
```typescript
// Add health check endpoint
app.get('/health/worldview', async (req, res) => {
  const plugin = runtime.getPlugin('worldview');
  const status = {
    enrichmentEnabled: plugin.config.enableEnrichment,
    agentsEnabled: plugin.config.enableAgents,
    validationEnabled: plugin.config.enableValidation,
    vectorStoreInitialized: !!plugin.vectorStore,
    worldviewDir: plugin.config.worldviewDir,
    worldviewCount: plugin.graphs.size
  };
  res.json(status);
});
```

### Phase 7: Monitoring & Observability

#### 7.1 Logging
```typescript
// Add structured logging
import { elizaLogger } from '@ai16z/eliza';

elizaLogger.info('Worldview plugin initialized', {
  worldviewDir: config.worldviewDir,
  enrichmentEnabled: config.enableEnrichment,
  agentsEnabled: config.enableAgents
});

elizaLogger.debug('Entity enriched', {
  entityName: entity.name,
  syntacticScore: scores.syntactic,
  lexicalScore: scores.lexical,
  semanticScore: scores.semantic
});
```

#### 7.2 Railway Logging
```bash
# View logs
railway logs

# Stream logs
railway logs --follow
```

#### 7.3 Metrics to Track
- Vector store size (entity count)
- Enrichment success rate
- Validation acceptance rate
- Memory usage (LanceDB can be memory-intensive)
- API call counts (OpenAI embeddings/validation)

### Phase 8: Cost Optimization

#### 8.1 API Usage Costs (2026 Pricing)
- **Embeddings (text-embedding-3-large)**: ~$0.00013 per 1K tokens
- **Validation (Claude Opus 4.5)**: ~$0.015 per 1K input tokens, ~$0.075 per 1K output tokens
- **Validation (Claude Sonnet 4.5)**: ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens (recommended)

**Monthly Estimate for Active Agent:**
- 1000 new entities/month: ~$3 for embeddings
- 500 validation queries/month: ~$1.50 for validation (Sonnet)
- **Total: ~$4.50/month**

**Optimization Strategies:**
- Cache embeddings in vector store (avoid re-computation)
- Only re-enrich when entities change
- Use validation selectively (high-confidence matches skip validation)
- Consider batch processing for enrichment
- Use Sonnet 4.5 instead of Opus for cost savings

See [MODEL-CONFIGURATION.md](./MODEL-CONFIGURATION.md) for detailed cost analysis.

#### 8.2 Railway Resource Usage
- Monitor memory usage (LanceDB loads indices into memory)
- Consider scaling up if handling many worldviews
- Volume size impacts cost (check Railway pricing)

#### 8.3 Supabase Usage
- Monitor Postgres storage if using database integration
- pgvector queries count against compute hours
- Storage buckets for Mermaid backups

## Migration Checklist

- [ ] Build and test plugin locally
- [ ] Package plugin (NPM, local, or git)
- [ ] Set up Railway volume for persistent storage
- [ ] Configure environment variables in Railway
- [ ] Install plugin in ElizaOS project
- [ ] Register plugin in agent configuration
- [ ] Test plugin initialization locally
- [ ] Deploy to Railway
- [ ] Verify health check endpoint
- [ ] Test worldview creation and evolution
- [ ] Monitor logs for errors
- [ ] Test entity enrichment and matching
- [ ] Verify validation is working
- [ ] Set up Supabase integration (optional)
- [ ] Configure monitoring and alerts
- [ ] Document any environment-specific configurations

## Rollback Plan

If issues arise after deployment:

1. **Disable Plugin Features**:
   ```bash
   # In Railway environment variables
   WORLDVIEW_ENABLE_ENRICHMENT=false
   WORLDVIEW_ENABLE_AGENTS=false
   WORLDVIEW_ENABLE_VALIDATION=false
   ```

2. **Fallback to PatternObserver**:
   Plugin automatically falls back if agents disabled

3. **Remove Plugin**:
   ```typescript
   // Comment out in character config
   // new WorldviewPlugin({ ... })
   ```

4. **Restore from Volume Backup**:
   ```bash
   # If needed, restore LanceDB data from backup
   railway volume restore worldview-data --from-backup <backup-id>
   ```

## Troubleshooting

### Issue: LanceDB fails to initialize
**Cause**: Volume not mounted or permissions issue
**Solution**:
```bash
# Check volume mount
railway run ls -la /data/worldview
# Ensure write permissions
railway run chmod -R 755 /data/worldview
```

### Issue: High memory usage
**Cause**: LanceDB loads indices into memory
**Solution**:
- Reduce number of worldviews
- Implement lazy loading
- Scale up Railway service

### Issue: OpenAI API rate limits
**Cause**: Too many enrichment/validation requests
**Solution**:
- Implement request queuing
- Add exponential backoff
- Cache results more aggressively

### Issue: Vector search returns poor results
**Cause**: Embeddings not synced or outdated
**Solution**:
```typescript
// Force re-sync
await worldviewGraph.syncVectorStore();
```

## Next Steps After Deployment

1. **Monitor Phase 1-3 Performance**:
   - Track enrichment quality
   - Measure matching accuracy
   - Evaluate validation effectiveness

2. **Implement Phase 4-6** (from AGENT-OM-INTEGRATION-PLAN.md):
   - Cross-agent ontology alignment
   - Enhanced pattern observer
   - Configuration & observability

3. **Supabase Integration**:
   - Implement pgvector adapter
   - Migrate from LanceDB to hybrid approach
   - Add metadata tracking

4. **Production Hardening**:
   - Add comprehensive error handling
   - Implement circuit breakers for API calls
   - Set up alerting for failures
   - Create backup/restore procedures

## Support & Resources

- ElizaOS Documentation: https://elizaos.github.io/eliza/
- Railway Documentation: https://docs.railway.app/
- Supabase Documentation: https://supabase.com/docs
- LanceDB Documentation: https://lancedb.github.io/lancedb/
- Agent-OM Paper: Reference implementation in this plugin

## Contact

For issues or questions about this deployment:
- Review logs: `railway logs --follow`
- Check health endpoint: `/health/worldview`
- Review implementation status: `IMPLEMENTATION-STATUS.md`
- Review integration plan: `AGENT-OM-INTEGRATION-PLAN.md`
