import fs from 'fs/promises';
import path from 'path';

/**
 * Recursively searches for Markdown files (.md) in the specified directory.
 * @param dirPath Directory path to search
 * @returns Array of paths to Markdown files
 */
export async function findMarkdownFiles(dirPath: string): Promise<string[]> {
  const markdownFiles: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Also search subdirectories recursively
      markdownFiles.push(...(await findMarkdownFiles(fullPath)));
    } else if (entry.isFile() && path.extname(fullPath).toLowerCase() === '.md') {
      // Add to list if it's a .md file
      markdownFiles.push(fullPath);
    }
  }
  return markdownFiles;
}

/**
 * Reads the content of the specified Markdown file.
 * @param filePath Path to the Markdown file
 * @returns Content of the file (string)
 */
export async function readMarkdownFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`Error: Failed to read file ${filePath}.`, error);
    throw error; // Re-throw the error so it can be handled by the caller
  }
}

/**
 * Extracts the title from a Markdown file.
 * Treats the first line starting with # as the title.
 * @param content Content of the Markdown file
 * @returns Extracted title, or empty string if not found
 */
export function extractTitleFromMarkdown(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const titleMatch = line.match(/^#\s+(.+)$/);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
  }
  return '';
}