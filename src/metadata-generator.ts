import path from 'path';
import { SummarizationResult } from './llm-summarizer';
import { extractTitleFromMarkdown } from './markdown-parser';

export interface ToolPath {
  path: string; // Relative path for accessing within the MCP tool
  description: string; // Brief description of the document at that path
  originalPath: string; // Full path on the original file system
  title?: string; // Document title (if available)
}

export interface McpToolMetadata {
  toolName: string; // MCP tool name (e.g., search-my-project-docs)
  toolDescription: string; // MCP tool description (based on LLM summary)
  availablePaths: ToolPath[]; // List of document paths accessible by the tool
}

/**
 * Converts a project name to an MCP tool name
 * @param projectName Project name
 * @returns MCP tool name
 */
export function generateToolName(projectName: string): string {
  // Convert project name to kebab case
  const kebabProjectName = projectName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, ''); // Remove anything that's not alphanumeric or hyphen
  
  // Default value if it becomes an empty string
  if (!kebabProjectName) {
    return 'search-docs';
  }
  
  return `search-${kebabProjectName}-docs`;
}

/**
 * Generates MCP tool metadata from LLM summarization results and document information.
 * @param projectName Project name
 * @param summarizationResult Summarization result from LLM
 * @param markdownFiles Information about parsed Markdown files
 * @param docsRootDir Path to the root directory of documents (for relative path calculation)
 * @returns Generated MCP tool metadata
 */
export function generateMcpToolMetadata(
  projectName: string,
  summarizationResult: SummarizationResult,
  markdownFiles: { path: string, content: string, description?: string }[],
  docsRootDir: string
): McpToolMetadata {
  // Generate tool name
  const toolName = generateToolName(projectName);

  // Tool description (utilizing LLM summary and topics)
  let toolDescription = `${summarizationResult.summary}\n\n`;
  toolDescription += `This tool provides access to documents on the following main topics:\n`;
  summarizationResult.topics.forEach(topic => {
    toolDescription += `- ${topic}\n`;
  });
  toolDescription += `\nYou can retrieve information by specifying a specific document path.`;

  // Generate list of available paths
  const availablePaths: ToolPath[] = markdownFiles.map(file => {
    // Calculate relative path from docsRootDir
    const relativePath = path.relative(docsRootDir, file.path);
    // Extract title from file content
    const title = extractTitleFromMarkdown(file.content);
    
    return {
      path: relativePath,
      description: file.description || `Document: ${path.basename(relativePath)}`,
      originalPath: file.path,
      title: title || undefined
    };
  });

  return {
    toolName,
    toolDescription,
    availablePaths,
  };
}