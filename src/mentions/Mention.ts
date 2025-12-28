import { ImageProcessor } from "@/imageProcessing/imageProcessor";
import { getYouTubeTranscript, extractYouTubeVideoId } from "@/tools/providers/YouTubeProvider";
import { err2String, isYoutubeUrl } from "@/utils";
import { logError, logInfo } from "@/logger";
import { requestUrl } from "obsidian";

export interface MentionData {
  type: string;
  original: string;
  processed?: string;
  error?: string;
}

export interface Url4llmResponse {
  response: any;
  elapsed_time_ms: number;
}

export class Mention {
  private static instance: Mention;
  private mentions: Map<string, MentionData>;

  private constructor() {
    this.mentions = new Map();
  }

  static getInstance(): Mention {
    if (!Mention.instance) {
      Mention.instance = new Mention();
    }
    return Mention.instance;
  }

  extractAllUrls(text: string): string[] {
    // Match URLs and trim any trailing commas
    const urlRegex = /https?:\/\/[^\s"'<>]+/g;
    return (text.match(urlRegex) || [])
      .map((url) => url.replace(/,+$/, "")) // Remove trailing commas
      .filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates
  }

  extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s"'<>]+/g;
    return (text.match(urlRegex) || [])
      .map((url) => url.replace(/,+$/, ""))
      .filter((url, index, self) => self.indexOf(url) === index);
  }

  /**
   * Fetch URL content locally without using external API
   */
  async processUrl(url: string): Promise<Url4llmResponse & { error?: string }> {
    try {
      const startTime = Date.now();
      logInfo(`Fetching URL content locally: ${url}`);
      
      const response = await requestUrl({
        url: url,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ObsidianCopilot/1.0)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      // Extract text content from HTML
      let content = response.text;
      
      // Simple HTML to text conversion
      // Remove script and style tags
      content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      content = content.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
      
      // Remove HTML tags but keep content
      content = content.replace(/<[^>]+>/g, " ");
      
      // Decode HTML entities
      content = content.replace(/&nbsp;/g, " ");
      content = content.replace(/&amp;/g, "&");
      content = content.replace(/&lt;/g, "<");
      content = content.replace(/&gt;/g, ">");
      content = content.replace(/&quot;/g, '"');
      content = content.replace(/&#39;/g, "'");
      
      // Clean up whitespace
      content = content.replace(/\s+/g, " ").trim();
      
      // Limit content length to avoid context overflow
      const maxLength = 50000;
      if (content.length > maxLength) {
        content = content.substring(0, maxLength) + "... [content truncated]";
      }

      const elapsed = Date.now() - startTime;
      logInfo(`URL content fetched in ${elapsed}ms, length: ${content.length}`);

      return { response: content, elapsed_time_ms: elapsed };
    } catch (error) {
      const msg = err2String(error);
      logError(`Error processing URL ${url}: ${msg}`);
      return { response: url, elapsed_time_ms: 0, error: msg };
    }
  }

  async processYoutubeUrl(url: string): Promise<{ transcript: string; error?: string }> {
    try {
      const videoId = extractYouTubeVideoId(url);
      if (!videoId) {
        return { transcript: "", error: "Could not extract video ID from URL" };
      }
      
      const result = await getYouTubeTranscript(url);
      return { transcript: result.transcript };
    } catch (error) {
      const msg = err2String(error);
      logError(`Error processing YouTube URL ${url}: ${msg}`);
      return { transcript: "", error: msg };
    }
  }

  /**
   * Process a list of URLs directly (both regular and YouTube URLs).
   *
   * @param urls Array of URLs to process
   * @returns Processed URL context and any errors
   */
  async processUrlList(urls: string[]): Promise<{
    urlContext: string;
    imageUrls: string[];
    processedErrorUrls: Record<string, string>;
  }> {
    let urlContext = "";
    const imageUrls: string[] = [];
    const processedErrorUrls: Record<string, string> = {};

    // Return empty string if no URLs to process
    if (urls.length === 0) {
      return { urlContext, imageUrls, processedErrorUrls };
    }

    // Process all URLs concurrently
    const processPromises = urls.map(async (url) => {
      // Check if it's an image URL
      if (await ImageProcessor.isImageUrl(url, app.vault)) {
        imageUrls.push(url);
        return { type: "image", url };
      }

      // Check if it's a YouTube URL
      if (isYoutubeUrl(url)) {
        if (!this.mentions.has(url)) {
          const processed = await this.processYoutubeUrl(url);
          this.mentions.set(url, {
            type: "youtube",
            original: url,
            processed: processed.transcript,
            error: processed.error,
          });
        }
        return { type: "youtube", data: this.mentions.get(url) };
      }

      // Regular URL
      if (!this.mentions.has(url)) {
        const processed = await this.processUrl(url);
        this.mentions.set(url, {
          type: "url",
          original: url,
          processed: processed.response,
          error: processed.error,
        });
      }
      return { type: "url", data: this.mentions.get(url) };
    });

    const processedUrls = await Promise.all(processPromises);

    // Append all processed content
    processedUrls.forEach((result) => {
      if (result.type === "image") {
        // Already added to imageUrls
        return;
      }

      const urlData = result.data;
      if (!urlData) return;

      if (urlData.processed) {
        if (result.type === "youtube") {
          urlContext += `\n\n<youtube_transcript>\n<url>${urlData.original}</url>\n<transcript>\n${urlData.processed}\n</transcript>\n</youtube_transcript>`;
        } else {
          urlContext += `\n\n<url_content>\n<url>${urlData.original}</url>\n<content>\n${urlData.processed}\n</content>\n</url_content>`;
        }
      }

      if (urlData.error) {
        processedErrorUrls[urlData.original] = urlData.error;
      }
    });

    return { urlContext, imageUrls, processedErrorUrls };
  }

  /**
   * Process URLs from user input text (both regular and YouTube URLs).
   *
   * IMPORTANT: This method should ONLY be called with the user's direct chat input,
   * NOT with content from context notes.
   *
   * @param text The user's chat input text
   * @returns Processed URL context and any errors
   */
  async processUrls(text: string): Promise<{
    urlContext: string;
    imageUrls: string[];
    processedErrorUrls: Record<string, string>;
  }> {
    const urls = this.extractUrls(text);
    return this.processUrlList(urls);
  }

  getMentions(): Map<string, MentionData> {
    return this.mentions;
  }

  clearMentions(): void {
    this.mentions.clear();
  }
}
