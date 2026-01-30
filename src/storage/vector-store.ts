import { VectorRecord } from "../types";

/**
 * VectorStore: Abstract interface for vector similarity search
 * Supports different backends (LanceDB, ChromaDB, etc.)
 */

export interface SearchFilters {
  entity_type?: string;
  category?: "source" | "target";
  content_type?: "syntactic" | "lexical" | "semantic";
  agentId?: string;
}

export interface SearchResult extends VectorRecord {
  distance: number; // Similarity distance (lower is more similar for L2, higher for cosine)
}

export abstract class VectorStore {
  abstract dimension: number;

  /**
   * Initialize the vector store
   */
  abstract initialize(): Promise<void>;

  /**
   * Add a single vector record
   */
  abstract add(record: VectorRecord): Promise<void>;

  /**
   * Add multiple vector records
   */
  abstract addBatch(records: VectorRecord[]): Promise<void>;

  /**
   * Search for similar vectors using a query vector
   */
  abstract search(
    query: number[],
    topK: number,
    filters?: SearchFilters
  ): Promise<SearchResult[]>;

  /**
   * Search for similar entities to a given entity
   */
  abstract searchSimilar(
    entityId: string,
    contentType: "syntactic" | "lexical" | "semantic",
    topK: number,
    filters?: SearchFilters
  ): Promise<SearchResult[]>;

  /**
   * Delete all records for an entity
   */
  abstract delete(entityId: string): Promise<void>;

  /**
   * Delete all records matching filters
   */
  abstract deleteByFilter(filters: SearchFilters): Promise<void>;

  /**
   * Clear all records
   */
  abstract clear(): Promise<void>;

  /**
   * Get count of records
   */
  abstract count(): Promise<number>;

  /**
   * Close the vector store
   */
  abstract close(): Promise<void>;
}
