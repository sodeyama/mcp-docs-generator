import path from 'path';
import { SummarizationResult, DocumentInfo } from './llm-summarizer';
import { extractTitleFromMarkdown } from './markdown-parser';

// 定数
const DEFAULT_TOOL_NAME = 'search-docs';
const TOOL_PREFIX = 'search-';
const TOOL_SUFFIX = '-docs';
const SPACE_PATTERN = /\s+/g;
const NON_ALPHANUMERIC_HYPHEN_PATTERN = /[^a-z0-9-]/g;
const DEFAULT_DESCRIPTION_PREFIX = 'Document: ';

/**
 * MCPツールで利用可能なパスの情報
 */
export interface ToolPath {
  path: string; // MCPツール内でアクセスするための相対パス
  description: string; // そのパスにあるドキュメントの簡潔な説明
  originalPath: string; // 元のファイルシステム上の完全パス
  title?: string; // ドキュメントのタイトル（利用可能な場合）
}

/**
 * MCPツールのメタデータ
 */
export interface McpToolMetadata {
  toolName: string; // MCPツール名（例：search-my-project-docs）
  toolDescription: string; // MCPツールの説明（LLM要約に基づく）
  availablePaths: ToolPath[]; // ツールでアクセス可能なドキュメントパスのリスト
}

/**
 * プロジェクト名をケバブケースに変換する
 * @param projectName プロジェクト名
 * @returns ケバブケースに変換されたプロジェクト名
 */
function convertToKebabCase(projectName: string): string {
  return projectName
    .toLowerCase()
    .replace(SPACE_PATTERN, '-')
    .replace(NON_ALPHANUMERIC_HYPHEN_PATTERN, ''); // 英数字とハイフン以外を削除
}

/**
 * プロジェクト名からMCPツール名を生成する
 * @param projectName プロジェクト名
 * @returns MCPツール名
 */
export function generateToolName(projectName: string): string {
  // プロジェクト名をケバブケースに変換
  const kebabProjectName = convertToKebabCase(projectName);
  
  // 空文字列になった場合はデフォルト値を使用
  if (!kebabProjectName) {
    return DEFAULT_TOOL_NAME;
  }
  
  return `${TOOL_PREFIX}${kebabProjectName}${TOOL_SUFFIX}`;
}

/**
 * LLM要約結果からツールの説明を生成する
 * @param summarizationResult LLM要約結果
 * @returns ツールの説明
 */
function generateToolDescription(summarizationResult: SummarizationResult): string {
  let toolDescription = `${summarizationResult.summary}\n\n`;
  toolDescription += `This tool provides access to documents on the following main topics:\n`;
  
  // トピックをリスト形式で追加
  summarizationResult.topics.forEach(topic => {
    toolDescription += `- ${topic}\n`;
  });
  
  toolDescription += `\nYou can retrieve information by specifying a specific document path.`;
  
  return toolDescription;
}

/**
 * ドキュメント情報からToolPathオブジェクトを生成する
 * @param file ドキュメント情報
 * @param docsRootDir ドキュメントのルートディレクトリパス
 * @returns ToolPathオブジェクト
 */
function createToolPath(file: DocumentInfo, docsRootDir: string): ToolPath {
  // docsRootDirからの相対パスを計算
  const relativePath = path.relative(docsRootDir, file.path);
  
  // ファイルの内容からタイトルを抽出
  const title = extractTitleFromMarkdown(file.content);
  
  return {
    path: relativePath,
    description: file.description || `${DEFAULT_DESCRIPTION_PREFIX}${path.basename(relativePath)}`,
    originalPath: file.path,
    title: title || undefined
  };
}

/**
 * LLM要約結果とドキュメント情報からMCPツールメタデータを生成する
 * @param projectName プロジェクト名
 * @param summarizationResult LLM要約結果
 * @param markdownFiles 解析されたMarkdownファイルの情報
 * @param docsRootDir ドキュメントのルートディレクトリパス（相対パス計算用）
 * @returns 生成されたMCPツールメタデータ
 */
export function generateMcpToolMetadata(
  projectName: string,
  summarizationResult: SummarizationResult,
  markdownFiles: DocumentInfo[],
  docsRootDir: string
): McpToolMetadata {
  // ツール名を生成
  const toolName = generateToolName(projectName);

  // ツールの説明を生成（LLM要約とトピックを利用）
  const toolDescription = generateToolDescription(summarizationResult);

  // 利用可能なパスのリストを生成
  const availablePaths: ToolPath[] = markdownFiles.map(file =>
    createToolPath(file, docsRootDir)
  );

  return {
    toolName,
    toolDescription,
    availablePaths,
  };
}