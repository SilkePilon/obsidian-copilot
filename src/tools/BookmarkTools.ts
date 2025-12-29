import { TFile } from "obsidian";
import { z } from "zod";
import { createTool } from "./SimpleTool";

/**
 * Bookmark and Starred Content Tools
 * 
 * Tools for accessing and managing bookmarked/starred notes and content.
 */

// ========================================
// BOOKMARK OPERATIONS
// ========================================

const getBookmarkedNotesSchema = z.object({});

/**
 * Get all bookmarked/starred notes and files.
 */
const getBookmarkedNotesTool = createTool({
  name: "getBookmarkedNotes",
  description: `Get all bookmarked or starred notes in the vault.
  
  WHEN TO USE:
  - Access user's important notes
  - Find frequently referenced content
  - Surface prioritized information
  
  Returns list of bookmarked items with their paths.`,
  schema: getBookmarkedNotesSchema,
  handler: async ({}) => {
    try {
      // Access the bookmarks/starred plugin
      // @ts-ignore - Using internal API
      const bookmarksPlugin = app.internalPlugins.getPluginById('bookmarks');
      
      if (!bookmarksPlugin || !bookmarksPlugin.enabled) {
        return 'Bookmarks plugin is not enabled. Please enable it in Settings → Core plugins.';
      }

      // @ts-ignore - Using internal API
      const bookmarks = bookmarksPlugin.instance?.items || [];
      
      if (bookmarks.length === 0) {
        return 'No bookmarks found. You can bookmark notes by right-clicking them and selecting "Bookmark".';
      }

      const bookmarkList: { type: string; title: string; path?: string }[] = [];
      
      const processBookmark = (item: any) => {
        if (item.type === 'file' && item.path) {
          bookmarkList.push({
            type: 'file',
            title: item.title || item.path,
            path: item.path,
          });
        } else if (item.type === 'folder' && item.path) {
          bookmarkList.push({
            type: 'folder',
            title: item.title || item.path,
            path: item.path,
          });
        } else if (item.type === 'search' && item.query) {
          bookmarkList.push({
            type: 'search',
            title: item.title || item.query,
            path: `Search: ${item.query}`,
          });
        } else if (item.type === 'group' && item.items) {
          // Recursively process group items
          item.items.forEach(processBookmark);
        }
      };

      bookmarks.forEach(processBookmark);

      return JSON.stringify({
        totalBookmarks: bookmarkList.length,
        bookmarks: bookmarkList,
      }, null, 2);
    } catch (error) {
      return `Error getting bookmarks: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

const addBookmarkSchema = z.object({
  path: z.string().describe("Path to the note to bookmark (relative to vault root, include extension)"),
  title: z.string().optional().describe("Optional custom title for the bookmark. If omitted, uses file name."),
});

/**
 * Add a note to bookmarks.
 */
const addBookmarkTool = createTool({
  name: "addBookmark",
  description: `Add a note to bookmarks/starred items.
  
  WHEN TO USE:
  - Mark important notes
  - Create quick access to key content
  - Organize workspace
  
  Adds the note to the bookmarks list.`,
  schema: addBookmarkSchema,
  handler: async ({ path, title }) => {
    try {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return `Error: File not found: ${path}`;
      }

      // @ts-ignore - Using internal API
      const bookmarksPlugin = app.internalPlugins.getPluginById('bookmarks');
      
      if (!bookmarksPlugin || !bookmarksPlugin.enabled) {
        return 'Bookmarks plugin is not enabled. Please enable it in Settings → Core plugins.';
      }

      // @ts-ignore - Using internal API
      const bookmarkInstance = bookmarksPlugin.instance;
      
      if (!bookmarkInstance) {
        return 'Could not access bookmarks instance.';
      }

      // Add bookmark
      const bookmarkItem = {
        type: 'file',
        title: title || file.basename,
        path: file.path,
      };

      // @ts-ignore - Using internal API
      bookmarkInstance.items.push(bookmarkItem);
      // @ts-ignore - Save bookmarks
      await bookmarkInstance.saveData();

      return JSON.stringify({
        success: true,
        message: `Added bookmark: ${file.basename}`,
        path: file.path,
      }, null, 2);
    } catch (error) {
      return `Error adding bookmark: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

const removeBookmarkSchema = z.object({
  path: z.string().describe("Path to the bookmarked note to remove (relative to vault root, include extension)"),
});

/**
 * Remove a note from bookmarks.
 */
const removeBookmarkTool = createTool({
  name: "removeBookmark",
  description: `Remove a note from bookmarks/starred items.
  
  WHEN TO USE:
  - Clean up bookmarks
  - Remove outdated quick access
  - Manage bookmark list
  
  Removes the note from bookmarks.`,
  schema: removeBookmarkSchema,
  handler: async ({ path }) => {
    try {
      // @ts-ignore - Using internal API
      const bookmarksPlugin = app.internalPlugins.getPluginById('bookmarks');
      
      if (!bookmarksPlugin || !bookmarksPlugin.enabled) {
        return 'Bookmarks plugin is not enabled. Please enable it in Settings → Core plugins.';
      }

      // @ts-ignore - Using internal API
      const bookmarkInstance = bookmarksPlugin.instance;
      
      if (!bookmarkInstance) {
        return 'Could not access bookmarks instance.';
      }

      // @ts-ignore - Using internal API
      const items = bookmarkInstance.items || [];
      const initialLength = items.length;
      
      // Remove bookmark with matching path
      // @ts-ignore
      bookmarkInstance.items = items.filter(item => item.path !== path);
      
      const removed = initialLength - bookmarkInstance.items.length;
      
      if (removed === 0) {
        return `No bookmark found for: ${path}`;
      }

      // @ts-ignore - Save bookmarks
      await bookmarkInstance.saveData();

      return JSON.stringify({
        success: true,
        message: `Removed bookmark: ${path}`,
        removedCount: removed,
      }, null, 2);
    } catch (error) {
      return `Error removing bookmark: ${error.message}`;
    }
  },
  timeoutMs: 0,
});

export {
  getBookmarkedNotesTool,
  addBookmarkTool,
  removeBookmarkTool,
};
