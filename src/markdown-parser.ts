import fs from 'fs/promises';
import { Dirent } from 'fs';
import path from 'path';

// 定数
const MARKDOWN_EXTENSION = '.md';
const MARKDOWN_TITLE_PATTERN = /^#\s+(.+)$/;

/**
 * Recursively searches for Markdown files (.md) in the specified directory.
 * @param dirPath Directory path to search
 * @returns Array of paths to Markdown files
 * @throws Error if directory cannot be read
 */
export async function findMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const markdownFiles: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // 再帰的にサブディレクトリを検索
        const subDirFiles = await findMarkdownFiles(fullPath);
        markdownFiles.push(...subDirFiles);
      } else if (isMarkdownFile(entry, fullPath)) {
        // Markdownファイルをリストに追加
        markdownFiles.push(fullPath);
      }
    }
    
    return markdownFiles;
  } catch (error) {
    throw new Error(`Failed to search directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * ファイルエントリがMarkdownファイルかどうかを判定する
 * @param entry ファイルエントリ
 * @param fullPath ファイルの完全パス
 * @returns Markdownファイルの場合はtrue
 */
function isMarkdownFile(entry: Dirent, fullPath: string): boolean {
  return entry.isFile() && path.extname(fullPath).toLowerCase() === MARKDOWN_EXTENSION;
}

/**
 * Reads the content of the specified Markdown file.
 * @param filePath Path to the Markdown file
 * @returns Content of the file (string)
 * @throws Error if file cannot be read
 */
export async function readMarkdownFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extracts the title from a Markdown file.
 * Treats the first line starting with # as the title.
 * @param content Content of the Markdown file
 * @returns Extracted title, or empty string if not found
 */
export function extractTitleFromMarkdown(content: string): string {
  if (!content) {
    return '';
  }
  
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    const titleMatch = trimmedLine.match(MARKDOWN_TITLE_PATTERN);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
  }
  
  return '';
}