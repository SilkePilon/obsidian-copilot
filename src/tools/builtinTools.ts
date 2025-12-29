import { getSettings } from "@/settings/model";
import { Vault } from "obsidian";
import { writeToFileTool } from "./ComposerTools";
import {
  insertLinesTool,
  deleteLinesTool,
  replaceLinesTool,
  enhancedSearchReplaceTool,
  readFileWithLineNumbersTool,
  bulkRenameTool,
  bulkMoveTool,
} from "./EnhancedFileEditingTools";
import {
  getBacklinksTool,
  getOutgoingLinksTool,
  findOrphanedNotesTool,
  findBrokenLinksTool,
} from "./GraphLinkTools";
import {
  getBookmarkedNotesTool,
  addBookmarkTool,
  removeBookmarkTool,
} from "./BookmarkTools";
import { createGetFileTreeTool } from "./FileTreeTools";
import { updateMemoryTool } from "./memoryTools";
import { readNoteTool } from "./NoteTools";
import { localSearchTool, webSearchTool } from "./SearchTools";
import { createGetTagListTool } from "./TagTools";
import {
  convertTimeBetweenTimezonesTool,
  getCurrentTimeTool,
  getTimeInfoByEpochTool,
  getTimeRangeMsTool,
} from "./TimeTools";
import { ToolDefinition, ToolRegistry } from "./ToolRegistry";
import { youtubeTranscriptionTool } from "./YoutubeTools";

/**
 * Define all built-in tools with their metadata
 */
export const BUILTIN_TOOLS: ToolDefinition[] = [
  // Search tools
  {
    tool: localSearchTool,
    metadata: {
      id: "localSearch",
      displayName: "Vault Search",
      description: "Search through your vault notes",
      category: "search",
      copilotCommands: ["@vault"],
      customPromptInstructions: `For localSearch (searching notes based on their contents in the vault):
- You MUST always provide both "query" (string) and "salientTerms" (array of strings)
- salientTerms MUST be extracted from the user's original query - never invent new terms
- They are keywords used for BM25 full-text search to find notes containing those exact words
- Treat every token that begins with "#" as a high-priority salient term. Keep the leading "#" and the full tag hierarchy (e.g., "#project/phase1").
- Include tagged terms alongside other meaningful words; never strip hashes or rewrite tags into plain words.
- Extract meaningful content words from the query (nouns, verbs, names, etc.)
- Exclude common words like "what", "I", "do", "the", "a", etc.
- Exclude time expressions like "last month", "yesterday", "last week"
- Preserve the original language - do NOT translate terms to English

Example usage:
<use_tool>
<name>localSearch</name>
<query>piano learning practice</query>
<salientTerms>["piano", "learning", "practice"]</salientTerms>
</use_tool>

For localSearch with tags in the query (e.g., "#projectx status update"):
<use_tool>
<name>localSearch</name>
<query>#projectx status update</query>
<salientTerms>["#projectx", "status", "update"]</salientTerms>
</use_tool>

For localSearch with time range (e.g., "what did I do last week"):
Step 1 - Get time range:
<use_tool>
<name>getTimeRangeMs</name>
<timeExpression>last week</timeExpression>
</use_tool>

Step 2 - Search with time range (after receiving time range result):
<use_tool>
<name>localSearch</name>
<query>what did I do</query>
<salientTerms>[]</salientTerms>
<timeRange>{"startTime": {...}, "endTime": {...}}</timeRange>
</use_tool>

For localSearch with meaningful terms (e.g., "python debugging notes from yesterday"):
Step 1 - Get time range:
<use_tool>
<name>getTimeRangeMs</name>
<timeExpression>yesterday</timeExpression>
</use_tool>

Step 2 - Search with time range:
<use_tool>
<name>localSearch</name>
<query>python debugging notes</query>
<salientTerms>["python", "debugging", "notes"]</salientTerms>
<timeRange>{"startTime": {...}, "endTime": {...}}</timeRange>
</use_tool>

For localSearch with non-English query (PRESERVE ORIGINAL LANGUAGE):
<use_tool>
<name>localSearch</name>
<query>钢琴学习</query>
<salientTerms>["钢琴", "学习"]</salientTerms>
</use_tool>`,
    },
  },
  {
    tool: webSearchTool,
    metadata: {
      id: "webSearch",
      displayName: "Web Search",
      description:
        "Search the web (NOT vault notes) when you ask for online information",
      category: "search",
      copilotCommands: ["@websearch", "@web"],
      customPromptInstructions: `For webSearch:
- ONLY use when the user's query contains explicit web-search intent like:
  * "web search", "internet search", "online search"
  * "Google", "search online", "look up online", "search the web"
- Always provide an empty chatHistory array

Example - "search the web for python tutorials":
<use_tool>
<name>webSearch</name>
<query>python tutorials</query>
<chatHistory>[]</chatHistory>
</use_tool>`,
    },
  },

  // Time tools (always enabled)
  {
    tool: getCurrentTimeTool,
    metadata: {
      id: "getCurrentTime",
      displayName: "Get Current Time",
      description: "Get the current time in any timezone",
      category: "time",
      isAlwaysEnabled: true,
      customPromptInstructions: `For time queries (IMPORTANT: Always use UTC offsets, not timezone names):

- If the user mentions a specific city, country, or timezone name (e.g., "Tokyo", "Japan", "JST"), you MUST convert it to the correct UTC offset and pass it via the timezoneOffset parameter (e.g., "+9").
- Only omit timezoneOffset when the user asks for the current local time without naming any location or timezone.
- If you cannot confidently determine the offset from the user request, ask the user to clarify before calling the tool.

Example 1 - "what time is it" (local time):
<use_tool>
<name>getCurrentTime</name>
</use_tool>

Example 2 - "what time is it in Tokyo" (UTC+9):
<use_tool>
<name>getCurrentTime</name>
<timezoneOffset>+9</timezoneOffset>
</use_tool>

Example 3 - "what time is it in New York" (UTC-5 or UTC-4 depending on DST):
<use_tool>
<name>getCurrentTime</name>
<timezoneOffset>-5</timezoneOffset>
</use_tool>`,
    },
  },
  {
    tool: getTimeInfoByEpochTool,
    metadata: {
      id: "getTimeInfoByEpoch",
      displayName: "Get Time Info",
      description: "Convert epoch timestamp to human-readable format",
      category: "time",
      isAlwaysEnabled: true,
    },
  },
  {
    tool: getTimeRangeMsTool,
    metadata: {
      id: "getTimeRangeMs",
      displayName: "Get Time Range",
      description: "Convert time expressions to date ranges",
      category: "time",
      isAlwaysEnabled: true,
      customPromptInstructions: `For time-based queries:
- Use this tool to convert time expressions like "last week", "yesterday", "last month" to proper time ranges
- This is typically the first step before using localSearch with a time range

Example:
<use_tool>
<name>getTimeRangeMs</name>
<timeExpression>last week</timeExpression>
</use_tool>`,
    },
  },
  {
    tool: convertTimeBetweenTimezonesTool,
    metadata: {
      id: "convertTimeBetweenTimezones",
      displayName: "Convert Timezones",
      description: "Convert time between different timezones",
      category: "time",
      isAlwaysEnabled: true,
      customPromptInstructions: `For timezone conversions:

Example - "what time is 6pm PT in Tokyo" (PT is UTC-8 or UTC-7, Tokyo is UTC+9):
<use_tool>
<name>convertTimeBetweenTimezones</name>
<time>6pm</time>
<fromOffset>-8</fromOffset>
<toOffset>+9</toOffset>
</use_tool>`,
    },
  },

  // File tools
  {
    tool: readNoteTool,
    metadata: {
      id: "readNote",
      displayName: "Read Note",
      description: "Read a specific note in sequential chunks using its own line-chunking logic.",
      category: "file",
      requiresVault: true,
      isAlwaysEnabled: true,
      customPromptInstructions: `For readNote:
- Decide based on the user's request: only call this tool when the question requires reading note content.
- If the user asks about a note title that is already mentioned in the current or previous turns of the conversation, or linked in <active_note> or <note_context> blocks, call readNote directly—do not use localSearch to look it up. Even if the note title mention is partial but similar to what you have seen in the context, try to infer the correct note path from context. Skip the tool when a note is irrelevant to the user query.
- If the user asks about notes linked from that note, read the original note first, then follow the "linkedNotes" paths returned in the tool result to inspect those linked notes.
- Always start with chunk 0 (omit <chunkIndex> or set it to 0). Only request the next chunk if the previous chunk did not answer the question.
- Pass vault-relative paths without a leading slash. If a call fails, adjust the path (for example, add ".md" or use an alternative candidate) and retry only if necessary.
- Every tool result may include a "linkedNotes" array. If the user needs information from those linked notes, call readNote again with one of the provided candidate paths, starting again at chunk 0. Do not expand links you don't need.
- Stop calling readNote as soon as you have the required information.
- Always call getFileTree to get the exact note path if it is not provided in the context before calling readNote.

Example (first chunk):
<use_tool>
<name>readNote</name>
<notePath>Projects/launch-plan.md</notePath>
</use_tool>

Example (next chunk):
<use_tool>
<name>readNote</name>
<notePath>Projects/launch-plan.md</notePath>
<chunkIndex>1</chunkIndex>
</use_tool>`,
    },
  },
  {
    tool: writeToFileTool,
    metadata: {
      id: "writeToFile",
      displayName: "Write to File",
      description: "Create or modify files in your vault",
      category: "file",
      requiresVault: true,
      copilotCommands: ["@composer"],
      customPromptInstructions: `For writeToFile:
- NEVER display the file content directly in your response
- Always pass the complete file content to the tool
- Include the full path to the file
- You MUST explicitly call writeToFile for any intent of updating or creating files
- Do not call writeToFile tool again if the result is not accepted
- Do not call writeToFile tool if no change needs to be made
- Always create new notes in root folder or folders the user explicitly specifies
- When creating a new note in a folder, you MUST use getFileTree to get the exact folder path first

Example usage:
<use_tool>
<name>writeToFile</name>
<path>path/to/note.md</path>
<content>FULL CONTENT OF THE NOTE</content>
</use_tool>

Example usage with user explicitly asks to skip preview or confirmation:
<use_tool>
<name>writeToFile</name>
<path>path/to/note.md</path>
<content>FULL CONTENT OF THE NOTE</content>
<confirmation>false</confirmation>
</use_tool>
`,
    },
  },

  // Enhanced file editing tools
  {
    tool: readFileWithLineNumbersTool,
    metadata: {
      id: "readFileWithLineNumbers",
      displayName: "Read File with Line Numbers",
      description: "Read file content with line numbers displayed for precision editing",
      category: "file",
      requiresVault: true,
      customPromptInstructions: `For readFileWithLineNumbers:
- Use when you need to see line numbers to make precise edits
- This is especially useful before using insertLines, deleteLines, or replaceLines
- Shows each line prefixed with its line number

Example usage:
<use_tool>
<name>readFileWithLineNumbers</name>
<path>notes/project-plan.md</path>
</use_tool>`,
    },
  },
  {
    tool: insertLinesTool,
    metadata: {
      id: "insertLines",
      displayName: "Insert Lines",
      description: "Insert new lines at a specific position (most reliable for additions)",
      category: "file",
      requiresVault: true,
      customPromptInstructions: `For insertLines:
- Use when you want to add new content at a specific line position
- MOST RELIABLE tool for adding content - no fuzzy matching needed
- Lines are inserted AFTER the specified line number (line 0 = start of file)
- Perfect for: adding items to lists, inserting new sections, appending content
- Use readFileWithLineNumbers first to see line numbers

Example 1 - Insert at start of file:
<use_tool>
<name>insertLines</name>
<path>notes/todo.md</path>
<after_line>0</after_line>
<lines_to_insert>["# Todo List", "", "## High Priority"]</lines_to_insert>
</use_tool>

Example 2 - Add item to list at line 10:
<use_tool>
<name>insertLines</name>
<path>notes/todo.md</path>
<after_line>10</after_line>
<lines_to_insert>["- New task item"]</lines_to_insert>
</use_tool>`,
    },
  },
  {
    tool: deleteLinesTool,
    metadata: {
      id: "deleteLines",
      displayName: "Delete Lines",
      description: "Delete a range of lines by line numbers",
      category: "file",
      requiresVault: true,
      customPromptInstructions: `For deleteLines:
- Use when you want to remove specific lines from a file
- Deletes lines from start_line to end_line (inclusive, 1-based)
- Perfect for: removing items, deleting sections, cleaning up content
- Use readFileWithLineNumbers first to see line numbers

Example 1 - Delete a single line:
<use_tool>
<name>deleteLines</name>
<path>notes/todo.md</path>
<start_line>5</start_line>
<end_line>5</end_line>
</use_tool>

Example 2 - Delete a range of lines:
<use_tool>
<name>deleteLines</name>
<path>notes/todo.md</path>
<start_line>10</start_line>
<end_line>15</end_line>
</use_tool>`,
    },
  },
  {
    tool: replaceLinesTool,
    metadata: {
      id: "replaceLines",
      displayName: "Replace Lines",
      description: "Replace a range of lines with new content (atomic delete + insert)",
      category: "file",
      requiresVault: true,
      customPromptInstructions: `For replaceLines:
- Use when you want to replace specific lines with new content
- Replaces lines from start_line to end_line (inclusive, 1-based)
- Perfect for: updating sections, modifying existing content, refactoring
- Use readFileWithLineNumbers first to see line numbers

Example 1 - Replace a single line:
<use_tool>
<name>replaceLines</name>
<path>notes/project.md</path>
<start_line>5</start_line>
<end_line>5</end_line>
<new_lines>["## Updated Section Title"]</new_lines>
</use_tool>

Example 2 - Replace a section:
<use_tool>
<name>replaceLines</name>
<path>notes/project.md</path>
<start_line>10</start_line>
<end_line>15</end_line>
<new_lines>["## New Section", "", "Updated content here", "More updates"]</new_lines>
</use_tool>`,
    },
  },
  {
    tool: enhancedSearchReplaceTool,
    metadata: {
      id: "enhancedSearchReplace",
      displayName: "Enhanced Search & Replace",
      description: "Search and replace with fuzzy matching (handles whitespace/indentation variations)",
      category: "file",
      requiresVault: true,
      customPromptInstructions: `For enhancedSearchReplace:
- Use when you want to find and replace text that might have formatting variations
- Implements 3-tier fuzzy matching:
  1. Exact match (fastest)
  2. Whitespace-insensitive (handles spacing differences)
  3. Indentation-insensitive (handles tab/space changes)
- More forgiving than replaceInFile, but less precise than line-based tools
- Set replace_all: true to replace all occurrences, false for just the first

Example 1 - Replace first occurrence:
<use_tool>
<name>enhancedSearchReplace</name>
<path>notes/meeting.md</path>
<search_text>## Attendees
- John Smith
- Jane Doe</search_text>
<replace_with>## Attendees
- John Smith
- Jane Doe
- Bob Johnson</replace_with>
<replace_all>false</replace_all>
</use_tool>

Example 2 - Replace all occurrences:
<use_tool>
<name>enhancedSearchReplace</name>
<path>notes/project.md</path>
<search_text>TODO: Review this</search_text>
<replace_with>DONE: Reviewed</replace_with>
<replace_all>true</replace_all>
</use_tool>

When to use which tool:
- Need to add content? → Use insertLines (most reliable)
- Need to remove content? → Use deleteLines
- Need to update specific lines? → Use replaceLines
- Need to find/replace text with variations? → Use enhancedSearchReplace
- Major rewrite of file? → Use writeToFile`,
    },
  },
  {
    tool: bulkRenameTool,
    metadata: {
      id: "bulkRename",
      displayName: "Bulk Rename Files",
      description: "Rename multiple files at once using find/replace pattern",
      category: "file",
      requiresVault: true,
      customPromptInstructions: `For bulkRename:
- Use to rename multiple files in batch
- ALWAYS starts in preview mode (preview: true) - shows what would change
- User must explicitly confirm to apply changes (preview: false)
- Uses find/replace pattern on file names

Example 1 - Preview renames:
<use_tool>
<name>bulkRename</name>
<pattern>projects/</pattern>
<find>draft-</find>
<replace>final-</replace>
<preview>true</preview>
</use_tool>

Example 2 - Apply renames after user confirms:
<use_tool>
<name>bulkRename</name>
<pattern>projects/</pattern>
<find>draft-</find>
<replace>final-</replace>
<preview>false</preview>
</use_tool>`,
    },
  },
  {
    tool: bulkMoveTool,
    metadata: {
      id: "bulkMove",
      displayName: "Bulk Move Files",
      description: "Move multiple files to a destination folder",
      category: "file",
      requiresVault: true,
      customPromptInstructions: `For bulkMove:
- Use to move multiple files to a folder
- ALWAYS starts in preview mode - shows what would move
- User must explicitly confirm to apply changes
- Creates destination folder if needed

Example 1 - Preview moves:
<use_tool>
<name>bulkMove</name>
<pattern>*.md</pattern>
<destination>archive/</destination>
<preview>true</preview>
</use_tool>

Example 2 - Apply moves after confirmation:
<use_tool>
<name>bulkMove</name>
<pattern>old-folder/*.md</pattern>
<destination>new-folder/</destination>
<preview>false</preview>
</use_tool>`,
    },
  },

  // Graph and link analysis tools
  {
    tool: getBacklinksTool,
    metadata: {
      id: "getBacklinks",
      displayName: "Get Backlinks",
      description: "Find all notes that link to a specific note",
      category: "graph",
      requiresVault: true,
      customPromptInstructions: `For getBacklinks:
- Use to find what notes reference a specific note
- Returns list of notes with link counts
- Useful for discovering related content

Example:
<use_tool>
<name>getBacklinks</name>
<path>notes/project-overview.md</path>
</use_tool>`,
    },
  },
  {
    tool: getOutgoingLinksTool,
    metadata: {
      id: "getOutgoingLinks",
      displayName: "Get Outgoing Links",
      description: "Find all links from a note to other notes",
      category: "graph",
      requiresVault: true,
      customPromptInstructions: `For getOutgoingLinks:
- Use to see what a note references
- Shows both valid and broken links
- Useful for link analysis and validation

Example:
<use_tool>
<name>getOutgoingLinks</name>
<path>notes/index.md</path>
</use_tool>`,
    },
  },
  {
    tool: findOrphanedNotesTool,
    metadata: {
      id: "findOrphanedNotes",
      displayName: "Find Orphaned Notes",
      description: "Find notes with no incoming or outgoing links",
      category: "graph",
      requiresVault: true,
      customPromptInstructions: `For findOrphanedNotes:
- Use to find disconnected notes
- Helps clean up vault structure
- Can include or exclude attachments

Example:
<use_tool>
<name>findOrphanedNotes</name>
<includeAttachments>false</includeAttachments>
</use_tool>`,
    },
  },
  {
    tool: findBrokenLinksTool,
    metadata: {
      id: "findBrokenLinks",
      displayName: "Find Broken Links",
      description: "Find broken links in a note or entire vault",
      category: "graph",
      requiresVault: true,
      customPromptInstructions: `For findBrokenLinks:
- Use to validate vault integrity
- Can check specific note or entire vault
- Returns list of broken links with locations

Example 1 - Check specific note:
<use_tool>
<name>findBrokenLinks</name>
<path>notes/project.md</path>
</use_tool>

Example 2 - Check entire vault:
<use_tool>
<name>findBrokenLinks</name>
</use_tool>`,
    },
  },

  // Bookmark tools
  {
    tool: getBookmarkedNotesTool,
    metadata: {
      id: "getBookmarkedNotes",
      displayName: "Get Bookmarked Notes",
      description: "Get all bookmarked/starred notes",
      category: "bookmark",
      requiresVault: true,
      customPromptInstructions: `For getBookmarkedNotes:
- Use to access user's important notes
- Returns all bookmarks (files, folders, searches)
- Useful for surfacing prioritized content

Example:
<use_tool>
<name>getBookmarkedNotes</name>
</use_tool>`,
    },
  },
  {
    tool: addBookmarkTool,
    metadata: {
      id: "addBookmark",
      displayName: "Add Bookmark",
      description: "Add a note to bookmarks",
      category: "bookmark",
      requiresVault: true,
      customPromptInstructions: `For addBookmark:
- Use to mark important notes
- Can provide custom title
- Adds to bookmarks list

Example:
<use_tool>
<name>addBookmark</name>
<path>notes/important-project.md</path>
<title>Key Project Doc</title>
</use_tool>`,
    },
  },
  {
    tool: removeBookmarkTool,
    metadata: {
      id: "removeBookmark",
      displayName: "Remove Bookmark",
      description: "Remove a note from bookmarks",
      category: "bookmark",
      requiresVault: true,
      customPromptInstructions: `For removeBookmark:
- Use to clean up bookmarks
- Removes by file path

Example:
<use_tool>
<name>removeBookmark</name>
<path>notes/old-project.md</path>
</use_tool>`,
    },
  },

  // Media tools
  {
    tool: youtubeTranscriptionTool,
    metadata: {
      id: "youtubeTranscription",
      displayName: "YouTube Transcription",
      description: "Get transcripts from YouTube videos",
      category: "media",
      customPromptInstructions: `For youtubeTranscription:
- Use when user provides YouTube URLs
- No parameters needed - the tool will process URLs from the conversation

Example usage:
<use_tool>
<name>youtubeTranscription</name>
</use_tool>`,
    },
  },
];

/**
 * Register the file tree tool separately as it needs vault access
 */
export function registerFileTreeTool(vault: Vault): void {
  const registry = ToolRegistry.getInstance();

  registry.register({
    tool: createGetFileTreeTool(vault.getRoot()),
    metadata: {
      id: "getFileTree",
      displayName: "File Tree",
      description: "Browse vault file structure",
      category: "file",
      isAlwaysEnabled: true,
      requiresVault: true,
      customPromptInstructions: `For getFileTree:
- Use to browse the vault's file structure including paths of notes and folders
- Always call this tool to explore the exact path of notes or folders when you are not given the exact path.
- DO NOT use this tool to look up note contents or metadata - use localSearch or readNote instead.
- No parameters needed

Example usage:
<use_tool>
<name>getFileTree</name>
</use_tool>

Example queries that should use getFileTree:
- "Create a new note in the projects folder" -> call getFileTree to get the exact folder path of projects folder
- "Create a new note using the quick note template" -> call getFileTree to look up the exact folder path of the quick note template
- "How many files are in the projects folder" -> call getFileTree to list all files in the projects folder
`,
    },
  });
}

/**
 * Register the tag list tool separately to ensure metadata cache access is available.
 */
export function registerTagListTool(): void {
  const registry = ToolRegistry.getInstance();

  registry.register({
    tool: createGetTagListTool(),
    metadata: {
      id: "getTagList",
      displayName: "Tag List",
      description: "List vault tags with occurrence statistics",
      category: "file",
      isAlwaysEnabled: true,
      requiresVault: true,
      customPromptInstructions: `For getTagList:
- Use to inspect existing tags before suggesting new ones or reorganizing notes.
- Omit parameters to include both frontmatter and inline tags.
- Set includeInline to false when you only need frontmatter-defined tags.
- Use maxEntries to limit output for very large vaults.

Example usage (default):
<use_tool>
<name>getTagList</name>
</use_tool>

Example usage (frontmatter only):
<use_tool>
<name>getTagList</name>
<includeInline>false</includeInline>
</use_tool>`,
    },
  });
}

/**
 * Register the memory tool separately as it depends on saved memory setting
 */
export function registerMemoryTool(): void {
  const registry = ToolRegistry.getInstance();

  registry.register({
    tool: updateMemoryTool,
    metadata: {
      id: "updateMemory",
      displayName: "Update Memory",
      description:
        "Save information to user memory when the user explicitly asks to remember something or update the memory",
      category: "memory",
      copilotCommands: ["@memory"],
      isAlwaysEnabled: true,
      customPromptInstructions: `For updateMemory:
      - Use this tool to update the memory when the user explicitly asks to update the memory
      - DO NOT use for general information - only for personal facts, preferences, or specific things the user wants stored

      Example usage:
      <use_tool>
      <name>updateMemory</name>
      <statement>I'm studying Japanese and I'm preparing for JLPT N3</statement>
      </use_tool>`,
    },
  });
}

/**
 * Initialize all built-in tools in the registry.
 * This function registers tool definitions, not user preferences.
 * User-enabled tools are filtered dynamically when retrieved.
 *
 * @param vault - Optional Obsidian vault. When provided, enables registration of vault-dependent tools like file tree
 */
export function initializeBuiltinTools(vault?: Vault): void {
  const registry = ToolRegistry.getInstance();
  const settings = getSettings();

  // Only reinitialize if tools have changed or vault/memory status has changed
  const hasFileTree = registry.getToolMetadata("getFileTree") !== undefined;
  const shouldHaveFileTree = vault !== undefined;
  const hasUpdateMemoryTool = registry.getToolMetadata("updateMemory") !== undefined;
  const shouldHaveMemoryTool = settings.enableSavedMemory;

  if (
    registry.getAllTools().length === 0 ||
    hasFileTree !== shouldHaveFileTree ||
    hasUpdateMemoryTool !== shouldHaveMemoryTool
  ) {
    // Clear any existing tools
    registry.clear();

    // Register all built-in tools
    registry.registerAll(BUILTIN_TOOLS);

    // Register vault-dependent tools if vault is available
    if (vault) {
      registerFileTreeTool(vault);
      registerTagListTool();
    }

    // Register memory tool if saved memory is enabled
    if (settings.enableSavedMemory) {
      registerMemoryTool();
    }
  }
}
