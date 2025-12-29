import { TFile } from "obsidian";
import { z } from "zod";
import { createTool } from "./SimpleTool";

/**
 * Graph and Link Analysis Tools
 * 
 * Tools for analyzing note relationships, links, and vault structure.
 */

// ========================================
// BACKLINKS & LINK ANALYSIS
// ========================================

const getBacklinksSchema = z.object({
  path: z.string().describe("Path to the note (relative to vault root, include extension)"),
});

/**
 * Get all backlinks (incoming links) to a specific note.
 */
const getBacklinksTool = createTool({
  name: "getBacklinks",
  description: `Get all notes that link to a specific note (backlinks).
  
  WHEN TO USE:
  - Find what references a specific note
  - Discover related content
  - Analyze note importance by link count
  
  Returns list of notes with link context.`,
  schema: getBacklinksSchema,
  handler: async ({ path }) => {
    try {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return `Error: File not found: ${path}`;
      }

      const backlinks = app.metadataCache.getBacklinksForFile(file);
      if (!backlinks || backlinks.data.size === 0) {
        return `No backlinks found for ${path}`;
      }

      const backlinkList: { file: string; occurrences: number }[] = [];
      
      // Iterate through all backlinks
      backlinks.data.forEach((occurrences, sourcePath) => {
        backlinkList.push({
          file: sourcePath,
          occurrences: Object.keys(occurrences).length,
        });
      });

      return JSON.stringify({
        targetFile: path,
        totalBacklinks: backlinkList.length,
        backlinks: backlinkList,
      }, null, 2);
    } catch (error) {
      return `Error getting backlinks: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

const getOutgoingLinksSchema = z.object({
  path: z.string().describe("Path to the note (relative to vault root, include extension)"),
});

/**
 * Get all outgoing links from a specific note.
 */
const getOutgoingLinksTool = createTool({
  name: "getOutgoingLinks",
  description: `Get all links from a specific note to other notes (outgoing links).
  
  WHEN TO USE:
  - See what a note references
  - Find broken links in a note
  - Analyze note connectivity
  
  Returns list of linked notes with status (exists/broken).`,
  schema: getOutgoingLinksSchema,
  handler: async ({ path }) => {
    try {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return `Error: File not found: ${path}`;
      }

      const cache = app.metadataCache.getFileCache(file);
      if (!cache || !cache.links) {
        return `No outgoing links found in ${path}`;
      }

      const links = cache.links.map((link) => {
        const linkedFile = app.metadataCache.getFirstLinkpathDest(link.link, path);
        return {
          link: link.link,
          displayText: link.displayText || link.link,
          exists: !!linkedFile,
          targetPath: linkedFile?.path || null,
        };
      });

      const brokenLinks = links.filter(l => !l.exists);

      return JSON.stringify({
        sourceFile: path,
        totalLinks: links.length,
        brokenLinks: brokenLinks.length,
        links: links,
      }, null, 2);
    } catch (error) {
      return `Error getting outgoing links: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

const findOrphanedNotesSchema = z.object({
  includeAttachments: z.boolean().optional().describe("Include orphaned attachments (images, PDFs, etc.). Default: false"),
});

/**
 * Find notes with no incoming or outgoing links.
 */
const findOrphanedNotesTool = createTool({
  name: "findOrphanedNotes",
  description: `Find notes that have no links to or from other notes (orphaned notes).
  
  WHEN TO USE:
  - Clean up disconnected notes
  - Find notes that need linking
  - Discover forgotten content
  
  Returns list of orphaned notes.`,
  schema: findOrphanedNotesSchema,
  handler: async ({ includeAttachments = false }) => {
    try {
      const orphanedNotes: string[] = [];
      const files = includeAttachments ? app.vault.getFiles() : app.vault.getMarkdownFiles();

      for (const file of files) {
        // Skip non-markdown files if not including attachments
        if (!includeAttachments && !file.path.endsWith('.md')) {
          continue;
        }

        // Check backlinks
        const backlinks = app.metadataCache.getBacklinksForFile(file);
        const hasBacklinks = backlinks && backlinks.data.size > 0;

        // Check outgoing links
        const cache = app.metadataCache.getFileCache(file);
        const hasOutgoingLinks = cache?.links && cache.links.length > 0;

        if (!hasBacklinks && !hasOutgoingLinks) {
          orphanedNotes.push(file.path);
        }
      }

      return JSON.stringify({
        totalOrphaned: orphanedNotes.length,
        orphanedNotes: orphanedNotes,
      }, null, 2);
    } catch (error) {
      return `Error finding orphaned notes: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

const findBrokenLinksSchema = z.object({
  path: z.string().optional().describe("Path to specific note to check. If omitted, checks entire vault."),
});

/**
 * Find all broken links in a note or entire vault.
 */
const findBrokenLinksTool = createTool({
  name: "findBrokenLinks",
  description: `Find broken links (links to non-existent notes) in a specific note or entire vault.
  
  WHEN TO USE:
  - Clean up broken links
  - Validate vault integrity
  - Find notes that need to be created
  
  Returns list of broken links with source locations.`,
  schema: findBrokenLinksSchema,
  handler: async ({ path }) => {
    try {
      const brokenLinks: { sourceFile: string; brokenLink: string; displayText: string }[] = [];
      
      let filesToCheck: TFile[] = [];
      
      if (path) {
        const file = app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) {
          return `Error: File not found: ${path}`;
        }
        filesToCheck = [file];
      } else {
        filesToCheck = app.vault.getMarkdownFiles();
      }

      for (const file of filesToCheck) {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache || !cache.links) continue;

        for (const link of cache.links) {
          const linkedFile = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
          if (!linkedFile) {
            brokenLinks.push({
              sourceFile: file.path,
              brokenLink: link.link,
              displayText: link.displayText || link.link,
            });
          }
        }
      }

      if (brokenLinks.length === 0) {
        return path 
          ? `No broken links found in ${path}`
          : 'No broken links found in vault';
      }

      return JSON.stringify({
        totalBrokenLinks: brokenLinks.length,
        brokenLinks: brokenLinks,
      }, null, 2);
    } catch (error) {
      return `Error finding broken links: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

export {
  getBacklinksTool,
  getOutgoingLinksTool,
  findOrphanedNotesTool,
  findBrokenLinksTool,
};
