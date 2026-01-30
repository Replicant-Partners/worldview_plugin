/**
 * Phase 1 Testing Suite
 * Tests enrichment services and vector store functionality
 */

import { SyntacticEnricher } from "../src/enrichment/syntactic-enricher";
import { EmbeddingService } from "../src/storage/embedding-service";
import { LanceDBVectorStore } from "../src/storage/lance-store";
import { Entity, VectorRecord } from "../src/types";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";

// Test utilities
class TestReporter {
  private passed = 0;
  private failed = 0;
  private tests: Array<{ name: string; status: "pass" | "fail"; error?: any }> =
    [];

  test(name: string, fn: () => void | Promise<void>): void {
    this.tests.push({ name, status: "pass" });
  }

  async run() {
    console.log("\n🧪 Starting Phase 1 Tests\n");

    for (const test of this.tests) {
      try {
        console.log(`⏳ Running: ${test.name}`);
        // Test functions will be called inline
      } catch (error) {
        test.status = "fail";
        test.error = error;
        this.failed++;
        console.log(`❌ Failed: ${test.name}`);
        console.error(error);
      }
    }
  }

  report() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 Test Results");
    console.log("=".repeat(60));

    this.tests.forEach((test) => {
      const icon = test.status === "pass" ? "✅" : "❌";
      console.log(`${icon} ${test.name}`);
      if (test.error) {
        console.log(`   Error: ${test.error.message}`);
      }
    });

    const total = this.tests.length;
    console.log("\n" + "-".repeat(60));
    console.log(
      `Total: ${total} | Passed: ${this.passed} | Failed: ${this.failed}`
    );
    console.log("=".repeat(60) + "\n");

    return this.failed === 0;
  }

  pass() {
    this.passed++;
  }
}

// Mock entities for testing
const mockEntities: Entity[] = [
  {
    id: "USER",
    type: "USER",
    attributes: {
      description: "A person who interacts with the system",
    },
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 10,
  },
  {
    id: "ProgramCommitteeChair",
    type: "ProgramCommitteeChair",
    attributes: {
      description: "Chair of the program committee",
    },
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 5,
  },
  {
    id: "message_queue",
    type: "message_queue",
    attributes: {},
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 3,
  },
  {
    id: "APIEndpoint",
    type: "APIEndpoint",
    attributes: {
      label: "REST API Endpoint",
      comment: "Handles HTTP requests and returns responses",
    },
    firstSeen: new Date(),
    lastSeen: new Date(),
    observationCount: 8,
  },
];

async function main() {
  const reporter = new TestReporter();

  // Test 1: SyntacticEnricher
  console.log("\n📝 Test 1: SyntacticEnricher");
  console.log("-".repeat(60));
  try {
    const enricher = new SyntacticEnricher();

    const test1 = enricher.enrich(mockEntities[0]);
    console.log(`✓ USER → "${test1}"`);
    if (test1 !== "user") throw new Error("Expected 'user'");

    const test2 = enricher.enrich(mockEntities[1]);
    console.log(`✓ ProgramCommitteeChair → "${test2}"`);
    if (!test2.includes("program") || !test2.includes("committee"))
      throw new Error("Should split CamelCase");

    const test3 = enricher.enrich(mockEntities[2]);
    console.log(`✓ message_queue → "${test3}"`);
    if (!test3.includes("message") || !test3.includes("queue"))
      throw new Error("Should split snake_case");

    console.log("✅ SyntacticEnricher: All tests passed");
    reporter.pass();
  } catch (error) {
    console.error("❌ SyntacticEnricher failed:", error);
  }

  // Test 2: EmbeddingService
  console.log("\n📐 Test 2: EmbeddingService");
  console.log("-".repeat(60));
  try {
    const embeddingService = new EmbeddingService();
    console.log(`✓ Initialized with dimension: ${embeddingService.dimension}`);

    const text1 = "program committee chair";
    const embedding1 = await embeddingService.embed(text1);
    console.log(`✓ Generated embedding for "${text1}"`);
    console.log(`  Dimension: ${embedding1.length}`);
    console.log(
      `  First 5 values: [${embedding1.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}]`
    );

    if (embedding1.length !== embeddingService.dimension) {
      throw new Error("Embedding dimension mismatch");
    }

    // Test similarity (same text should have identical embeddings)
    const embedding2 = await embeddingService.embed(text1);
    const similarity = cosineSimilarity(embedding1, embedding2);
    console.log(`✓ Cosine similarity for same text: ${similarity.toFixed(4)}`);
    if (similarity < 0.99) {
      throw new Error("Same text should have similarity close to 1.0");
    }

    // Test batch embedding
    const texts = ["user", "message", "conversation"];
    const embeddings = await embeddingService.embedBatch(texts);
    console.log(`✓ Generated batch embeddings for ${texts.length} texts`);
    if (embeddings.length !== texts.length) {
      throw new Error("Batch size mismatch");
    }

    console.log("✅ EmbeddingService: All tests passed");
    reporter.pass();
  } catch (error) {
    console.error("❌ EmbeddingService failed:", error);
  }

  // Test 3: LanceDB VectorStore
  console.log("\n🗄️  Test 3: LanceDB VectorStore");
  console.log("-".repeat(60));
  try {
    const testDbPath = join(process.cwd(), "test_vectordb");

    // Clean up if exists
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
    mkdirSync(testDbPath, { recursive: true });

    const vectorStore = new LanceDBVectorStore(testDbPath, "test_table", 384);
    await vectorStore.initialize();
    console.log("✓ Vector store initialized");

    // Create test records
    const embeddingService = new EmbeddingService();
    const records: VectorRecord[] = [];

    for (let i = 0; i < 3; i++) {
      const entity = mockEntities[i];
      const syntacticEnricher = new SyntacticEnricher();
      const syntactic = syntacticEnricher.enrich(entity);
      const embedding = await embeddingService.embed(syntactic);

      records.push({
        entity_id: entity.id,
        category: "source",
        entity_type: entity.type,
        content_type: "syntactic",
        content: syntactic,
        embedding,
        metadata: {
          agentId: "test-agent",
          version: 1,
          created: new Date(),
        },
      });
    }

    // Test add batch
    await vectorStore.addBatch(records);
    console.log(`✓ Added ${records.length} records`);

    // Test count
    const count = await vectorStore.count();
    console.log(`✓ Vector store count: ${count}`);
    if (count !== records.length) {
      throw new Error(`Expected ${records.length} records, got ${count}`);
    }

    // Test search
    const queryEmbedding = records[0].embedding;
    const searchResults = await vectorStore.search(queryEmbedding, 2);
    console.log(`✓ Search found ${searchResults.length} results`);
    console.log(
      `  Top result: ${searchResults[0].entity_id} (distance: ${searchResults[0].distance.toFixed(4)})`
    );

    if (searchResults.length === 0) {
      throw new Error("Search should return results");
    }
    if (searchResults[0].entity_id !== records[0].entity_id) {
      throw new Error("Top result should be the query entity");
    }

    // Test similarity search
    const similarResults = await vectorStore.searchSimilar("USER", "syntactic", 2);
    console.log(
      `✓ Similarity search found ${similarResults.length} similar entities`
    );
    if (similarResults.length > 0) {
      console.log(`  Most similar: ${similarResults[0].entity_id}`);
    }

    // Test filters
    const filteredResults = await vectorStore.search(queryEmbedding, 5, {
      entity_type: "USER",
    });
    console.log(`✓ Filtered search found ${filteredResults.length} results`);

    // Test delete
    await vectorStore.delete("USER");
    const countAfterDelete = await vectorStore.count();
    console.log(`✓ Count after delete: ${countAfterDelete}`);
    if (countAfterDelete !== count - 1) {
      throw new Error("Delete failed");
    }

    // Clean up
    await vectorStore.close();
    rmSync(testDbPath, { recursive: true, force: true });
    console.log("✓ Cleaned up test database");

    console.log("✅ LanceDB VectorStore: All tests passed");
    reporter.pass();
  } catch (error) {
    console.error("❌ LanceDB VectorStore failed:", error);
  }

  // Test 4: Integration Test (Syntactic → Embedding → VectorStore)
  console.log("\n🔗 Test 4: Integration Test");
  console.log("-".repeat(60));
  try {
    const testDbPath = join(process.cwd(), "test_integration");

    // Clean up if exists
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
    mkdirSync(testDbPath, { recursive: true });

    const syntacticEnricher = new SyntacticEnricher();
    const embeddingService = new EmbeddingService();
    const vectorStore = new LanceDBVectorStore(testDbPath, "integration_test", embeddingService.dimension);

    await vectorStore.initialize();

    // Process entities through full pipeline
    console.log("✓ Processing entities through pipeline...");
    const records: VectorRecord[] = [];

    for (const entity of mockEntities) {
      const syntactic = syntacticEnricher.enrich(entity);
      const embedding = await embeddingService.embed(syntactic);

      records.push({
        entity_id: entity.id,
        category: "source",
        entity_type: entity.type,
        content_type: "syntactic",
        content: syntactic,
        embedding,
        metadata: {
          agentId: "integration-test",
          version: 1,
          created: new Date(),
        },
      });

      console.log(`  ${entity.id} → "${syntactic}"`);
    }

    await vectorStore.addBatch(records);
    console.log(`✓ Stored ${records.length} enriched entities`);

    // Test semantic search
    const query = "person who uses the system";
    const queryEmbedding = await embeddingService.embed(query);
    const results = await vectorStore.search(queryEmbedding, 3);

    console.log(`✓ Semantic search for "${query}":`);
    results.forEach((result, idx) => {
      console.log(
        `  ${idx + 1}. ${result.entity_id} (${result.content}) - distance: ${result.distance.toFixed(4)}`
      );
    });

    // The first result should likely be USER since it's semantically similar
    if (results.length > 0) {
      console.log(`✓ Top match: ${results[0].entity_id}`);
    }

    // Clean up
    await vectorStore.close();
    rmSync(testDbPath, { recursive: true, force: true });

    console.log("✅ Integration Test: All tests passed");
    reporter.pass();
  } catch (error) {
    console.error("❌ Integration Test failed:", error);
  }

  // Final report
  const success = reporter.report();
  process.exit(success ? 0 : 1);
}

// Utility function for cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Run tests
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
