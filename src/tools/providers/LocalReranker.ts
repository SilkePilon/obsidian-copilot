/**
 * Local Reranking System
 * Uses the user's embedding model to rerank search results locally
 * No external API calls required
 */

import EmbeddingManager from "@/LLMProviders/embeddingManager";
import { logError, logInfo } from "@/logger";
import { getSettings } from "@/settings/model";
import { Document } from "@langchain/core/documents";

export interface RerankResult {
  index: number;
  relevance_score: number;
}

export interface LocalRerankResponse {
  response: {
    data: RerankResult[];
    model: string;
    usage: {
      total_tokens: number;
    };
  };
  elapsed_time_ms: number;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Rerank documents using local embeddings
 * Computes embeddings for the query and all documents, then ranks by cosine similarity
 */
export async function localRerank(
  query: string,
  documents: string[]
): Promise<LocalRerankResponse> {
  const startTime = Date.now();
  const settings = getSettings();

  try {
    // Get the embedding model
    const embeddingInstance = await EmbeddingManager.getInstance().getEmbeddingsAPI();

    if (!embeddingInstance) {
      throw new Error("No embedding model configured. Please configure an embedding model in settings.");
    }

    logInfo(`Local reranking ${documents.length} documents with embedding model`);

    // Get query embedding
    const queryEmbedding = await embeddingInstance.embedQuery(query);

    // Get document embeddings in batch
    const documentEmbeddings = await embeddingInstance.embedDocuments(documents);

    // Calculate similarity scores
    const scoredDocuments: RerankResult[] = documents.map((_, index) => {
      const similarity = cosineSimilarity(queryEmbedding, documentEmbeddings[index]);
      // Convert cosine similarity to a 0-1 relevance score
      // Cosine similarity ranges from -1 to 1, we normalize to 0-1
      const relevanceScore = (similarity + 1) / 2;
      return {
        index,
        relevance_score: relevanceScore,
      };
    });

    // Sort by relevance score descending
    scoredDocuments.sort((a, b) => b.relevance_score - a.relevance_score);

    const elapsedTime = Date.now() - startTime;
    logInfo(`Local reranking completed in ${elapsedTime}ms`);

    return {
      response: {
        data: scoredDocuments,
        model: settings.embeddingModelKey || "local",
        usage: {
          total_tokens: documents.reduce((sum, doc) => sum + doc.length / 4, 0), // Rough estimate
        },
      },
      elapsed_time_ms: elapsedTime,
    };
  } catch (error) {
    logError("Local reranking failed:", error);
    
    // Fallback: return documents in original order with equal scores
    const elapsedTime = Date.now() - startTime;
    return {
      response: {
        data: documents.map((_, index) => ({
          index,
          relevance_score: 1 - index * 0.01, // Slightly decreasing scores
        })),
        model: "fallback",
        usage: { total_tokens: 0 },
      },
      elapsed_time_ms: elapsedTime,
    };
  }
}

/**
 * Rerank LangChain documents using local embeddings
 */
export async function rerankDocuments(
  query: string,
  documents: Document[]
): Promise<Document[]> {
  if (documents.length === 0) return documents;

  const contents = documents.map((doc) => doc.pageContent.slice(0, 3000)); // Limit content length
  const rerankResult = await localRerank(query, contents);

  // Reorder documents based on rerank scores
  return rerankResult.response.data.map((item) => ({
    ...documents[item.index],
    metadata: {
      ...documents[item.index].metadata,
      rerank_score: item.relevance_score,
    },
  }));
}

/**
 * Settings for local reranking
 */
export interface LocalRerankSettings {
  /** Whether to use local reranking instead of API */
  useLocalReranking: boolean;
  /** Minimum similarity threshold for including results */
  minSimilarityThreshold: number;
}

export const DEFAULT_RERANK_SETTINGS: LocalRerankSettings = {
  useLocalReranking: true,
  minSimilarityThreshold: 0.3,
};
