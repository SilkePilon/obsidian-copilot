import { getYouTubeTranscript, extractYouTubeVideoId } from "@/tools/providers/YouTubeProvider";
import { extractAllYoutubeUrls, isYoutubeUrl } from "@/utils";
import { z } from "zod";
import { createTool } from "./SimpleTool";

// Maximum input length to prevent potential DoS attacks
const MAX_USER_MESSAGE_LENGTH = 50000; // Maximum number of characters

interface YouTubeHandlerArgs {
  url?: string;
  urls?: string[];
  _userMessageContent?: string;
}

const youtubeTranscriptionTool = createTool({
  name: "youtubeTranscription",
  description:
    "Get transcripts of YouTube videos. You can provide a specific URL or URLs, or the tool will extract URLs from the user's message.",
  schema: z.object({
    url: z
      .string()
      .optional()
      .describe("A single YouTube URL to transcribe. Use this when you have a specific URL."),
    urls: z
      .array(z.string())
      .optional()
      .describe("An array of YouTube URLs to transcribe. Use this for multiple URLs."),
  }),
  requiresUserMessageContent: true,
  handler: async (args: YouTubeHandlerArgs) => {
    const { url, urls: urlsParam, _userMessageContent } = args;

    // Collect URLs from all sources: explicit url param, urls array param, or extracted from user message
    let urls: string[] = [];

    // Priority 1: Explicit url parameter
    if (url && typeof url === "string" && isYoutubeUrl(url)) {
      urls.push(url);
    }

    // Priority 2: Explicit urls array parameter
    if (urlsParam && Array.isArray(urlsParam)) {
      const validUrls = urlsParam.filter((u) => typeof u === "string" && isYoutubeUrl(u));
      urls.push(...validUrls);
    }

    // Priority 3: Extract from user message content (fallback)
    if (urls.length === 0 && _userMessageContent && typeof _userMessageContent === "string") {
      if (_userMessageContent.length > MAX_USER_MESSAGE_LENGTH) {
        return JSON.stringify({
          success: false,
          message: `Input too long: Maximum allowed length is ${MAX_USER_MESSAGE_LENGTH} characters`,
        });
      }
      urls = extractAllYoutubeUrls(_userMessageContent);
    }

    // Remove duplicates
    urls = [...new Set(urls)];

    if (urls.length === 0) {
      return JSON.stringify({
        success: false,
        message:
          "No valid YouTube URLs provided. Please provide a YouTube URL using the 'url' or 'urls' parameter, or include it in your message.",
      });
    }

    // Process multiple URLs if present
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const result = await getYouTubeTranscript(url);

          // Check if transcript is empty
          if (!result.transcript) {
            return {
              url,
              success: false,
              message:
                "Transcript not available. The video may not have captions enabled.",
            };
          }

          return {
            url,
            success: true,
            transcript: result.transcript,
            language: result.language,
            videoId: result.videoId,
          };
        } catch (error) {
          return {
            url,
            success: false,
            message: error instanceof Error ? error.message : "An error occurred while transcribing the YouTube video",
          };
        }
      })
    );

    // Check if at least one transcription was successful
    const hasSuccessfulTranscriptions = results.some((result) => result.success);

    return JSON.stringify({
      success: hasSuccessfulTranscriptions,
      results,
      total_urls: urls.length,
    });
  },
});

export { youtubeTranscriptionTool };
