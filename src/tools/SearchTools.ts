import { getStandaloneQuestion } from "@/chainUtils";
import { TEXT_WEIGHT } from "@/constants";
import { logInfo } from "@/logger";
import { getSettings } from "@/settings/model";
import { z } from "zod";
import { deduplicateSources } from "@/LLMProviders/chainRunner/utils/toolExecution";
import { createTool, SimpleTool } from "./SimpleTool";
import { RETURN_ALL_LIMIT } from "@/search/v3/SearchCore";
import { getWebSearchCitationInstructions } from "@/LLMProviders/chainRunner/utils/citationUtils";
import { performWebSearch } from "@/tools/providers/WebSearchProvider";

/**
 * Check if a file path should be excluded from vault search based on configured patterns.
 * Supports exact path matching and regex patterns.
 */
function isPathExcluded(filePath: string, excludedPatterns: string[]): boolean {
  if (!excludedPatterns || excludedPatterns.length === 0) {
    return false;
  }

  for (const pattern of excludedPatterns) {
    // Try as regex first (if it looks like a regex pattern)
    if (pattern.startsWith("/") || pattern.includes("*") || pattern.includes("\\")) {
      try {
        // Remove leading/trailing slashes if present (for regex patterns like /pattern/)
        const regexPattern = pattern.startsWith("/") && pattern.endsWith("/") 
          ? pattern.slice(1, -1) 
          : pattern.replace(/\*/g, ".*"); // Convert glob-style * to regex .*
        
        const regex = new RegExp(regexPattern);
        if (regex.test(filePath)) {
          return true;
        }
      } catch (e) {
        // Invalid regex, fall through to exact match
      }
    }

    // Exact path or folder match
    // Check if file path starts with the pattern (for folder exclusions)
    // or equals the pattern (for file exclusions)
    if (filePath === pattern || filePath.startsWith(pattern + "/") || filePath.startsWith(pattern + "\\")) {
      return true;
    }
  }

  return false;
}

// Define Zod schema for localSearch
const localSearchSchema = z.object({
  query: z.string().min(1).describe("The search query"),
  salientTerms: z.array(z.string()).describe("List of salient terms extracted from the query"),
  timeRange: z
    .object({
      startTime: z.any(), // TimeInfo type
      endTime: z.any(), // TimeInfo type
    })
    .optional()
    .describe("Time range for search"),
});

// Local search tool using Search v3 (optionally merged with semantic retrieval)
const lexicalSearchTool = createTool({
  name: "lexicalSearch",
  description: "Search for notes using lexical/keyword-based search",
  schema: localSearchSchema,
  handler: async ({ timeRange, query, salientTerms }) => {
    const settings = getSettings();

    const tagTerms = salientTerms.filter((term) => term.startsWith("#"));
    const returnAll = timeRange !== undefined;
    const returnAllTags = tagTerms.length > 0;
    const shouldReturnAll = returnAll || returnAllTags;
    const effectiveMaxK = shouldReturnAll ? RETURN_ALL_LIMIT : settings.maxSourceChunks;

    logInfo(`lexicalSearch returnAll: ${returnAll} (tags returnAll: ${returnAllTags})`);

    const retrieverOptions = {
      minSimilarityScore: shouldReturnAll ? 0.0 : 0.1,
      maxK: effectiveMaxK,
      salientTerms,
      timeRange: timeRange
        ? {
            startTime: timeRange.startTime.epoch,
            endTime: timeRange.endTime.epoch,
          }
        : undefined,
      textWeight: TEXT_WEIGHT,
      returnAll,
      useRerankerThreshold: 0.5,
      returnAllTags,
      tagTerms,
    };

    const retriever = settings.enableSemanticSearchV3
      ? new (await import("@/search/v3/MergedSemanticRetriever")).MergedSemanticRetriever(
          app,
          retrieverOptions
        )
      : new (await import("@/search/v3/TieredLexicalRetriever")).TieredLexicalRetriever(
          app,
          retrieverOptions
        );

    const documents = await retriever.getRelevantDocuments(query);

    logInfo(`lexicalSearch found ${documents.length} documents for query: "${query}"`);
    if (timeRange) {
      logInfo(
        `Time range search from ${new Date(timeRange.startTime.epoch).toISOString()} to ${new Date(timeRange.endTime.epoch).toISOString()}`
      );
    }

    // Filter out excluded paths
    const excludedPatterns = settings.vaultSearchExcludedPaths || [];
    const filteredDocuments = documents.filter(doc => {
      const path = doc.metadata.path || "";
      const excluded = isPathExcluded(path, excludedPatterns);
      if (excluded) {
        logInfo(`Excluding document from search results: ${path}`);
      }
      return !excluded;
    });

    logInfo(`After exclusion filtering: ${filteredDocuments.length} documents remaining`);

    const formattedResults = filteredDocuments.map((doc) => {
      const scored = doc.metadata.rerank_score ?? doc.metadata.score ?? 0;
      return {
        title: doc.metadata.title || "Untitled",
        content: doc.pageContent,
        path: doc.metadata.path || "",
        score: scored,
        rerank_score: scored,
        includeInContext: doc.metadata.includeInContext ?? true,
        source: doc.metadata.source,
        mtime: doc.metadata.mtime ?? null,
        ctime: doc.metadata.ctime ?? null,
        chunkId: (doc.metadata as any).chunkId ?? null,
        isChunk: (doc.metadata as any).isChunk ?? false,
        explanation: doc.metadata.explanation ?? null,
      };
    });
    // Reuse the same dedupe logic used by Show Sources (path fallback to title, keep highest score)
    const sourcesLike = formattedResults.map((d) => ({
      title: d.title || d.path || "Untitled",
      path: d.path || d.title || "",
      score: d.rerank_score || d.score || 0,
    }));
    const dedupedSources = deduplicateSources(sourcesLike);

    // Map back to document objects in the same deduped order
    const bestByKey = new Map<string, any>();
    for (const d of formattedResults) {
      const key = (d.path || d.title).toLowerCase();
      const existing = bestByKey.get(key);
      if (!existing || (d.rerank_score || 0) > (existing.rerank_score || 0)) {
        bestByKey.set(key, d);
      }
    }
    const dedupedDocs = dedupedSources
      .map((s) => bestByKey.get((s.path || s.title).toLowerCase()))
      .filter(Boolean);

    return JSON.stringify({ type: "local_search", documents: dedupedDocs });
  },
});

// Semantic search tool using Orama-based HybridRetriever
const semanticSearchTool = createTool({
  name: "semanticSearch",
  description: "Search for notes using semantic/meaning-based search with embeddings",
  schema: localSearchSchema,
  handler: async ({ timeRange, query, salientTerms }) => {
    const settings = getSettings();

    const returnAll = timeRange !== undefined;
    const effectiveMaxK = returnAll
      ? Math.max(settings.maxSourceChunks, 200)
      : settings.maxSourceChunks;

    logInfo(`semanticSearch returnAll: ${returnAll}`);

    // Always use HybridRetriever for semantic search
    const retriever = new (await import("@/search/hybridRetriever")).HybridRetriever({
      minSimilarityScore: returnAll ? 0.0 : 0.1,
      maxK: effectiveMaxK,
      salientTerms,
      timeRange: timeRange
        ? {
            startTime: timeRange.startTime.epoch,
            endTime: timeRange.endTime.epoch,
          }
        : undefined,
      textWeight: TEXT_WEIGHT,
      returnAll: returnAll,
      useRerankerThreshold: 0.5,
    });

    const documents = await retriever.getRelevantDocuments(query);

    logInfo(`semanticSearch found ${documents.length} documents for query: "${query}"`);
    if (timeRange) {
      logInfo(
        `Time range search from ${new Date(timeRange.startTime.epoch).toISOString()} to ${new Date(timeRange.endTime.epoch).toISOString()}`
      );
    }

    // Filter out excluded paths
    const excludedPatterns = settings.vaultSearchExcludedPaths || [];
    const filteredDocuments = documents.filter(doc => {
      const path = doc.metadata.path || "";
      const excluded = isPathExcluded(path, excludedPatterns);
      if (excluded) {
        logInfo(`Excluding document from search results: ${path}`);
      }
      return !excluded;
    });

    logInfo(`After exclusion filtering: ${filteredDocuments.length} documents remaining`);

    const formattedResults = filteredDocuments.map((doc) => {
      const scored = doc.metadata.rerank_score ?? doc.metadata.score ?? 0;
      return {
        title: doc.metadata.title || "Untitled",
        content: doc.pageContent,
        path: doc.metadata.path || "",
        score: scored,
        rerank_score: scored,
        includeInContext: doc.metadata.includeInContext ?? true,
        source: doc.metadata.source,
        mtime: doc.metadata.mtime ?? null,
        ctime: doc.metadata.ctime ?? null,
        chunkId: (doc.metadata as any).chunkId ?? null,
        isChunk: (doc.metadata as any).isChunk ?? false,
        explanation: doc.metadata.explanation ?? null,
      };
    });
    // Reuse the same dedupe logic used by Show Sources
    const sourcesLike = formattedResults.map((d) => ({
      title: d.title || d.path || "Untitled",
      path: d.path || d.title || "",
      score: d.rerank_score || d.score || 0,
    }));
    const dedupedSources = deduplicateSources(sourcesLike);

    const bestByKey = new Map<string, any>();
    for (const d of formattedResults) {
      const key = (d.path || d.title).toLowerCase();
      const existing = bestByKey.get(key);
      if (!existing || (d.rerank_score || 0) > (existing.rerank_score || 0)) {
        bestByKey.set(key, d);
      }
    }
    const dedupedDocs = dedupedSources
      .map((s) => bestByKey.get((s.path || s.title).toLowerCase()))
      .filter(Boolean);

    return JSON.stringify({ type: "local_search", documents: dedupedDocs });
  },
});

// Smart wrapper that delegates to either lexical or semantic search based on settings
const localSearchTool = createTool({
  name: "localSearch",
  description: "Search for notes based on the time range and query",
  schema: localSearchSchema,
  handler: async ({ timeRange, query, salientTerms }) => {
    const settings = getSettings();

    logInfo(
      `localSearch delegating to ${settings.enableSemanticSearchV3 ? "semantic" : "lexical"} search`
    );

    const tagTerms = salientTerms.filter((term) => term.startsWith("#"));
    const shouldForceLexical = timeRange !== undefined || tagTerms.length > 0;

    // Delegate to appropriate search tool based on settings
    return shouldForceLexical || !settings.enableSemanticSearchV3
      ? await lexicalSearchTool.call({ timeRange, query, salientTerms })
      : await semanticSearchTool.call({ timeRange, query, salientTerms });
  },
});

// Note: indexTool behavior depends on which retriever is active
const indexTool = createTool({
  name: "indexVault",
  description: "Index the vault to the Copilot index",
  schema: z.void(), // No parameters
  handler: async () => {
    const settings = getSettings();
    if (settings.enableSemanticSearchV3) {
      // Semantic search uses persistent Orama index - trigger actual indexing
      try {
        const VectorStoreManager = (await import("@/search/vectorStoreManager")).default;
        const count = await VectorStoreManager.getInstance().indexVaultToVectorStore();
        const indexResultPrompt = `Semantic search index refreshed with ${count} documents.\n`;
        return (
          indexResultPrompt +
          JSON.stringify({
            success: true,
            message: `Semantic search index has been refreshed with ${count} documents.`,
            documentCount: count,
          })
        );
      } catch (error) {
        return JSON.stringify({
          success: false,
          message: `Failed to index with semantic search: ${error.message}`,
        });
      }
    } else {
      // V3 search builds indexes on demand
      const indexResultPrompt = `The tiered lexical retriever builds indexes on demand and doesn't require manual indexing.\n`;
      return (
        indexResultPrompt +
        JSON.stringify({
          success: true,
          message: "Tiered lexical retriever uses on-demand indexing. No manual indexing required.",
        })
      );
    }
  },
  isBackground: true,
});

// Define Zod schema for webSearch
const webSearchSchema = z.object({
  query: z.string().min(1).describe("The search query"),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .describe("Previous conversation turns"),
});

// Add new web search tool
const webSearchTool = createTool({
  name: "webSearch",
  description: "Search the web for information",
  schema: webSearchSchema,
  handler: async ({ query, chatHistory }) => {
    try {
      // Get standalone question considering chat history
      const standaloneQuestion = await getStandaloneQuestion(query, chatHistory);

      const response = await performWebSearch(standaloneQuestion);
      
      // Check if search failed (empty results with error message in answer)
      if (response.results.length === 0 && response.answer) {
        // Provider not configured or search failed - return friendly error
        return JSON.stringify([{
          type: "web_search",
          error: response.answer,
          content: response.answer,
          citations: [],
        }]);
      }
      
      // Build citations from results
      const citations = response.results.map((r, i) => `[${i + 1}] ${r.url}`);

      // Build content from answer and results
      let webContent = "";
      if (response.answer) {
        webContent = response.answer + "\n\n";
      }
      
      // Add search results as context
      webContent += response.results
        .map((r, i) => `[${i + 1}] **${r.title}**\n${r.snippet}`)
        .join("\n\n");

      // Return structured JSON response for consistency with other tools
      const formattedResults = [
        {
          type: "web_search",
          content: webContent,
          citations: citations,
          // Instruct the model to use footnote-style citations and definitions.
          instruction: getWebSearchCitationInstructions(),
        },
      ];

      return JSON.stringify(formattedResults);
    } catch (error) {
      return JSON.stringify([{
        type: "web_search",
        error: error instanceof Error ? error.message : "Web search failed",
        content: error instanceof Error ? error.message : "Web search failed with unknown error",
        citations: [],
      }]);
    }
  },
});

export { indexTool, lexicalSearchTool, localSearchTool, semanticSearchTool, webSearchTool };
export type { SimpleTool };
