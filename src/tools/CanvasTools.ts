import { TFile, TFolder, Vault, WorkspaceLeaf } from "obsidian";
import { z } from "zod";
import { logInfo, logWarn, logError } from "@/logger";
import { createTool } from "./SimpleTool";

/**
 * Canvas node types supported by Obsidian
 */
type CanvasNodeType = "file" | "text" | "link" | "group";

/**
 * Canvas node structure
 */
interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  file?: string;
  text?: string;
  url?: string;
  label?: string;
}

/**
 * Canvas edge (connection) structure
 */
interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  toNode: string;
  toSide?: "top" | "right" | "bottom" | "left";
  label?: string;
}

/**
 * Canvas file structure
 */
interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/**
 * Helper function to generate a unique ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Helper function to open a canvas file in a new tab and switch to it
 */
async function openCanvasInNewTab(canvasPath: string): Promise<void> {
  const workspace = app.workspace;
  
  // Get the canvas file
  const file = app.vault.getAbstractFileByPath(canvasPath);
  if (!(file instanceof TFile)) {
    logWarn(`Canvas file not found: ${canvasPath}`);
    return;
  }

  // Open in a new tab
  const leaf = workspace.getLeaf("tab");
  await leaf.openFile(file);
  
  // Switch to the new tab
  workspace.setActiveLeaf(leaf, { focus: true });
  
  logInfo(`Opened canvas in new tab: ${canvasPath}`);
}

/**
 * Helper function to read canvas data
 */
async function readCanvasData(vault: Vault, canvasPath: string): Promise<CanvasData> {
  const file = vault.getAbstractFileByPath(canvasPath);
  if (!(file instanceof TFile)) {
    throw new Error(`Canvas file not found: ${canvasPath}`);
  }

  const content = await vault.read(file);
  try {
    const data = JSON.parse(content) as CanvasData;
    return {
      nodes: data.nodes || [],
      edges: data.edges || [],
    };
  } catch (error) {
    logError(`Failed to parse canvas file: ${canvasPath}`, error);
    throw new Error(`Invalid canvas file format: ${canvasPath}`);
  }
}

/**
 * Helper function to write canvas data
 */
async function writeCanvasData(
  vault: Vault,
  canvasPath: string,
  data: CanvasData,
  shouldOpen: boolean = true
): Promise<void> {
  const file = vault.getAbstractFileByPath(canvasPath);
  if (!(file instanceof TFile)) {
    throw new Error(`Canvas file not found: ${canvasPath}`);
  }

  const content = JSON.stringify(data, null, 2);
  await vault.modify(file, content);
  
  // Open the canvas in a new tab after modification
  if (shouldOpen) {
    await openCanvasInNewTab(canvasPath);
  }
  
  logInfo(`Updated canvas: ${canvasPath}`);
}

/**
 * Tool: Create a new canvas file
 */
export const createCanvasTool = createTool({
  name: "createCanvas",
  description: "Create a new canvas file in your vault",
  schema: z.object({
    path: z.string().describe("Path where the canvas should be created (e.g., 'folder/mycanvas.canvas')"),
    initialNodes: z.array(z.object({
      type: z.enum(["text", "file", "link", "group"]).describe("Type of node to create"),
      x: z.number().describe("X coordinate (horizontal position)"),
      y: z.number().describe("Y coordinate (vertical position)"),
      width: z.number().describe("Width of the node"),
      height: z.number().describe("Height of the node"),
      text: z.string().optional().describe("Text content (for text nodes)"),
      file: z.string().optional().describe("File path (for file nodes)"),
      url: z.string().optional().describe("URL (for link nodes)"),
      label: z.string().optional().describe("Label (for group nodes)"),
      color: z.string().optional().describe("Color (hex code like '#ff0000' or number like '1-6')"),
    })).optional().describe("Optional list of initial nodes to add to the canvas"),
  }),
  handler: async ({ path, initialNodes }) => {
    const vault = app.vault;
    try {
      // Ensure path ends with .canvas
      const canvasPath = path.endsWith(".canvas") ? path : `${path}.canvas`;
      
      // Check if file already exists
      const existingFile = vault.getAbstractFileByPath(canvasPath);
      if (existingFile) {
        return {
          success: false,
          message: `Canvas already exists at: ${canvasPath}`,
        };
      }

      // Create the canvas data
      const nodes: CanvasNode[] = [];
      if (initialNodes) {
        for (const node of initialNodes) {
          const canvasNode: CanvasNode = {
            id: generateId(),
            type: node.type,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
          };

          if (node.color) canvasNode.color = node.color;
          if (node.text) canvasNode.text = node.text;
          if (node.file) canvasNode.file = node.file;
          if (node.url) canvasNode.url = node.url;
          if (node.label) canvasNode.label = node.label;

          nodes.push(canvasNode);
        }
      }

      const canvasData: CanvasData = {
        nodes,
        edges: [],
      };

      // Create the file
      const content = JSON.stringify(canvasData, null, 2);
      await vault.create(canvasPath, content);
      
      // Open the canvas in a new tab
      await openCanvasInNewTab(canvasPath);

      logInfo(`Created canvas: ${canvasPath}`);
      return {
        success: true,
        message: `Canvas created successfully at: ${canvasPath}`,
        canvasPath,
        nodeCount: nodes.length,
      };
    } catch (error) {
      logError("Error creating canvas:", error);
      return {
        success: false,
        message: `Failed to create canvas: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Get canvas content (nodes and edges)
 */
export const getCanvasContentTool = createTool({
  name: "getCanvasContent",
  description: "Get all nodes and edges from a canvas file",
  schema: z.object({
    path: z.string().describe("Path to the canvas file"),
  }),
  handler: async ({ path }) => {
    const vault = app.vault;
    try {
      const data = await readCanvasData(vault, path);
      
      // Format the output for better readability
      const nodesSummary = data.nodes.map(node => ({
        id: node.id,
        type: node.type,
        position: { x: node.x, y: node.y },
        size: { width: node.width, height: node.height },
        color: node.color,
        text: node.text,
        file: node.file,
        url: node.url,
        label: node.label,
      }));

      const edgesSummary = data.edges.map(edge => ({
        id: edge.id,
        from: edge.fromNode,
        to: edge.toNode,
        fromSide: edge.fromSide,
        toSide: edge.toSide,
        label: edge.label,
      }));

      return {
        success: true,
        canvasPath: path,
        nodeCount: data.nodes.length,
        edgeCount: data.edges.length,
        nodes: nodesSummary,
        edges: edgesSummary,
      };
    } catch (error) {
      logError("Error reading canvas:", error);
      return {
        success: false,
        message: `Failed to read canvas: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Add node to canvas
 */
export const addCanvasNodeTool = createTool({
  name: "addCanvasNode",
  description: "Add a new node to an existing canvas. The canvas will automatically open in a new tab.",
  schema: z.object({
    path: z.string().describe("Path to the canvas file"),
    type: z.enum(["text", "file", "link", "group"]).describe("Type of node to add"),
    x: z.number().describe("X coordinate (horizontal position)"),
    y: z.number().describe("Y coordinate (vertical position)"),
    width: z.number().describe("Width of the node (default: 250 for text, 400 for file/link, 500 for group)"),
    height: z.number().describe("Height of the node (default: 60 for text, 400 for file/link, 400 for group)"),
    text: z.string().optional().describe("Text content (required for text nodes)"),
    file: z.string().optional().describe("Path to file (required for file nodes)"),
    url: z.string().optional().describe("URL (required for link nodes)"),
    label: z.string().optional().describe("Label text (required for group nodes)"),
    color: z.string().optional().describe("Color (hex code like '#ff0000' or number like '1-6')"),
  }),
  handler: async ({ path, type, x, y, width, height, text, file, url, label, color }) => {
    const vault = app.vault;
    try {
      const data = await readCanvasData(vault, path);

      // Validate required fields based on node type
      if (type === "text" && !text) {
        return {
          success: false,
          message: "Text content is required for text nodes",
        };
      }
      if (type === "file" && !file) {
        return {
          success: false,
          message: "File path is required for file nodes",
        };
      }
      if (type === "link" && !url) {
        return {
          success: false,
          message: "URL is required for link nodes",
        };
      }
      if (type === "group" && !label) {
        return {
          success: false,
          message: "Label is required for group nodes",
        };
      }

      // Create the new node
      const newNode: CanvasNode = {
        id: generateId(),
        type,
        x,
        y,
        width,
        height,
      };

      if (color) newNode.color = color;
      if (text) newNode.text = text;
      if (file) newNode.file = file;
      if (url) newNode.url = url;
      if (label) newNode.label = label;

      data.nodes.push(newNode);
      await writeCanvasData(vault, path, data);

      logInfo(`Added ${type} node to canvas: ${path}`);
      return {
        success: true,
        message: `Added ${type} node to canvas`,
        nodeId: newNode.id,
        canvasPath: path,
      };
    } catch (error) {
      logError("Error adding node to canvas:", error);
      return {
        success: false,
        message: `Failed to add node: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Update canvas node
 */
export const updateCanvasNodeTool = createTool({
  name: "updateCanvasNode",
  description: "Update an existing node in a canvas. The canvas will automatically open in a new tab.",
  schema: z.object({
    path: z.string().describe("Path to the canvas file"),
    nodeId: z.string().describe("ID of the node to update"),
    x: z.number().optional().describe("New X coordinate"),
    y: z.number().optional().describe("New Y coordinate"),
    width: z.number().optional().describe("New width"),
    height: z.number().optional().describe("New height"),
    text: z.string().optional().describe("New text content (for text nodes)"),
    file: z.string().optional().describe("New file path (for file nodes)"),
    url: z.string().optional().describe("New URL (for link nodes)"),
    label: z.string().optional().describe("New label (for group nodes)"),
    color: z.string().optional().describe("New color"),
  }),
  handler: async ({ path, nodeId, x, y, width, height, text, file, url, label, color }) => {
    const vault = app.vault;
    try {
      const data = await readCanvasData(vault, path);

      const nodeIndex = data.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex === -1) {
        return {
          success: false,
          message: `Node not found with ID: ${nodeId}`,
        };
      }

      const node = data.nodes[nodeIndex];

      // Update properties if provided
      if (x !== undefined) node.x = x;
      if (y !== undefined) node.y = y;
      if (width !== undefined) node.width = width;
      if (height !== undefined) node.height = height;
      if (color !== undefined) node.color = color;
      if (text !== undefined) node.text = text;
      if (file !== undefined) node.file = file;
      if (url !== undefined) node.url = url;
      if (label !== undefined) node.label = label;

      await writeCanvasData(vault, path, data);

      logInfo(`Updated node ${nodeId} in canvas: ${path}`);
      return {
        success: true,
        message: `Node updated successfully`,
        nodeId,
        canvasPath: path,
      };
    } catch (error) {
      logError("Error updating canvas node:", error);
      return {
        success: false,
        message: `Failed to update node: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Delete canvas node
 */
export const deleteCanvasNodeTool = createTool({
  name: "deleteCanvasNode",
  description: "Delete a node from a canvas. Also removes all edges connected to this node. The canvas will automatically open in a new tab.",
  schema: z.object({
    path: z.string().describe("Path to the canvas file"),
    nodeId: z.string().describe("ID of the node to delete"),
  }),
  handler: async ({ path, nodeId }) => {
    const vault = app.vault;
    try {
      const data = await readCanvasData(vault, path);

      const nodeIndex = data.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex === -1) {
        return {
          success: false,
          message: `Node not found with ID: ${nodeId}`,
        };
      }

      // Remove the node
      data.nodes.splice(nodeIndex, 1);

      // Remove all edges connected to this node
      const edgesBefore = data.edges.length;
      data.edges = data.edges.filter(e => e.fromNode !== nodeId && e.toNode !== nodeId);
      const edgesRemoved = edgesBefore - data.edges.length;

      await writeCanvasData(vault, path, data);

      logInfo(`Deleted node ${nodeId} from canvas: ${path}`);
      return {
        success: true,
        message: `Node deleted successfully (${edgesRemoved} connected edges also removed)`,
        nodeId,
        edgesRemoved,
        canvasPath: path,
      };
    } catch (error) {
      logError("Error deleting canvas node:", error);
      return {
        success: false,
        message: `Failed to delete node: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Add edge (connection) between nodes
 */
export const addCanvasEdgeTool = createTool({
  name: "addCanvasEdge",
  description: "Add a connection (edge) between two nodes in a canvas. The canvas will automatically open in a new tab.",
  schema: z.object({
    path: z.string().describe("Path to the canvas file"),
    fromNodeId: z.string().describe("ID of the source node"),
    toNodeId: z.string().describe("ID of the target node"),
    fromSide: z.enum(["top", "right", "bottom", "left"]).optional().describe("Side of the source node where the edge connects"),
    toSide: z.enum(["top", "right", "bottom", "left"]).optional().describe("Side of the target node where the edge connects"),
    label: z.string().optional().describe("Optional label for the edge"),
  }),
  handler: async ({ path, fromNodeId, toNodeId, fromSide, toSide, label }) => {
    const vault = app.vault;
    try {
      const data = await readCanvasData(vault, path);

      // Verify both nodes exist
      const fromNode = data.nodes.find(n => n.id === fromNodeId);
      const toNode = data.nodes.find(n => n.id === toNodeId);

      if (!fromNode) {
        return {
          success: false,
          message: `Source node not found with ID: ${fromNodeId}`,
        };
      }
      if (!toNode) {
        return {
          success: false,
          message: `Target node not found with ID: ${toNodeId}`,
        };
      }

      // Create the new edge
      const newEdge: CanvasEdge = {
        id: generateId(),
        fromNode: fromNodeId,
        toNode: toNodeId,
      };

      if (fromSide) newEdge.fromSide = fromSide;
      if (toSide) newEdge.toSide = toSide;
      if (label) newEdge.label = label;

      data.edges.push(newEdge);
      await writeCanvasData(vault, path, data);

      logInfo(`Added edge between ${fromNodeId} and ${toNodeId} in canvas: ${path}`);
      return {
        success: true,
        message: `Edge created successfully`,
        edgeId: newEdge.id,
        canvasPath: path,
      };
    } catch (error) {
      logError("Error adding edge to canvas:", error);
      return {
        success: false,
        message: `Failed to add edge: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Delete edge
 */
export const deleteCanvasEdgeTool = createTool({
  name: "deleteCanvasEdge",
  description: "Delete a connection (edge) from a canvas. The canvas will automatically open in a new tab.",
  schema: z.object({
    path: z.string().describe("Path to the canvas file"),
    edgeId: z.string().describe("ID of the edge to delete"),
  }),
  handler: async ({ path, edgeId }) => {
    const vault = app.vault;
    try {
      const data = await readCanvasData(vault, path);

      const edgeIndex = data.edges.findIndex(e => e.id === edgeId);
      if (edgeIndex === -1) {
        return {
          success: false,
          message: `Edge not found with ID: ${edgeId}`,
        };
      }

      data.edges.splice(edgeIndex, 1);
      await writeCanvasData(vault, path, data);

      logInfo(`Deleted edge ${edgeId} from canvas: ${path}`);
      return {
        success: true,
        message: `Edge deleted successfully`,
        edgeId,
        canvasPath: path,
      };
    } catch (error) {
      logError("Error deleting edge from canvas:", error);
      return {
        success: false,
        message: `Failed to delete edge: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Move multiple nodes
 */
export const moveCanvasNodesTool = createTool({
  name: "moveCanvasNodes",
  description: "Move multiple nodes by a relative offset. Useful for repositioning groups of nodes. The canvas will automatically open in a new tab.",
  schema: z.object({
    path: z.string().describe("Path to the canvas file"),
    nodeIds: z.array(z.string()).describe("IDs of nodes to move"),
    deltaX: z.number().describe("Horizontal offset to move (positive = right, negative = left)"),
    deltaY: z.number().describe("Vertical offset to move (positive = down, negative = up)"),
  }),
  handler: async ({ path, nodeIds, deltaX, deltaY }) => {
    const vault = app.vault;
    try {
      const data = await readCanvasData(vault, path);

      let movedCount = 0;
      for (const nodeId of nodeIds) {
        const node = data.nodes.find(n => n.id === nodeId);
        if (node) {
          node.x += deltaX;
          node.y += deltaY;
          movedCount++;
        }
      }

      if (movedCount === 0) {
        return {
          success: false,
          message: "No matching nodes found to move",
        };
      }

      await writeCanvasData(vault, path, data);

      logInfo(`Moved ${movedCount} nodes in canvas: ${path}`);
      return {
        success: true,
        message: `Moved ${movedCount} node(s)`,
        movedCount,
        canvasPath: path,
      };
    } catch (error) {
      logError("Error moving canvas nodes:", error);
      return {
        success: false,
        message: `Failed to move nodes: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Clear canvas (remove all nodes and edges)
 */
export const clearCanvasTool = createTool({
  name: "clearCanvas",
  description: "Remove all nodes and edges from a canvas. The canvas will automatically open in a new tab.",
  schema: z.object({
    path: z.string().describe("Path to the canvas file"),
  }),
  handler: async ({ path }) => {
    const vault = app.vault;
    try {
      const data = await readCanvasData(vault, path);
      
      const nodeCount = data.nodes.length;
      const edgeCount = data.edges.length;

      data.nodes = [];
      data.edges = [];

      await writeCanvasData(vault, path, data);

      logInfo(`Cleared canvas: ${path}`);
      return {
        success: true,
        message: `Canvas cleared successfully`,
        nodesRemoved: nodeCount,
        edgesRemoved: edgeCount,
        canvasPath: path,
      };
    } catch (error) {
      logError("Error clearing canvas:", error);
      return {
        success: false,
        message: `Failed to clear canvas: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Delete canvas file
 */
export const deleteCanvasTool = createTool({
  name: "deleteCanvas",
  description: "Delete a canvas file from the vault",
  schema: z.object({
    path: z.string().describe("Path to the canvas file to delete"),
  }),
  handler: async ({ path }) => {
    const vault = app.vault;
    try {
      const file = vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        return {
          success: false,
          message: `Canvas file not found: ${path}`,
        };
      }

      await vault.delete(file);

      logInfo(`Deleted canvas: ${path}`);
      return {
        success: true,
        message: `Canvas deleted successfully`,
        canvasPath: path,
      };
    } catch (error) {
      logError("Error deleting canvas:", error);
      return {
        success: false,
        message: `Failed to delete canvas: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: Get node by ID
 */
export const getCanvasNodeTool = createTool({
  name: "getCanvasNode",
  description: "Get details of a specific node in a canvas",
  schema: z.object({
    path: z.string().describe("Path to the canvas file"),
    nodeId: z.string().describe("ID of the node to retrieve"),
  }),
  handler: async ({ path, nodeId }) => {
    const vault = app.vault;
    try {
      const data = await readCanvasData(vault, path);

      const node = data.nodes.find(n => n.id === nodeId);
      if (!node) {
        return {
          success: false,
          message: `Node not found with ID: ${nodeId}`,
        };
      }

      // Get connected edges
      const connectedEdges = data.edges.filter(
        e => e.fromNode === nodeId || e.toNode === nodeId
      );

      return {
        success: true,
        node: {
          id: node.id,
          type: node.type,
          position: { x: node.x, y: node.y },
          size: { width: node.width, height: node.height },
          color: node.color,
          text: node.text,
          file: node.file,
          url: node.url,
          label: node.label,
        },
        connectedEdges: connectedEdges.map(e => ({
          id: e.id,
          direction: e.fromNode === nodeId ? "outgoing" : "incoming",
          connectedTo: e.fromNode === nodeId ? e.toNode : e.fromNode,
        })),
      };
    } catch (error) {
      logError("Error getting canvas node:", error);
      return {
        success: false,
        message: `Failed to get node: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Tool: List all canvas files in vault
 */
export const listCanvasesTool = createTool({
  name: "listCanvases",
  description: "List all canvas files in the vault",
  schema: z.object({
    folder: z.string().optional().describe("Optional folder path to search within (searches entire vault if not provided)"),
  }),
  handler: async ({ folder }) => {
    const vault = app.vault;
    try {
      let files: TFile[];
      
      if (folder) {
        const folderObj = vault.getAbstractFileByPath(folder);
        if (!(folderObj instanceof TFolder)) {
          return {
            success: false,
            message: `Folder not found: ${folder}`,
          };
        }
        files = vault.getFiles().filter(f => 
          f.extension === "canvas" && f.path.startsWith(folder)
        );
      } else {
        files = vault.getFiles().filter(f => f.extension === "canvas");
      }

      const canvases = files.map(f => ({
        path: f.path,
        name: f.basename,
        folder: f.parent?.path || "/",
      }));

      return {
        success: true,
        canvasCount: canvases.length,
        canvases,
      };
    } catch (error) {
      logError("Error listing canvases:", error);
      return {
        success: false,
        message: `Failed to list canvases: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * All canvas tools exported as an array
 */
export const CANVAS_TOOLS = [
  createCanvasTool,
  getCanvasContentTool,
  addCanvasNodeTool,
  updateCanvasNodeTool,
  deleteCanvasNodeTool,
  addCanvasEdgeTool,
  deleteCanvasEdgeTool,
  moveCanvasNodesTool,
  clearCanvasTool,
  deleteCanvasTool,
  getCanvasNodeTool,
  listCanvasesTool,
];
