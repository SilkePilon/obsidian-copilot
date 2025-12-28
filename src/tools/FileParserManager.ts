import { ProjectConfig } from "@/aiParams";
import { PDFCache, PdfParseResponse } from "@/cache/pdfCache";
import { ProjectContextCache } from "@/cache/projectContextCache";
import { logError, logInfo } from "@/logger";
import { Notice, TFile, Vault } from "obsidian";
import { CanvasLoader } from "./CanvasLoader";

interface FileParser {
  supportedExtensions: string[];
  parseFile: (file: TFile, vault: Vault) => Promise<string>;
}

export class MarkdownParser implements FileParser {
  supportedExtensions = ["md"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    return await vault.read(file);
  }
}

/**
 * Local PDF Parser using pdf-parse
 * Extracts text content from PDF files without external API
 */
export class PDFParser implements FileParser {
  supportedExtensions = ["pdf"];
  private pdfCache: PDFCache;

  constructor() {
    this.pdfCache = PDFCache.getInstance();
  }

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo("Parsing PDF file locally:", file.path);

      // Try to get from cache first
      const cachedResponse = await this.pdfCache.get(file);
      if (cachedResponse) {
        logInfo("Using cached PDF content for:", file.path);
        return cachedResponse.response;
      }

      // If not in cache, read the file and parse locally
      const startTime = Date.now();
      const binaryContent = await vault.readBinary(file);
      
      let pdfParse;
      try {
        // Use dynamic import for optional pdf-parse dependency
        // @ts-ignore - pdf-parse is an optional dependency
        const pdfParseModule = await import("pdf-parse");
        pdfParse = pdfParseModule.default || pdfParseModule;
      } catch (moduleError) {
        logError("pdf-parse module not available:", moduleError);
        return `[Error: Could not extract content from PDF ${file.basename}. The pdf-parse library is not installed. Please install it with: npm install pdf-parse]`;
      }
      
      const buffer = Buffer.from(binaryContent);
      const data = await pdfParse(buffer);
      
      const content = data.text || "";
      const elapsed = Date.now() - startTime;
      
      logInfo(`PDF parsed locally in ${elapsed}ms, extracted ${content.length} characters`);
      
      const response: PdfParseResponse = {
        response: content,
        elapsed_time_ms: elapsed,
      };
      
      await this.pdfCache.set(file, response);
      return content;
    } catch (error) {
      logError(`Error extracting content from PDF ${file.path}:`, error);
      return `[Error: Could not extract content from PDF ${file.basename}. ${error instanceof Error ? error.message : "Unknown parsing error"}]`;
    }
  }

  async clearCache(): Promise<void> {
    logInfo("Clearing PDF cache");
    await this.pdfCache.clear();
  }
}

export class CanvasParser implements FileParser {
  supportedExtensions = ["canvas"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo("Parsing Canvas file:", file.path);
      const canvasLoader = new CanvasLoader(vault);
      const canvasData = await canvasLoader.load(file);

      // Use the specialized buildPrompt method to create LLM-friendly format
      return canvasLoader.buildPrompt(canvasData);
    } catch (error) {
      logError(`Error parsing Canvas file ${file.path}:`, error);
      return `[Error: Could not parse Canvas file ${file.basename}]`;
    }
  }
}

/**
 * Local document parser for text-based files
 * Handles formats that can be parsed locally without external APIs
 */
export class LocalDocumentParser implements FileParser {
  // Support text-based file types that can be read directly
  supportedExtensions = [
    // Text files
    "txt",
    "csv",
    "tsv",
    "xml",
    "html",
    "htm",
    "rtf",
    
    // Note: Other formats like docx, pptx, xlsx require specialized libraries
    // Users should convert them to PDF or text for local processing
  ];
  
  private projectContextCache: ProjectContextCache;
  private currentProject: ProjectConfig | null;

  constructor(project: ProjectConfig | null = null) {
    this.projectContextCache = ProjectContextCache.getInstance();
    this.currentProject = project;
  }

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    try {
      logInfo(
        `[LocalDocumentParser] Project ${this.currentProject?.name}: Parsing ${file.extension} file: ${file.path}`
      );

      if (!this.currentProject) {
        logError("[LocalDocumentParser] No project context for parsing file: ", file.path);
        throw new Error("No project context provided for file parsing");
      }

      const cachedContent = await this.projectContextCache.getOrReuseFileContext(
        this.currentProject,
        file.path
      );
      if (cachedContent) {
        logInfo(
          `[LocalDocumentParser] Project ${this.currentProject.name}: Using cached content for: ${file.path}`
        );
        return cachedContent;
      }

      let content = "";
      const ext = file.extension.toLowerCase();

      // Handle different text-based formats
      if (ext === "txt" || ext === "csv" || ext === "tsv" || ext === "xml") {
        // Read as text directly
        content = await vault.read(file);
      } else if (ext === "html" || ext === "htm") {
        // Read HTML and extract text
        const htmlContent = await vault.read(file);
        content = this.extractTextFromHtml(htmlContent);
      } else if (ext === "rtf") {
        // Basic RTF text extraction
        const rtfContent = await vault.read(file);
        content = this.extractTextFromRtf(rtfContent);
      } else {
        content = `[Note: File type .${ext} requires external processing. Please convert to PDF or text format for local parsing.]`;
      }

      // Cache the content
      await this.projectContextCache.setFileContext(this.currentProject, file.path, content);

      logInfo(
        `[LocalDocumentParser] Project ${this.currentProject.name}: Successfully processed and cached: ${file.path}`
      );
      return content;
    } catch (error) {
      logError(
        `[LocalDocumentParser] Project ${this.currentProject?.name}: Error processing file ${file.path}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Extract text from HTML content
   */
  private extractTextFromHtml(html: string): string {
    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
    
    // Remove HTML tags but keep content
    text = text.replace(/<[^>]+>/g, " ");
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/&amp;/g, "&");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    
    // Clean up whitespace
    text = text.replace(/\s+/g, " ").trim();
    
    return text;
  }

  /**
   * Extract text from RTF content (basic implementation)
   */
  private extractTextFromRtf(rtf: string): string {
    // Remove RTF control words and groups
    let text = rtf.replace(/\\[a-z]+(-?\d+)?[ ]?/gi, "");
    text = text.replace(/\{|\}/g, "");
    text = text.replace(/\\'[0-9a-f]{2}/gi, ""); // Remove hex characters
    text = text.replace(/\\\n/g, "\n");
    text = text.replace(/\\par/gi, "\n");
    
    // Clean up whitespace
    text = text.replace(/\s+/g, " ").trim();
    
    return text;
  }

  async clearCache(): Promise<void> {
    logInfo("Cache clearing is handled at the project level");
  }
}

// Future parsers can be added like this:
/*
class DocxParser implements FileParser {
  supportedExtensions = ["docx", "doc"];

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    // Implementation for Word documents
  }
}
*/

export class FileParserManager {
  private parsers: Map<string, FileParser> = new Map();
  private isProjectMode: boolean;
  private currentProject: ProjectConfig | null;

  constructor(
    vault: Vault,
    isProjectMode: boolean = false,
    project: ProjectConfig | null = null
  ) {
    this.isProjectMode = isProjectMode;
    this.currentProject = project;

    // Register parsers
    this.registerParser(new MarkdownParser());

    // In project mode, use LocalDocumentParser for text-based files
    if (isProjectMode && project) {
      this.registerParser(new LocalDocumentParser(project));
    }

    // Register PDF parser (works in both modes)
    this.registerParser(new PDFParser());

    this.registerParser(new CanvasParser());
  }

  registerParser(parser: FileParser) {
    for (const ext of parser.supportedExtensions) {
      this.parsers.set(ext, parser);
    }
  }

  async parseFile(file: TFile, vault: Vault): Promise<string> {
    const parser = this.parsers.get(file.extension);
    if (!parser) {
      throw new Error(`No parser found for file type: ${file.extension}`);
    }
    return await parser.parseFile(file, vault);
  }

  supportsExtension(extension: string): boolean {
    return this.parsers.has(extension);
  }

  async clearPDFCache(): Promise<void> {
    const pdfParser = this.parsers.get("pdf");
    if (pdfParser instanceof PDFParser) {
      await pdfParser.clearCache();
    }
  }
}
