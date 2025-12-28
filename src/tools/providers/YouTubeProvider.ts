/**
 * YouTube transcript provider using youtube-transcript-plus
 */

import { 
  fetchTranscript,
  YoutubeTranscriptVideoUnavailableError,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
} from "youtube-transcript-plus";
import { requestUrl } from "obsidian";
import { logError } from "@/logger";

export interface YouTubeTranscriptResult {
  transcript: string;
  language?: string;
}

export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

const createFetchFunctions = () => ({
  videoFetch: async ({ url, lang, userAgent }: any) => {
    const response = await requestUrl({
      url,
      method: "GET",
      headers: {
        ...(lang && { "Accept-Language": lang }),
        "User-Agent": userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => response.text,
      json: async () => JSON.parse(response.text),
    } as Response;
  },
  playerFetch: async ({ url, method, body, headers, lang, userAgent }: any) => {
    const response = await requestUrl({
      url,
      method: method as any,
      headers: {
        ...(lang && { "Accept-Language": lang }),
        "User-Agent": userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...headers,
      },
      body,
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => response.text,
      json: async () => response.json,
    } as Response;
  },
  transcriptFetch: async ({ url, lang, userAgent }: any) => {
    const response = await requestUrl({
      url,
      method: "GET",
      headers: {
        ...(lang && { "Accept-Language": lang }),
        "User-Agent": userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => response.text,
      json: async () => JSON.parse(response.text),
    } as Response;
  },
});

export async function getYouTubeTranscript(
  url: string
): Promise<YouTubeTranscriptResult & { videoId: string }> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error(`Invalid YouTube URL: ${url}`);
  }

  try {
    let transcriptItems;
    let usedLanguage = "en";

    try {
      transcriptItems = await fetchTranscript(videoId, {
        lang: "en",
        ...createFetchFunctions(),
      });
    } catch (langError) {
      if (langError instanceof YoutubeTranscriptNotAvailableLanguageError) {
        transcriptItems = await fetchTranscript(videoId, createFetchFunctions());
        usedLanguage = transcriptItems[0]?.lang || "original";
      } else {
        throw langError;
      }
    }

    if (!transcriptItems?.length) {
      throw new Error("No transcript segments found");
    }

    const transcript = transcriptItems.map((item) => item.text).join(" ").trim();
    if (!transcript) {
      throw new Error("Transcript is empty");
    }

    return { transcript, language: usedLanguage, videoId };
  } catch (error) {
    logError("Error fetching YouTube transcript:", error);

    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new Error("Video is unavailable or has been removed");
    }
    if (error instanceof YoutubeTranscriptDisabledError) {
      throw new Error("Transcripts are disabled for this video");
    }
    if (error instanceof YoutubeTranscriptNotAvailableError) {
      throw new Error("No transcript available for this video");
    }
    if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
      throw new Error(`Transcript not available: ${error.message}`);
    }

    throw new Error(`Failed to fetch transcript: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
