import React from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection, PASTE_COMMAND, COMMAND_PRIORITY_HIGH } from "lexical";
import { parseTextForPills, createNodesFromSegments } from "../utils/lexicalTextUtils";

interface PastePluginProps {
  enableURLPills?: boolean;
  onImagePaste?: (files: File[]) => void;
}

/**
 * Lexical plugin that processes pasted text to convert [[note name]], @tool, #tag, {folder} patterns and URLs into pills.
 * Only converts patterns that resolve to actual notes in the vault, valid tools, valid tags, valid folders, and valid URLs -
 * invalid references are left as plain text.
 */
export function PastePlugin({ enableURLPills = false, onImagePaste }: PastePluginProps): null {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) {
          return false;
        }

        // First, check for image data
        if (onImagePaste) {
          const items = clipboardData.items;
          if (items) {
            const imageItems = Array.from(items).filter(
              (item) => item.type.indexOf("image") !== -1
            );

            if (imageItems.length > 0) {
              event.preventDefault();

              // Handle image processing asynchronously
              Promise.all(
                imageItems.map((item) => {
                  const file = item.getAsFile();
                  return file;
                })
              ).then((files) => {
                const validFiles = files.filter((file) => file !== null);
                if (validFiles.length > 0) {
                  onImagePaste(validFiles);
                }
              });

              return true;
            }
          }
        }

        const plainText = clipboardData.getData("text/plain");
        
        const hasNoteLinks = plainText.includes("[[");
        const hasURLs = enableURLPills && plainText.includes("http");
        const hasTools = plainText.includes("@");
        const hasTags = plainText.includes("#");
        const hasFolders = plainText.includes("{") && plainText.includes("}");

        if (!plainText || (!hasNoteLinks && !hasURLs && !hasTools && !hasTags && !hasFolders)) {
          return false;
        }

        // Parse the text for pill types (URL pills disabled to avoid rendering issues)
        const segments = parseTextForPills(plainText, {
          includeNotes: true,
          includeURLs: false,
          includeTools: true,
          includeCustomTemplates: true,
        });

        // Check if we found any valid pills
        const hasValidPills = segments.some(
          (segment) =>
            segment.type === "note-pill" ||
            segment.type === "active-note-pill" ||
            segment.type === "tool-pill" ||
            segment.type === "folder-pill"
        );

        if (!hasValidPills) {
          return false;
        }

        // Prevent default paste behavior
        event.preventDefault();

        // Insert the processed content
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            console.warn("PastePlugin: No range selection available");
            return;
          }

          console.log("PastePlugin: Creating nodes from", segments.length, "segments");
          const nodes = createNodesFromSegments(segments);
          console.log("PastePlugin: Created", nodes.length, "nodes");
          
          // Strict validation: ensure every node is a valid Lexical node object
          const validNodes = nodes.filter((node, index) => {
            if (node == null) {
              console.warn("PastePlugin: Null/undefined node at index", index);
              return false;
            }
            // Check if it's a proper Lexical node with required methods
            if (typeof node.getType !== 'function' || typeof node.getKey !== 'function') {
              console.warn("PastePlugin: Invalid node object at index", index, node);
              return false;
            }
            console.log("PastePlugin: Valid node at index", index, "type:", node.getType());
            return true;
          });
          
          if (validNodes.length === 0) {
            console.warn("PastePlugin: No valid nodes to insert, falling back to plain text");
            // Fall back to plain text paste
            selection.insertText(plainText);
            return;
          }

          try {
            // Lexical insertNodes expects an array and inserts them all at once
            // The array must not contain any null/undefined values
            console.log("PastePlugin: About to insert", validNodes.length, "nodes");
            console.log("PastePlugin: Node types:", validNodes.map(n => n.getType()));
            console.log("PastePlugin: Node keys:", validNodes.map(n => n.getKey()));
            selection.insertNodes(validNodes);
            console.log("PastePlugin: Successfully inserted nodes");
          } catch (error) {
            console.error("PastePlugin: Error inserting nodes:", error);
            console.error("PastePlugin: Error stack:", error.stack);
            // Fall back to plain text paste on error
            try {
              selection.insertText(plainText);
              console.log("PastePlugin: Fallback to plain text succeeded");
            } catch (fallbackError) {
              console.error("PastePlugin: Fallback also failed:", fallbackError);
            }
          }
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor, enableURLPills, onImagePaste]);

  return null;
}
