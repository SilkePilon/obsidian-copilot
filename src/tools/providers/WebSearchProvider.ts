/**
 * Web Search provider system
 * Allows users to select different providers for web search
 */

import { logError, logInfo } from "@/logger";
import { getSettings } from "@/settings/model";
import { requestUrl } from "obsidian";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  query: string;
  answer?: string; // Some providers return an AI-generated answer
}

export interface WebSearchProvider {
  name: string;
  displayName: string;
  description: string;
  requiresApiKey: boolean;
  apiKeyUrl?: string;
  search(query: string): Promise<WebSearchResponse>;
}

/**
 * Get the API key for a specific web search provider
 * Checks per-provider keys first, then falls back to legacy single key
 */
function getWebSearchApiKey(providerName: string): string {
  const settings = getSettings();
  return settings.webSearchApiKeys?.[providerName] || settings.webSearchApiKey || "";
}

/**
 * Tavily Search Provider
 * https://tavily.com - AI-powered search API
 */
class TavilyProvider implements WebSearchProvider {
  name = "tavily";
  displayName = "Tavily Search";
  description = "AI-powered search API optimized for LLMs. Free tier: 1000 searches/month.";
  requiresApiKey = true;
  apiKeyUrl = "https://app.tavily.com/home";

  async search(query: string): Promise<WebSearchResponse> {
    const apiKey = getWebSearchApiKey("tavily");

    if (!apiKey) {
      throw new Error("Tavily API key not configured. Get one at https://app.tavily.com");
    }

    const response = await requestUrl({
      url: "https://api.tavily.com/search",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: query,
        search_depth: "advanced",
        include_answer: true,
        include_raw_content: false,
        max_results: 10,
      }),
      throw: false,
    });

    if (response.status !== 200) {
      const errorMsg = response.text || JSON.stringify(response.json);
      throw new Error(`Tavily API error (${response.status}): ${errorMsg}`);
    }

    const data = response.json;

    return {
      query,
      answer: data.answer,
      results: (data.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        content: r.raw_content,
      })),
    };
  }
}

/**
 * Brave Search Provider
 * https://brave.com/search/api/
 */
class BraveSearchProvider implements WebSearchProvider {
  name = "brave";
  displayName = "Brave Search";
  description = "Privacy-focused search API. Free tier: 2000 searches/month.";
  requiresApiKey = true;
  apiKeyUrl = "https://brave.com/search/api/";

  async search(query: string): Promise<WebSearchResponse> {
    const apiKey = getWebSearchApiKey("brave");

    if (!apiKey) {
      throw new Error("Brave Search API key not configured. Get one at https://brave.com/search/api/");
    }

    const response = await requestUrl({
      url: `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
      throw: false,
    });

    if (response.status !== 200) {
      const errorMsg = response.text || JSON.stringify(response.json);
      throw new Error(`Brave Search API error (${response.status}): ${errorMsg}`);
    }

    const data = response.json;

    return {
      query,
      results: (data.web?.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      })),
    };
  }
}

/**
 * SerpAPI Provider
 * https://serpapi.com - Google Search API
 */
class SerpAPIProvider implements WebSearchProvider {
  name = "serpapi";
  displayName = "SerpAPI (Google)";
  description = "Google Search results via SerpAPI. Free tier: 100 searches/month.";
  requiresApiKey = true;
  apiKeyUrl = "https://serpapi.com/manage-api-key";

  async search(query: string): Promise<WebSearchResponse> {
    const apiKey = getWebSearchApiKey("serpapi");

    if (!apiKey) {
      throw new Error("SerpAPI key not configured. Get one at https://serpapi.com");
    }

    const response = await requestUrl({
      url: `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=10`,
      method: "GET",
      throw: false,
    });

    if (response.status !== 200) {
      const errorMsg = response.text || JSON.stringify(response.json);
      throw new Error(`SerpAPI error (${response.status}): ${errorMsg}`);
    }

    const data = response.json;

    return {
      query,
      answer: data.answer_box?.answer || data.answer_box?.snippet,
      results: (data.organic_results || []).map((r: any) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      })),
    };
  }
}

/**
 * Serper.dev Provider
 * https://serper.dev - Fast Google Search API
 */
class SerperProvider implements WebSearchProvider {
  name = "serper";
  displayName = "Serper.dev (Google)";
  description = "Fast Google Search API. Free tier: 2500 searches.";
  requiresApiKey = true;
  apiKeyUrl = "https://serper.dev/api-key";

  async search(query: string): Promise<WebSearchResponse> {
    const apiKey = getWebSearchApiKey("serper");

    if (!apiKey) {
      throw new Error("Serper API key not configured. Get one at https://serper.dev");
    }

    const response = await requestUrl({
      url: "https://google.serper.dev/search",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q: query,
        num: 10,
      }),
      throw: false,
    });

    if (response.status !== 200) {
      const errorMsg = response.text || JSON.stringify(response.json);
      throw new Error(`Serper API error (${response.status}): ${errorMsg}`);
    }

    const data = response.json;

    return {
      query,
      answer: data.answerBox?.answer || data.answerBox?.snippet,
      results: (data.organic || []).map((r: any) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      })),
    };
  }
}

/**
 * Searxng Provider (Self-hosted)
 * Users can run their own Searxng instance
 */
class SearxngProvider implements WebSearchProvider {
  name = "searxng";
  displayName = "SearXNG (Self-hosted)";
  description = "Privacy-respecting metasearch engine. Use your own instance.";
  requiresApiKey = false;

  async search(query: string): Promise<WebSearchResponse> {
    const settings = getSettings();
    const baseUrl = settings.webSearchBaseUrl;

    if (!baseUrl) {
      throw new Error(
        "SearXNG base URL not configured. Please set the URL of your SearXNG instance in settings."
      );
    }

    const response = await requestUrl({
      url: `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json`,
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      throw: false,
    });

    if (response.status !== 200) {
      const errorMsg = response.text || JSON.stringify(response.json);
      throw new Error(`SearXNG API error (${response.status}): ${errorMsg}`);
    }

    const data = response.json;

    return {
      query,
      results: (data.results || []).slice(0, 10).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      })),
    };
  }
}

/**
 * You.com Search Provider
 * https://docs.you.com - AI-optimized search API
 */
class YouProvider implements WebSearchProvider {
  name = "you";
  displayName = "You.com";
  description = "AI-optimized search API with web and news results. Great for RAG applications.";
  requiresApiKey = true;
  apiKeyUrl = "https://you.com/platform/api-keys";

  async search(query: string): Promise<WebSearchResponse> {
    const apiKey = getWebSearchApiKey("you");

    if (!apiKey) {
      throw new Error("You.com API key not configured. Get one at https://you.com/platform");
    }

    const url = `https://ydc-index.io/v1/search?query=${encodeURIComponent(query)}&count=10`;

    const response = await requestUrl({
      url: url,
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
      throw: false,
    });

    if (response.status !== 200) {
      const errorMsg = response.text || JSON.stringify(response.json);
      throw new Error(`You.com API error (${response.status}): ${errorMsg}`);
    }

    const data = response.json;
    const results: WebSearchResult[] = [];

    // v1/search endpoint returns results.web array
    if (data.results?.web && Array.isArray(data.results.web)) {
      for (const result of data.results.web.slice(0, 10)) {
        const snippets = result.snippets || [];
        const snippet = snippets.join(" ").slice(0, 500);

        results.push({
          title: result.title || "",
          url: result.url || "",
          snippet: snippet || result.description || "",
        });
      }
    }

    return {
      query,
      results,
    };
  }
}

/**
 * Exa Search Provider
 * https://exa.ai - Neural search engine built for AI
 */
class ExaProvider implements WebSearchProvider {
  name = "exa";
  displayName = "Exa";
  description = "Neural search built for AI. Fastest search API (<350ms). Free tier available.";
  requiresApiKey = true;
  apiKeyUrl = "https://dashboard.exa.ai/api-keys";

  async search(query: string): Promise<WebSearchResponse> {
    const apiKey = getWebSearchApiKey("exa");

    if (!apiKey) {
      throw new Error("Exa API key not configured. Get one at https://dashboard.exa.ai");
    }

    const response = await requestUrl({
      url: "https://api.exa.ai/search",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: query,
        type: "auto",
        numResults: 10,
        text: true,
      }),
      throw: false,
    });

    if (response.status !== 200) {
      const errorMsg = response.text || JSON.stringify(response.json);
      throw new Error(`Exa API error (${response.status}): ${errorMsg}`);
    }

    const data = response.json;

    return {
      query,
      results: (data.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.text || r.summary || "",
      })),
    };
  }
}

// Available web search providers
export const WEB_SEARCH_PROVIDERS: Record<string, WebSearchProvider> = {
  tavily: new TavilyProvider(),
  brave: new BraveSearchProvider(),
  serpapi: new SerpAPIProvider(),
  serper: new SerperProvider(),
  searxng: new SearxngProvider(),
  you: new YouProvider(),
  exa: new ExaProvider(),
};

export const DEFAULT_WEB_SEARCH_PROVIDER = "tavily";

/**
 * Get the current web search provider based on settings
 */
export function getWebSearchProvider(): WebSearchProvider {
  const settings = getSettings();
  const providerName = settings.webSearchProvider || DEFAULT_WEB_SEARCH_PROVIDER;
  const provider = WEB_SEARCH_PROVIDERS[providerName];

  if (!provider) {
    logInfo(`Web search provider "${providerName}" not found, falling back to default`);
    return WEB_SEARCH_PROVIDERS[DEFAULT_WEB_SEARCH_PROVIDER];
  }

  return provider;
}

export function isWebSearchConfigured(): boolean {
  const settings = getSettings();
  const providerName = settings.webSearchProvider || DEFAULT_WEB_SEARCH_PROVIDER;
  const provider = WEB_SEARCH_PROVIDERS[providerName];
  
  if (!provider) return false;
  
  if (providerName === "searxng") {
    return !!settings.webSearchBaseUrl?.trim();
  }
  
  if (provider.requiresApiKey) {
    const apiKey = settings.webSearchApiKeys?.[providerName] || settings.webSearchApiKey || "";
    return !!apiKey.trim();
  }
  
  return true;
}

export async function performWebSearch(query: string): Promise<WebSearchResponse> {
  const provider = getWebSearchProvider();
  
  if (!isWebSearchConfigured()) {
    const settings = getSettings();
    const providerName = settings.webSearchProvider || DEFAULT_WEB_SEARCH_PROVIDER;
    const configuredProvider = WEB_SEARCH_PROVIDERS[providerName];
    
    let errorMessage = `Web search provider "${configuredProvider?.displayName || providerName}" is not configured.`;
    
    if (configuredProvider?.requiresApiKey && configuredProvider?.apiKeyUrl) {
      errorMessage += ` Please add your API key in settings. Get one at ${configuredProvider.apiKeyUrl}`;
    } else if (providerName === "searxng") {
      errorMessage += " Please set your SearXNG instance URL in settings.";
    }
    
    logError(errorMessage);
    return { query, results: [], answer: errorMessage };
  }
  
  logInfo(`Performing web search using provider: ${provider.displayName}`);

  try {
    const result = await provider.search(query);
    logInfo(`Web search returned ${result.results.length} results`);
    return result;
  } catch (error) {
    logError(`Web search failed with provider ${provider.name}:`, error);
    return {
      query,
      results: [],
      answer: error instanceof Error ? error.message : "Web search failed with unknown error",
    };
  }
}
