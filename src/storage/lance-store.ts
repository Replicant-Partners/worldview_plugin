import { connect, Connection, Table } from "@lancedb/lancedb";
import { VectorRecord } from "../types";
import { VectorStore, SearchFilters, SearchResult } from "./vector-store";
import { elizaLogger } from "@ai16z/eliza";
import { join } from "path";

/**
 * LanceDBVectorStore: LanceDB implementation of VectorStore
 * Embedded vector database with excellent performance
 */

export class LanceDBVectorStore extends VectorStore {
  private db: Connection | null = null;
  private table: Table | null = null;
  private tableName: string;
  public dimension: number;

  constructor(
    private dbPath: string,
    tableName: string = "worldview_vectors",
    dimension: number = 1536,
  ) {
    super();
    this.tableName = tableName;
    this.dimension = dimension;
  }

  async initialize(): Promise<void> {
    try {
      // Connect to LanceDB
      this.db = await connect(this.dbPath);
      elizaLogger.info("[LanceDBVectorStore] Connected to database", {
        path: this.dbPath,
      });

      // Check if table exists
      const tableNames = await this.db.tableNames();

      if (tableNames.includes(this.tableName)) {
        // Open existing table
        this.table = await this.db.openTable(this.tableName);
        elizaLogger.info("[LanceDBVectorStore] Opened existing table", {
          table: this.tableName,
        });
      } else {
        // Create new table with schema
        // Initialize with empty array to avoid schema issues
        this.table = await this.db.createTable(this.tableName, [
          {
            entity_id: "placeholder",
            category: "source",
            entity_type: "PLACEHOLDER",
            content_type: "syntactic",
            content: "placeholder",
            embedding: new Array(this.dimension).fill(0),
            agentId: "init",
            version: 0,
            created: new Date().toISOString(),
          },
        ]);

        // Delete the placeholder row
        await this.table.delete("entity_id = 'placeholder'");

        elizaLogger.info("[LanceDBVectorStore] Created new table", {
          table: this.tableName,
        });
      }
    } catch (error) {
      elizaLogger.error("[LanceDBVectorStore] Initialization failed", {
        error,
      });
      throw error;
    }
  }

  async add(record: VectorRecord): Promise<void> {
    if (!this.table) {
      throw new Error("VectorStore not initialized");
    }

    try {
      // LanceDB expects plain objects with Date as ISO strings
      const data = {
        entity_id: record.entity_id,
        category: record.category,
        entity_type: record.entity_type,
        content_type: record.content_type,
        content: record.content,
        embedding: record.embedding,
        agentId: record.metadata.agentId,
        version: record.metadata.version,
        created: record.metadata.created.toISOString(),
      };

      await this.table.add([data]);
    } catch (error) {
      elizaLogger.error("[LanceDBVectorStore] Failed to add record", {
        entity_id: record.entity_id,
        error,
      });
      throw error;
    }
  }

  async addBatch(records: VectorRecord[]): Promise<void> {
    if (!this.table) {
      throw new Error("VectorStore not initialized");
    }

    if (records.length === 0) return;

    try {
      const data = records.map((record) => ({
        entity_id: record.entity_id,
        category: record.category,
        entity_type: record.entity_type,
        content_type: record.content_type,
        content: record.content,
        embedding: record.embedding,
        agentId: record.metadata.agentId,
        version: record.metadata.version,
        created: record.metadata.created.toISOString(),
      }));

      await this.table.add(data);

      elizaLogger.debug("[LanceDBVectorStore] Batch added", {
        count: records.length,
      });
    } catch (error) {
      elizaLogger.error("[LanceDBVectorStore] Failed to add batch", {
        count: records.length,
        error,
      });
      throw error;
    }
  }

  async search(
    query: number[],
    topK: number,
    filters?: SearchFilters,
  ): Promise<SearchResult[]> {
    if (!this.table) {
      throw new Error("VectorStore not initialized");
    }

    try {
      let queryBuilder = this.table.search(query).limit(topK);

      // Apply filters
      if (filters) {
        const filterConditions: string[] = [];

        if (filters.entity_type) {
          filterConditions.push(`entity_type = '${filters.entity_type}'`);
        }
        if (filters.category) {
          filterConditions.push(`category = '${filters.category}'`);
        }
        if (filters.content_type) {
          filterConditions.push(`content_type = '${filters.content_type}'`);
        }
        if (filters.agentId) {
          filterConditions.push(`agentId = '${filters.agentId}'`);
        }

        if (filterConditions.length > 0) {
          queryBuilder = queryBuilder.where(filterConditions.join(" AND "));
        }
      }

      const results = await queryBuilder.toArray();

      return results.map((row: any) => ({
        entity_id: row.entity_id,
        category: row.category,
        entity_type: row.entity_type,
        content_type: row.content_type,
        content: row.content,
        embedding: row.embedding,
        metadata: {
          agentId: row.agentId,
          version: row.version,
          created: new Date(row.created),
        },
        distance: row._distance || 0,
      }));
    } catch (error) {
      elizaLogger.error("[LanceDBVectorStore] Search failed", {
        topK,
        filters,
        error,
      });
      throw error;
    }
  }

  async searchSimilar(
    entityId: string,
    contentType: "syntactic" | "lexical" | "semantic",
    topK: number,
    filters?: SearchFilters,
  ): Promise<SearchResult[]> {
    if (!this.table) {
      throw new Error("VectorStore not initialized");
    }

    try {
      // First, get the embedding for the entity
      // Use query() to get a Query object that supports where()
      const entityQuery = await this.table
        .query()
        .where(`entity_id = '${entityId}' AND content_type = '${contentType}'`)
        .limit(1)
        .toArray();

      if (entityQuery.length === 0) {
        elizaLogger.warn(
          "[LanceDBVectorStore] Entity not found for similarity search",
          {
            entityId,
            contentType,
          },
        );
        return [];
      }

      const queryEmbedding = entityQuery[0].embedding;

      // Search for similar vectors, excluding the query entity itself
      const extendedFilters = {
        ...filters,
        content_type: contentType,
      };

      const results = await this.search(
        queryEmbedding,
        topK + 1,
        extendedFilters,
      );

      // Filter out the query entity
      return results.filter((r) => r.entity_id !== entityId).slice(0, topK);
    } catch (error) {
      elizaLogger.error("[LanceDBVectorStore] Similarity search failed", {
        entityId,
        contentType,
        error,
      });
      throw error;
    }
  }

  async delete(entityId: string): Promise<void> {
    if (!this.table) {
      throw new Error("VectorStore not initialized");
    }

    try {
      await this.table.delete(`entity_id = '${entityId}'`);
      elizaLogger.debug("[LanceDBVectorStore] Deleted entity", { entityId });
    } catch (error) {
      elizaLogger.error("[LanceDBVectorStore] Failed to delete entity", {
        entityId,
        error,
      });
      throw error;
    }
  }

  async deleteByFilter(filters: SearchFilters): Promise<void> {
    if (!this.table) {
      throw new Error("VectorStore not initialized");
    }

    try {
      const filterConditions: string[] = [];

      if (filters.entity_type) {
        filterConditions.push(`entity_type = '${filters.entity_type}'`);
      }
      if (filters.category) {
        filterConditions.push(`category = '${filters.category}'`);
      }
      if (filters.content_type) {
        filterConditions.push(`content_type = '${filters.content_type}'`);
      }
      if (filters.agentId) {
        filterConditions.push(`agentId = '${filters.agentId}'`);
      }

      if (filterConditions.length > 0) {
        await this.table.delete(filterConditions.join(" AND "));
        elizaLogger.debug("[LanceDBVectorStore] Deleted by filter", {
          filters,
        });
      }
    } catch (error) {
      elizaLogger.error("[LanceDBVectorStore] Failed to delete by filter", {
        filters,
        error,
      });
      throw error;
    }
  }

  async clear(): Promise<void> {
    if (!this.table) {
      throw new Error("VectorStore not initialized");
    }

    try {
      // Delete all rows
      await this.table.delete("entity_id IS NOT NULL");
      elizaLogger.info("[LanceDBVectorStore] Cleared all records");
    } catch (error) {
      elizaLogger.error("[LanceDBVectorStore] Failed to clear", { error });
      throw error;
    }
  }

  async count(): Promise<number> {
    if (!this.table) {
      throw new Error("VectorStore not initialized");
    }

    try {
      const result = await this.table.countRows();
      return result;
    } catch (error) {
      elizaLogger.error("[LanceDBVectorStore] Failed to count", { error });
      throw error;
    }
  }

  async close(): Promise<void> {
    // LanceDB connections are automatically managed
    this.table = null;
    this.db = null;
    elizaLogger.info("[LanceDBVectorStore] Closed");
  }
}
