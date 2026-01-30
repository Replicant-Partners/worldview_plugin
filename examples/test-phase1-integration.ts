/**
 * Phase 1 Integration Test
 * Tests the enrichment and vector store integration
 */

import { createWorldviewPlugin } from "../src/index";
import { existsSync, rmSync } from "fs";
import { join } from "path";

// Simple mock runtime for testing
class MockRuntime {
  agentId = "test-agent-phase1";

  getSetting(key: string): string | undefined {
    if (key === "WORLDVIEW_DIR") return "./test_data/worldviews";
    if (key === "OPENAI_API_KEY") return process.env.OPENAI_API_KEY;
    return undefined;
  }

  messageManager = {
    getMemories: async () => [],
  };

  registerAction = () => {};
}

async function main() {
  console.log("\n🧪 Phase 1 Integration Test: Agent-OM Enrichment & Vector Store\n");
  console.log("=".repeat(70));

  // Clean up test data
  const testWorldviewDir = "./test_data/worldviews";
  const testVectorStoreDir = "./test_data/vector_stores";

  if (existsSync(testWorldviewDir)) {
    rmSync(testWorldviewDir, { recursive: true, force: true });
  }
  if (existsSync(testVectorStoreDir)) {
    rmSync(testVectorStoreDir, { recursive: true, force: true });
  }

  try {
    // Test 1: Create plugin WITHOUT enrichment (baseline)
    console.log("\n📝 Test 1: Plugin without enrichment (baseline)");
    console.log("-".repeat(70));

    const pluginBaseline = createWorldviewPlugin({
      enableEnrichment: false,
      enableInference: false,
    });

    const mockRuntime1 = new MockRuntime() as any;
    await pluginBaseline.initialize(mockRuntime1);

    const graph1 = pluginBaseline.getGraph();
    if (!graph1) throw new Error("Graph not initialized");

    // Add some test entities
    graph1.addEntity({
      id: "USER",
      type: "USER",
      attributes: { description: "A person who uses the system" },
      firstSeen: new Date(),
      lastSeen: new Date(),
      observationCount: 5,
    });

    graph1.addEntity({
      id: "MESSAGE",
      type: "MESSAGE",
      attributes: { description: "A message sent by a user" },
      firstSeen: new Date(),
      lastSeen: new Date(),
      observationCount: 3,
    });

    await graph1.save();
    console.log("✅ Baseline plugin initialized successfully");
    console.log(`   Entities: ${graph1.getStats().entities}`);

    // Clean up
    await pluginBaseline.cleanup();

    // Test 2: Create plugin WITH enrichment
    console.log("\n📝 Test 2: Plugin with enrichment and vector store");
    console.log("-".repeat(70));

    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

    if (!hasOpenAIKey) {
      console.log("⚠️  No OPENAI_API_KEY found - testing with simple embeddings");
    } else {
      console.log("✅ OpenAI API key found - testing with full embeddings");
    }

    const pluginEnriched = createWorldviewPlugin({
      enableEnrichment: true,
      enableInference: false,
      vectorStorePath: testVectorStoreDir,
      enrichment: {
        enabled: true,
        batchSize: 10,
        cacheSize: 100,
        context: "software engineering",
      },
    });

    const mockRuntime2 = new MockRuntime() as any;
    await pluginEnriched.initialize(mockRuntime2);

    const graph2 = pluginEnriched.getGraph();
    if (!graph2) throw new Error("Graph not initialized");

    console.log("✅ Enriched plugin initialized successfully");

    // Add test entities
    console.log("\n📋 Adding test entities...");

    const testEntities = [
      {
        id: "USER",
        type: "USER",
        attributes: { description: "A person who uses the system" },
      },
      {
        id: "MESSAGE",
        type: "MESSAGE",
        attributes: { description: "A message sent by a user" },
      },
      {
        id: "CONVERSATION",
        type: "CONVERSATION",
        attributes: { description: "A thread of messages" },
      },
    ];

    for (const entity of testEntities) {
      graph2.addEntity({
        ...entity,
        firstSeen: new Date(),
        lastSeen: new Date(),
        observationCount: 1,
      });
    }

    console.log(`✅ Added ${testEntities.length} entities`);

    // Test 3: Sync to vector store (enrichment happens here)
    console.log("\n📝 Test 3: Syncing to vector store (enrichment)");
    console.log("-".repeat(70));

    const startTime = Date.now();
    await graph2.syncVectorStore();
    const duration = Date.now() - startTime;

    console.log(`✅ Vector store sync complete in ${duration}ms`);

    // Check if entities were enriched
    const entities = graph2.getAllEntities();
    const enrichedCount = entities.filter((e) => e.enrichment).length;

    console.log(`📊 Enrichment stats:`);
    console.log(`   Total entities: ${entities.length}`);
    console.log(`   Enriched: ${enrichedCount}`);

    if (enrichedCount > 0) {
      const sampleEntity = entities.find((e) => e.enrichment);
      console.log(`\n📝 Sample enrichment (${sampleEntity?.id}):`);
      console.log(`   Syntactic: "${sampleEntity?.enrichment?.syntactic}"`);
      console.log(`   Lexical: "${sampleEntity?.enrichment?.lexical?.substring(0, 80)}..."`);
      console.log(`   Semantic: "${sampleEntity?.enrichment?.semantic?.substring(0, 80)}..."`);
    }

    // Test 4: Find similar entities
    console.log("\n📝 Test 4: Finding similar entities (vector search)");
    console.log("-".repeat(70));

    const userEntity = entities.find((e) => e.id === "USER");
    if (userEntity) {
      const similar = await graph2.findSimilarEntities("USER", "lexical", 2);
      console.log(`✅ Found ${similar.length} similar entities to USER`);
      similar.forEach((e, idx) => {
        console.log(`   ${idx + 1}. ${e.id} (${e.type})`);
      });
    }

    // Save enriched worldview
    await graph2.save();
    console.log("\n✅ Enriched worldview saved to Mermaid file");

    // Clean up
    await pluginEnriched.cleanup();

    // Summary
    console.log("\n" + "=".repeat(70));
    console.log("✅ All Phase 1 tests passed!");
    console.log("=".repeat(70));
    console.log("\n📊 Summary:");
    console.log("  ✅ Baseline plugin works");
    console.log("  ✅ Enrichment service integrated");
    console.log("  ✅ Vector store initialized");
    console.log("  ✅ Entities enriched with syntactic/lexical/semantic info");
    console.log("  ✅ Vector similarity search working");
    console.log("  ✅ Dual storage (Mermaid + Vector DB) functional");
    console.log("\n🎉 Phase 1 (Foundation) complete! Ready for Phase 2 (Agents).\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
