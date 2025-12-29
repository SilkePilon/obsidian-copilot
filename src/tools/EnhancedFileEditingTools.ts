import { TFile } from "obsidian";
import { z } from "zod";
import { createTool } from "./SimpleTool";
import { show_preview, getFile } from "./ComposerTools";
import { normalizeLineEndings } from "./ComposerTools";

/**
 * Enhanced File Editing Tools for AI Coding Assistants
 * 
 * Based on best practices from Aider, Cursor, Cline, and modern AI coding tools.
 * Provides multiple editing strategies with robust error handling and fuzzy matching.
 */

// ========================================
// LINE-BASED EDITING (Most Reliable)
// ========================================

const insertLinesSchema = z.object({
  path: z.string().describe("Path to the file (relative to vault root, include extension)"),
  after_line: z.coerce.number().describe("Insert after this line number (0 = insert at start, -1 = insert at end). Line numbers are 1-indexed."),
  lines: z.array(z.string()).describe("Array of lines to insert. Each string is one line without \\n."),
});

/**
 * Insert lines at a specific position in a file.
 * Most reliable for additions - no fuzzy matching needed.
 */
const insertLinesTool = createTool({
  name: "insertLines",
  description: `Insert new lines at a specific position in a file. Use line numbers for precision.
  
  WHEN TO USE:
  - Adding new functions/methods
  - Adding imports at the top
  - Inserting code blocks
  
  ADVANTAGES:
  - No need to match existing content
  - Works even if file was modified since last read
  - Simple and reliable`,
  schema: insertLinesSchema,
  handler: async ({ path, after_line, lines }) => {
    try {
      const file = await getFile(path);
      const content = await app.vault.read(file);
      const contentLines = content.split('\n');
      
      // Handle special cases
      const insertIndex = after_line === -1 
        ? contentLines.length 
        : Math.min(after_line, contentLines.length);
      
      // Insert lines
      contentLines.splice(insertIndex, 0, ...lines);
      const newContent = contentLines.join('\n');
      
      const result = await show_preview(path, newContent);
      return JSON.stringify({
        result,
        linesInserted: lines.length,
        message: `Inserted ${lines.length} line(s) after line ${after_line}. Result: ${result}`,
      });
    } catch (error) {
      return `Error inserting lines in ${path}: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

// ========================================
// DELETE LINES
// ========================================

const deleteLinesSchema = z.object({
  path: z.string().describe("Path to the file (relative to vault root, include extension)"),
  start_line: z.coerce.number().describe("First line to delete (1-indexed)"),
  end_line: z.coerce.number().describe("Last line to delete (1-indexed, inclusive)"),
});

/**
 * Delete a range of lines from a file.
 * Precise and reliable for removing code blocks.
 */
const deleteLinesTool = createTool({
  name: "deleteLines",
  description: `Delete a range of lines from a file.
  
  WHEN TO USE:
  - Removing functions/methods
  - Removing imports
  - Deleting code blocks
  
  ADVANTAGES:
  - Precise line-based deletion
  - No fuzzy matching needed
  - Works with line numbers from file context`,
  schema: deleteLinesSchema,
  handler: async ({ path, start_line, end_line }) => {
    try {
      const file = await getFile(path);
      const content = await app.vault.read(file);
      const contentLines = content.split('\n');
      
      // Validate line numbers (1-indexed)
      if (start_line < 1 || end_line < 1 || start_line > end_line) {
        return `Invalid line range: ${start_line}-${end_line}. Lines are 1-indexed.`;
      }
      
      if (end_line > contentLines.length) {
        return `end_line ${end_line} exceeds file length (${contentLines.length} lines)`;
      }
      
      // Delete lines (convert to 0-indexed)
      const deleteCount = end_line - start_line + 1;
      contentLines.splice(start_line - 1, deleteCount);
      const newContent = contentLines.join('\n');
      
      const result = await show_preview(path, newContent);
      return JSON.stringify({
        result,
        linesDeleted: deleteCount,
        message: `Deleted lines ${start_line}-${end_line} (${deleteCount} lines). Result: ${result}`,
      });
    } catch (error) {
      return `Error deleting lines in ${path}: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

// ========================================
// REPLACE LINES (Line Number Based)
// ========================================

const replaceLinesSchema = z.object({
  path: z.string().describe("Path to the file (relative to vault root, include extension)"),
  start_line: z.coerce.number().describe("First line to replace (1-indexed)"),
  end_line: z.coerce.number().describe("Last line to replace (inclusive, 1-indexed)"),
  new_lines: z.array(z.string()).describe("Array of new lines to insert. Each string is one line without \\n."),
});

/**
 * Replace a range of lines with new content.
 * Combines delete + insert for atomic replacements.
 */
const replaceLinesTool = createTool({
  name: "replaceLines",
  description: `Replace a range of lines with new content.
  
  WHEN TO USE:
  - Modifying functions/methods
  - Updating code blocks
  - Refactoring specific sections
  
  ADVANTAGES:
  - Precise line-based replacement
  - Atomic operation (delete + insert)
  - Preserves indentation if you maintain it in new_lines`,
  schema: replaceLinesSchema,
  handler: async ({ path, start_line, end_line, new_lines }) => {
    try {
      const file = await getFile(path);
      const content = await app.vault.read(file);
      const contentLines = content.split('\n');
      
      // Validate line numbers
      if (start_line < 1 || end_line < 1 || start_line > end_line) {
        return `Invalid line range: ${start_line}-${end_line}. Lines are 1-indexed.`;
      }
      
      if (end_line > contentLines.length) {
        return `end_line ${end_line} exceeds file length (${contentLines.length} lines)`;
      }
      
      // Replace lines (convert to 0-indexed)
      const deleteCount = end_line - start_line + 1;
      contentLines.splice(start_line - 1, deleteCount, ...new_lines);
      const newContent = contentLines.join('\n');
      
      const result = await show_preview(path, newContent);
      return JSON.stringify({
        result,
        linesReplaced: deleteCount,
        newLines: new_lines.length,
        message: `Replaced lines ${start_line}-${end_line} with ${new_lines.length} new line(s). Result: ${result}`,
      });
    } catch (error) {
      return `Error replacing lines in ${path}: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

// ========================================
// ENHANCED SEARCH/REPLACE (Fuzzy Matching)
// ========================================

/**
 * Fuzzy match search text in content using multiple strategies.
 * Returns the best match index or -1 if no match found.
 */
function fuzzyFindMatch(
  content: string,
  searchText: string
): { index: number; matchedText: string; strategy: string } | null {
  const normalizedContent = normalizeLineEndings(content);
  const normalizedSearch = normalizeLineEndings(searchText);

  // Strategy 1: Exact match
  let index = normalizedContent.indexOf(normalizedSearch);
  if (index !== -1) {
    return {
      index,
      matchedText: content.substring(index, index + searchText.length),
      strategy: "exact",
    };
  }

  // Strategy 2: Whitespace-insensitive match
  const contentNoSpace = normalizedContent.replace(/\s+/g, " ");
  const searchNoSpace = normalizedSearch.replace(/\s+/g, " ");
  const spaceIndex = contentNoSpace.indexOf(searchNoSpace);
  
  if (spaceIndex !== -1) {
    // Find actual position in original content
    let actualIndex = 0;
    let normalizedIndex = 0;
    
    while (normalizedIndex < spaceIndex && actualIndex < content.length) {
      if (/\s/.test(content[actualIndex])) {
        actualIndex++;
        while (actualIndex < content.length && /\s/.test(content[actualIndex])) {
          actualIndex++;
        }
        normalizedIndex++;
      } else {
        actualIndex++;
        normalizedIndex++;
      }
    }
    
    if (actualIndex < content.length) {
      return {
        index: actualIndex,
        matchedText: content.substring(actualIndex, actualIndex + searchText.length),
        strategy: "whitespace-insensitive",
      };
    }
  }

  // Strategy 3: Indentation-insensitive match (remove leading spaces)
  const contentLines = normalizedContent.split('\n');
  const searchLines = normalizedSearch.split('\n');
  
  const searchLinesStripped = searchLines.map(line => line.trimStart());
  
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const candidateLines = contentLines.slice(i, i + searchLines.length);
    const candidateLinesStripped = candidateLines.map(line => line.trimStart());
    
    if (candidateLinesStripped.every((line, idx) => line === searchLinesStripped[idx])) {
      // Found match - calculate actual index
      const matchedText = candidateLines.join('\n');
      index = contentLines.slice(0, i).join('\n').length;
      if (i > 0) index += 1; // Add newline
      
      return {
        index,
        matchedText,
        strategy: "indentation-insensitive",
      };
    }
  }

  return null;
}

const enhancedSearchReplaceSchema = z.object({
  path: z.string().describe("Path to the file (relative to vault root, include extension)"),
  search: z.string().describe(`The EXACT text to find. Must match precisely including whitespace.
  
  TIPS:
  - Include enough context (5-10 lines) to uniquely identify the location
  - Copy directly from file to ensure exact match
  - Include surrounding lines for better matching
  - If uncertain, read the file first to get exact content`),
  replace: z.string().describe(`The new text to replace with. Can be different length than search text.
  
  TIPS:
  - Maintain indentation manually in replacement text
  - Include all necessary whitespace
  - Can add/remove lines as needed`),
  occurrence: z.number().optional().describe(`Which occurrence to replace (1 = first, 2 = second, etc.). 
  If not specified, replaces ALL occurrences. Use this for safety when multiple matches exist.`),
});

/**
 * Enhanced search/replace with fuzzy matching strategies.
 * More forgiving than exact string matching.
 */
const enhancedSearchReplaceTool = createTool({
  name: "enhancedSearchReplace",
  description: `Replace text in a file using fuzzy matching strategies.
  
  WHEN TO USE:
  - Modifying specific code sections
  - Updating function bodies
  - Changing specific logic
  
  ADVANTAGES:
  - Fuzzy matching handles minor whitespace differences
  - Indentation-insensitive matching option
  - Detailed error feedback with suggestions
  
  MATCHING STRATEGIES (tried in order):
  1. Exact match (fastest)
  2. Whitespace-insensitive (handles spacing differences)
  3. Indentation-insensitive (handles indentation changes)
  
  BEST PRACTICES:
  - Read the file first to get exact content
  - Include 5-10 lines of context around changes
  - Use occurrence parameter if multiple matches exist
  - Check file size - use writeToFile for small files (<3KB)`,
  schema: enhancedSearchReplaceSchema,
  handler: async ({ path, search, replace, occurrence }) => {
    try {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return `File not found: ${path}`;
      }

      const content = await app.vault.read(file);
      
      // Size check
      const MIN_FILE_SIZE = 3000;
      if (content.length < MIN_FILE_SIZE) {
        return `File is too small (${content.length} chars). Use writeToFile for files under ${MIN_FILE_SIZE} characters.`;
      }

      let modifiedContent = content;
      let replacementCount = 0;
      let matchStrategies: string[] = [];

      if (occurrence !== undefined) {
        // Replace specific occurrence
        let currentOccurrence = 0;
        let lastIndex = 0;
        
        while (true) {
          const remainingContent = modifiedContent.substring(lastIndex);
          const match = fuzzyFindMatch(remainingContent, search);
          
          if (!match) break;
          
          currentOccurrence++;
          matchStrategies.push(match.strategy);
          
          if (currentOccurrence === occurrence) {
            // Replace this occurrence
            const actualIndex = lastIndex + match.index;
            modifiedContent =
              modifiedContent.substring(0, actualIndex) +
              replace +
              modifiedContent.substring(actualIndex + match.matchedText.length);
            replacementCount = 1;
            break;
          }
          
          lastIndex += match.index + match.matchedText.length;
          if (lastIndex >= modifiedContent.length) break;
        }
        
        if (replacementCount === 0) {
          return `Occurrence ${occurrence} not found. Found ${currentOccurrence} occurrence(s) total using strategies: ${matchStrategies.join(", ")}`;
        }
      } else {
        // Replace all occurrences
        let lastIndex = 0;
        
        while (true) {
          const remainingContent = modifiedContent.substring(lastIndex);
          const match = fuzzyFindMatch(remainingContent, search);
          
          if (!match) break;
          
          matchStrategies.push(match.strategy);
          const actualIndex = lastIndex + match.index;
          
          modifiedContent =
            modifiedContent.substring(0, actualIndex) +
            replace +
            modifiedContent.substring(actualIndex + match.matchedText.length);
          
          replacementCount++;
          lastIndex = actualIndex + replace.length;
          
          if (lastIndex >= modifiedContent.length) break;
        }
      }

      if (replacementCount === 0) {
        // Provide helpful error message
        const contentPreview = content.substring(0, 500);
        return `Search text not found in ${path}.

SEARCH TEXT:
${search}

FILE START (first 500 chars):
${contentPreview}

SUGGESTIONS:
1. Read the file first to verify exact content
2. Check for whitespace/indentation differences
3. Ensure search text is copied exactly from file
4. Try with more context lines around the target`;
      }

      if (content === modifiedContent) {
        return `No changes made to ${path}. Replacement resulted in identical content.`;
      }

      const result = await show_preview(path, modifiedContent);
      return JSON.stringify({
        result,
        replacements: replacementCount,
        strategies: [...new Set(matchStrategies)],
        message: `Replaced ${replacementCount} occurrence(s) using strategies: ${[...new Set(matchStrategies)].join(", ")}. Result: ${result}`,
      });
    } catch (error) {
      return `Error in enhancedSearchReplace for ${path}: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

// ========================================
// READ FILE WITH LINE NUMBERS
// ========================================

const readFileWithLineNumbersSchema = z.object({
  path: z.string().describe("Path to the file (relative to vault root, include extension)"),
  start_line: z.coerce.number().optional().describe("Start reading from this line (1-indexed). If not specified, starts from line 1."),
  end_line: z.coerce.number().optional().describe("Stop reading at this line (inclusive, 1-indexed). If not specified, reads to end of file."),
});

/**
 * Read file content with line numbers for precision editing.
 */
const readFileWithLineNumbersTool = createTool({
  name: "readFileWithLineNumbers",
  description: `Read a file with line numbers displayed. Essential for line-based editing tools.
  
  WHEN TO USE:
  - Before using insertLines, deleteLines, or replaceLines
  - To identify exact line numbers for editing
  - To verify file structure before modifications
  
  OUTPUT FORMAT:
  1: line content here
  2: another line
  3: etc...`,
  schema: readFileWithLineNumbersSchema,
  handler: async ({ path, start_line, end_line }) => {
    try {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return `File not found: ${path}`;
      }

      const content = await app.vault.read(file);
      const lines = content.split('\n');
      
      const startIdx = (start_line ?? 1) - 1;
      const endIdx = (end_line ?? lines.length) - 1;
      
      if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
        return `Invalid line range. File has ${lines.length} lines.`;
      }
      
      const numberedLines = lines
        .slice(startIdx, endIdx + 1)
        .map((line, idx) => `${startIdx + idx + 1}: ${line}`)
        .join('\n');
      
      return `File: ${path} (lines ${startIdx + 1}-${endIdx + 1} of ${lines.length})\n\n${numberedLines}`;
    } catch (error) {
      return `Error reading file ${path}: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

// ========================================
// BATCH FILE OPERATIONS
// ========================================

const bulkRenameSchema = z.object({
  pattern: z.string().describe("Glob pattern or folder path to match files (e.g., 'folder/*.md' or 'folder/')"),
  find: z.string().describe("Text to find in file names"),
  replace: z.string().describe("Text to replace with"),
  preview: z.boolean().optional().describe("If true, only shows what would be renamed without making changes. Default: true"),
});

/**
 * Bulk rename files matching a pattern.
 */
const bulkRenameTool = createTool({
  name: "bulkRename",
  description: `Rename multiple files at once using find/replace pattern.
  
  WHEN TO USE:
  - Rename files in batch
  - Fix naming inconsistencies
  - Reorganize file names
  
  SAFETY: Defaults to preview mode - set preview: false to apply changes.`,
  schema: bulkRenameSchema,
  handler: async ({ pattern, find, replace, preview = true }) => {
    try {
      const files = app.vault.getMarkdownFiles();
      const matchingFiles = files.filter(file => {
        // Match by folder or full glob pattern
        if (pattern.endsWith('/')) {
          return file.path.startsWith(pattern);
        }
        return file.path.includes(pattern.replace('*.md', '').replace('*', ''));
      });

      const renames: { old: string; new: string }[] = [];

      for (const file of matchingFiles) {
        const fileName = file.basename;
        if (fileName.includes(find)) {
          const newName = fileName.replace(new RegExp(find, 'g'), replace);
          const newPath = file.path.replace(fileName, newName);
          renames.push({ old: file.path, new: newPath });
        }
      }

      if (renames.length === 0) {
        return `No files found matching pattern: ${pattern} with text: ${find}`;
      }

      if (preview) {
        return JSON.stringify({
          mode: "PREVIEW ONLY - No changes made",
          totalMatches: renames.length,
          renames: renames,
          hint: "Set preview: false to apply these changes",
        }, null, 2);
      }

      // Apply renames
      const results: { path: string; status: string }[] = [];
      for (const rename of renames) {
        try {
          const file = app.vault.getAbstractFileByPath(rename.old);
          if (file instanceof TFile) {
            await app.vault.rename(file, rename.new);
            results.push({ path: rename.old, status: `Renamed to ${rename.new}` });
          }
        } catch (error) {
          results.push({ path: rename.old, status: `Error: ${error.message}` });
        }
      }

      return JSON.stringify({
        totalRenamed: results.filter(r => r.status.startsWith('Renamed')).length,
        results: results,
      }, null, 2);
    } catch (error) {
      return `Error during bulk rename: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

const bulkMoveSchema = z.object({
  pattern: z.string().describe("Glob pattern to match files (e.g., '*.md' or 'folder/*.md')"),
  destination: z.string().describe("Destination folder path (will be created if it doesn't exist)"),
  preview: z.boolean().optional().describe("If true, only shows what would be moved. Default: true"),
});

/**
 * Move multiple files to a destination folder.
 */
const bulkMoveTool = createTool({
  name: "bulkMove",
  description: `Move multiple files to a destination folder.
  
  WHEN TO USE:
  - Organize files into folders
  - Clean up vault structure
  - Batch file organization
  
  SAFETY: Defaults to preview mode - set preview: false to apply changes.`,
  schema: bulkMoveSchema,
  handler: async ({ pattern, destination, preview = true }) => {
    try {
      const files = app.vault.getMarkdownFiles();
      const matchingFiles = files.filter(file => {
        if (pattern === '*.md') return true;
        if (pattern.endsWith('*.md')) {
          const folder = pattern.replace('*.md', '');
          return file.path.startsWith(folder);
        }
        return file.path.includes(pattern);
      });

      if (matchingFiles.length === 0) {
        return `No files found matching pattern: ${pattern}`;
      }

      const moves: { old: string; new: string }[] = [];
      const destFolder = destination.endsWith('/') ? destination : destination + '/';

      for (const file of matchingFiles) {
        const newPath = destFolder + file.name;
        moves.push({ old: file.path, new: newPath });
      }

      if (preview) {
        return JSON.stringify({
          mode: "PREVIEW ONLY - No changes made",
          totalMatches: moves.length,
          destination: destFolder,
          moves: moves,
          hint: "Set preview: false to apply these changes",
        }, null, 2);
      }

      // Create destination folder if it doesn't exist
      const folderPath = destFolder.slice(0, -1);
      if (!app.vault.getAbstractFileByPath(folderPath)) {
        await app.vault.createFolder(folderPath);
      }

      // Apply moves
      const results: { path: string; status: string }[] = [];
      for (const move of moves) {
        try {
          const file = app.vault.getAbstractFileByPath(move.old);
          if (file instanceof TFile) {
            await app.vault.rename(file, move.new);
            results.push({ path: move.old, status: `Moved to ${move.new}` });
          }
        } catch (error) {
          results.push({ path: move.old, status: `Error: ${error.message}` });
        }
      }

      return JSON.stringify({
        totalMoved: results.filter(r => r.status.startsWith('Moved')).length,
        results: results,
      }, null, 2);
    } catch (error) {
      return `Error during bulk move: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

export {
  insertLinesTool,
  deleteLinesTool,
  replaceLinesTool,
  enhancedSearchReplaceTool,
  readFileWithLineNumbersTool,
  bulkRenameTool,
  bulkMoveTool,
};
