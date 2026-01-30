import { IAgentRuntime, elizaLogger } from "@elizaos/core";

/**
 * EmbeddingService: Generate vector embeddings for text
 * Supports different embedding providers (OpenAI, local models, etc.)
 */

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimension: number;
}

/**
 * OpenAI Embedding Provider
 * Supports multiple OpenAI embedding models:
 * - text-embedding-3-large (3072 dimensions, best quality)
 * - text-embedding-3-small (1536 dimensions, balanced)
 * - text-embedding-ada-002 (1536 dimensions, legacy)
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  dimension: number;

  constructor(
    private apiKey: string,
    private model: string = "text-embedding-3-large",
  ) {
    // Set dimension based on model
    this.dimension = this.getModelDimension(model);
  }

  private getModelDimension(model: string): number {
    switch (model) {
      case "text-embedding-3-large":
        return 3072;
      case "text-embedding-3-small":
      case "text-embedding-ada-002":
        return 1536;
      default:
        elizaLogger.warn(
          `[OpenAIEmbedding] Unknown model ${model}, defaulting to 3072 dimensions`,
        );
        return 3072;
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data: any = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      elizaLogger.error("[OpenAIEmbedding] Error generating embedding", {
        error,
      });
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data: any = await response.json();
      return data.data.map((item: any) => item.embedding);
    } catch (error) {
      elizaLogger.error("[OpenAIEmbedding] Error generating batch embeddings", {
        error,
      });
      throw error;
    }
  }
}

/**
 * Simple Embedding Provider (fallback)
 * Uses basic TF-IDF-like approach when no API key available
 * Returns fixed-dimension vectors based on text features
 */
export class SimpleEmbeddingProvider implements EmbeddingProvider {
  dimension = 384; // Smaller dimension for simple embeddings

  async embed(text: string): Promise<number[]> {
    // Simple hash-based embedding (for fallback/testing)
    const embedding = new Array(this.dimension).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    words.forEach((word, idx) => {
      for (let i = 0; i < word.length; i++) {
        const charCode = word.charCodeAt(i);
        const position = (charCode * (idx + 1)) % this.dimension;
        embedding[position] += 1;
      }
    });

    // Normalize
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0),
    );
    return embedding.map((val) => (magnitude > 0 ? val / magnitude : 0));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

/**
 * EmbeddingService: Main service for generating embeddings
 */
export class EmbeddingService {
  private provider: EmbeddingProvider;

  constructor(runtime?: IAgentRuntime, model?: string) {
    // Try to use OpenAI if API key available
    const openaiKey =
      runtime?.getSetting("OPENAI_API_KEY") || process.env.OPENAI_API_KEY;

    // Get model from parameter, environment, or use default
    const embeddingModel =
      model ||
      runtime?.getSetting("WORLDVIEW_EMBEDDING_MODEL") ||
      process.env.WORLDVIEW_EMBEDDING_MODEL ||
      "text-embedding-3-large";

    if (openaiKey) {
      this.provider = new OpenAIEmbeddingProvider(openaiKey, embeddingModel);
      elizaLogger.info(`[EmbeddingService] Using OpenAI embeddings`, {
        model: embeddingModel,
        dimension: this.provider.dimension,
      });
    } else {
      this.provider = new SimpleEmbeddingProvider();
      elizaLogger.warn(
        "[EmbeddingService] No OpenAI key found, using simple embeddings (384 dimensions)",
      );
    }
  }

  /**
   * Generate embedding for single text
   */
  async embed(text: string): Promise<number[]> {
    return this.provider.embed(text);
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.provider.embedBatch(texts);
  }

  /**
   * Get embedding dimension
   */
  get dimension(): number {
    return this.provider.dimension;
  }

  /**
   * Set custom provider
   */
  setProvider(provider: EmbeddingProvider): void {
    this.provider = provider;
    elizaLogger.info("[EmbeddingService] Provider updated", {
      dimension: provider.dimension,
    });
  }
}
