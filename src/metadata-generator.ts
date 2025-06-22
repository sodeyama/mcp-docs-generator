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

// MCPツール名の制限
const MCP_TOOL_NAME_MAX_LENGTH = 64;
const MCP_TOOL_NAME_PREFIX = 'mcp__';
const MCP_TOOL_NAME_SEPARATOR = '__';

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
 * MCPツール名の長さをチェックする
 * @param serverName サーバー名
 * @param toolName ツール名
 * @returns MCPツール名の完全な形式
 * @throws Error 64文字制限を超える場合
 */
function validateMcpToolNameLength(serverName: string, toolName: string): string {
  // MCPツール名の完全な形式: mcp__<サーバー名>__<ツール名>
  const fullMcpToolName = `${MCP_TOOL_NAME_PREFIX}${serverName}${MCP_TOOL_NAME_SEPARATOR}${toolName}`;
  
  if (fullMcpToolName.length > MCP_TOOL_NAME_MAX_LENGTH) {
    throw new Error(
      `MCPツール名が64文字制限を超えています: "${fullMcpToolName}" (${fullMcpToolName.length}文字)\n` +
      `制限: ${MCP_TOOL_NAME_MAX_LENGTH}文字\n` +
      `サーバー名: "${serverName}" (${serverName.length}文字)\n` +
      `ツール名: "${toolName}" (${toolName.length}文字)\n` +
      `プロジェクト名またはツール名を短くしてください。`
    );
  }
  
  return fullMcpToolName;
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
 * MCPツール名の64文字制限をチェックする
 * @param projectName プロジェクト名（サーバー名として使用）
 * @param toolName ツール名
 * @throws Error 64文字制限を超える場合
 */
export function validateMcpToolName(projectName: string, toolName: string): void {
  // プロジェクト名をサーバー名として使用（ケバブケースに変換）
  const serverName = convertToKebabCase(projectName) || 'default-server';
  
  // MCPツール名の長さをチェック
  validateMcpToolNameLength(serverName, toolName);
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
 * @throws Error MCPツール名が64文字制限を超える場合
 */
export function generateMcpToolMetadata(
  projectName: string,
  summarizationResult: SummarizationResult,
  markdownFiles: DocumentInfo[],
  docsRootDir: string
): McpToolMetadata {
  // ツール名を生成
  const toolName = generateToolName(projectName);

  // MCPツール名の64文字制限をチェック
  validateMcpToolName(projectName, toolName);

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