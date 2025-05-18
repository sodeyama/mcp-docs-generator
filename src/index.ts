import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { findMarkdownFiles, readMarkdownFile, extractTitleFromMarkdown } from './markdown-parser';
import { summarizeDocuments, generateDocumentDescription, DocumentInfo, SummarizationResult } from './llm-summarizer';
import { generateMcpToolMetadata, McpToolMetadata } from './metadata-generator';
import { generateMcpServer, generateMcpServerConfig } from './mcp-server-generator';

/**
 * コマンドライン引数を解析する
 * @param argv コマンドライン引数
 * @returns 解析されたオプション
 */
export function parseCommandLineOptions(argv: string[]): {
  docsDir: string;
  customOutDir?: string;
  customProjectName?: string;
} {
  const program = new Command();
  program
    .version('0.1.0')
    .description('Generator for creating dynamic MCP tool definitions from Markdown documents')
    .requiredOption('-d, --docs <type>', 'Path to directory containing Markdown documents')
    .option('-o, --output <type>', 'Output directory for MCP server (default: ~/.mcp-server/{project_name})')
    .option('-p, --project <type>', 'Project name (if not specified, LLM will suggest one)');

  program.parse(argv);

  const options = program.opts();
  return {
    docsDir: options.docs as string,
    customOutDir: options.output as string | undefined,
    customProjectName: options.project as string | undefined,
  };
}

/**
 * ドキュメントディレクトリを検証する
 * @param dirPath ディレクトリパス
 * @throws ディレクトリが存在しない、またはディレクトリでない場合
 */
export async function validateDocsDirectory(dirPath: string): Promise<void> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`${dirPath} is not a directory.`);
    }
    console.log(`${dirPath} is a valid directory.`);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Directory ${dirPath} not found.`);
    }
    throw error;
  }
}

/**
 * Markdownファイルを読み込む
 * @param filePaths Markdownファイルのパスの配列
 * @returns DocumentInfo配列
 */
export async function loadMarkdownDocuments(filePaths: string[]): Promise<DocumentInfo[]> {
  const markdownDocuments: DocumentInfo[] = [];
  console.log('Reading Markdown file contents...');
  
  for (const filePath of filePaths) {
    try {
      const content = await readMarkdownFile(filePath);
      const title = extractTitleFromMarkdown(content);
      markdownDocuments.push({
        path: filePath,
        content,
        title: title || undefined
      });
      console.log(`  - Loaded ${filePath}. ${title ? `Title: ${title}` : ''}`);
    } catch (err) {
      console.warn(`Warning: Error occurred while reading file ${filePath}. Skipping.`, err);
    }
  }
  
  if (markdownDocuments.length === 0) {
    throw new Error('Failed to load all valid Markdown files.');
  }
  
  return markdownDocuments;
}

/**
 * プロジェクト名を整形する
 * @param name 整形前のプロジェクト名
 * @returns 整形後のプロジェクト名
 */
export function sanitizeProjectName(name: string): string {
  return name
    .toLowerCase() // 小文字に変換
    .replace(/\s+/g, '-') // スペースをハイフンに変換
    .replace(/[^a-z0-9-]/g, ''); // 英数字とハイフン以外を削除
}

/**
 * プロジェクト名を決定する
 * @param customProjectName カスタムプロジェクト名（オプション）
 * @param markdownDocuments ドキュメント情報の配列
 * @returns プロジェクト名と要約結果
 */
export async function determineProjectName(
  customProjectName: string | undefined,
  markdownDocuments: DocumentInfo[]
): Promise<{ projectName: string; summarizationResult?: SummarizationResult }> {
  // カスタムプロジェクト名が指定されている場合
  if (customProjectName) {
    const projectName = sanitizeProjectName(customProjectName);
    
    if (!projectName) {
      console.warn('Warning: Specified project name is invalid. Using LLM suggestion instead.');
      // カスタム名が無効な場合はLLMによる提案を使用
    } else {
      console.log(`Using specified project name "${customProjectName}" as "${projectName}".`);
      return { projectName };
    }
  }
  
  // LLMによるプロジェクト名の提案
  console.log('Starting document summarization...');
  try {
    const summarizationResult = await summarizeDocuments(markdownDocuments);
    console.log('Summarization results:');
    console.log(`  Suggested project name: ${summarizationResult.projectName}`);
    console.log(`  Summary: ${summarizationResult.summary}`);
    console.log('  Main topics:');
    summarizationResult.topics.forEach(topic => console.log(`    - ${topic}`));
    
    let projectName = sanitizeProjectName(summarizationResult.projectName);
    
    // プロジェクト名が空になった場合はデフォルト値を使用
    if (!projectName) {
      projectName = 'markdown-docs-server';
      console.warn('Warning: Project name suggested by LLM is invalid. Using default name.');
    }
    
    console.log(`Using LLM suggested project name "${summarizationResult.projectName}" as "${projectName}".`);
    return { projectName, summarizationResult };
  } catch (error) {
    console.error('Error occurred during LLM summarization:', error);
    // エラーが発生した場合はデフォルト値を使用
    return { projectName: 'markdown-docs-server' };
  }
}

/**
 * ドキュメント情報を処理する（説明を生成する）
 * @param documents ドキュメント情報の配列
 * @returns 処理後のドキュメント情報の配列
 */
export async function processDocumentInfo(documents: DocumentInfo[]): Promise<DocumentInfo[]> {
  console.log('Generating descriptions for each document...');
  
  for (const doc of documents) {
    try {
      doc.description = await generateDocumentDescription(doc);
      console.log(`  - ${doc.path} description: ${doc.description}`);
    } catch (err) {
      console.warn(`Warning: Error occurred while generating description for document ${doc.path}.`, err);
      doc.description = `Document: ${path.basename(doc.path)}`;
    }
  }
  
  return documents;
}

/**
 * MCPサーバー関連ファイルを生成する
 * @param projectName プロジェクト名
 * @param summarization 要約結果
 * @param documents ドキュメント情報の配列
 * @param docsDir ドキュメントディレクトリ
 * @param customOutDir カスタム出力ディレクトリ（オプション）
 * @returns サーバー出力パスと設定ファイルパス
 */
export async function generateMcpServerArtifacts(
  projectName: string,
  summarization: SummarizationResult,
  documents: DocumentInfo[],
  docsDir: string,
  customOutDir?: string
): Promise<{ serverOutputPath: string; configFilePath: string }> {
  // MCPツールメタデータの生成
  console.log('Generating MCP tool metadata...');
  const mcpToolMetadata: McpToolMetadata = generateMcpToolMetadata(
    projectName,
    summarization,
    documents,
    docsDir
  );
  console.log('MCP tool metadata:');
  console.log(`  Tool name: ${mcpToolMetadata.toolName}`);
  console.log(`  Tool description (partial): ${mcpToolMetadata.toolDescription.substring(0, 100)}...`);
  console.log(`  Available paths (${mcpToolMetadata.availablePaths.length}):`)
  mcpToolMetadata.availablePaths.slice(0, 5).forEach(p => console.log(`    - ${p.path} (${p.description})`));
  
  // MCPサーバーの生成
  console.log('Generating MCP server...');
  const serverOutputPath = await generateMcpServer(
    mcpToolMetadata,
    projectName,
    docsDir,
    customOutDir
  );
  console.log(`MCP server successfully generated at ${serverOutputPath}.`);
  
  // MCPサーバー設定ファイルの生成
  console.log('Generating MCP Server configuration file...');
  const configFilePath = await generateMcpServerConfig(projectName, serverOutputPath);
  console.log(`MCP Server configuration file successfully generated at ${configFilePath}.`);
  
  return { serverOutputPath, configFilePath };
}

/**
 * 完了メッセージを表示する
 * @param projectName プロジェクト名
 * @param serverOutputPath サーバー出力パス
 * @param customOutDir カスタム出力ディレクトリ（オプション）
 */
export function displayCompletionMessage(
  projectName: string,
  serverOutputPath: string,
  customOutDir?: string
): void {
  const serverLocation = customOutDir
    ? path.join(customOutDir, projectName)
    : path.join(os.homedir(), '.mcp-server', projectName);
  
  console.log('\n=== Processing Complete ===');
  console.log(`Generated MCP server is located at ${serverLocation}.`);
  console.log('To start the server, run the following commands:');
  console.log(`  cd ${serverLocation}`);
  console.log('  npm install');
  console.log('  npm run dev');
  console.log('\nAlternatively, you can connect from an MCP client using the generated configuration file.');
}

/**
 * メイン処理
 */
export async function main(argv: string[] = process.argv): Promise<void> {
  try {
    // コマンドライン引数の解析
    const { docsDir, customOutDir, customProjectName } = parseCommandLineOptions(argv);
    
    console.log(`Specified document directory: ${docsDir}`);
    if (customOutDir) {
      console.log(`Specified output directory: ${customOutDir}`);
    }
    if (customProjectName) {
      console.log(`Specified project name: ${customProjectName}`);
    }
    
    // ドキュメントディレクトリの検証
    await validateDocsDirectory(docsDir);
    
    // Markdownファイルの検索
    console.log('Searching for Markdown files...');
    const markdownFilePaths = await findMarkdownFiles(docsDir);
    
    if (markdownFilePaths.length === 0) {
      console.log(`No Markdown files found in ${docsDir}.`);
      return; // 正常終了
    }
    
    console.log(`Found Markdown files: (${markdownFilePaths.length})`);
    markdownFilePaths.forEach(filePath => console.log(`  - ${filePath}`));
    
    // Markdownファイルの読み込み
    const markdownDocuments = await loadMarkdownDocuments(markdownFilePaths);
    
    // プロジェクト名の決定
    const { projectName, summarizationResult } = await determineProjectName(
      customProjectName,
      markdownDocuments
    );
    
    // ドキュメント情報の処理
    const processedDocuments = await processDocumentInfo(markdownDocuments);
    
    // 要約結果の準備
    const finalSummarization = summarizationResult || {
      projectName: customProjectName || 'Unknown Project',
      summary: `Collection of Markdown documents in ${path.basename(docsDir)} directory`,
      topics: processedDocuments.slice(0, 5).map(doc => doc.title || path.basename(doc.path))
    };
    
    // MCPサーバー関連ファイルの生成
    const { serverOutputPath } = await generateMcpServerArtifacts(
      projectName,
      finalSummarization,
      processedDocuments,
      docsDir,
      customOutDir
    );
    
    // 完了メッセージの表示
    displayCompletionMessage(projectName, serverOutputPath, customOutDir);
    
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred:', error);
    }
    process.exit(1);
  }
}

// メイン処理の実行
if (require.main === module) {
  main().catch(err => {
    console.error("Unexpected error occurred:", err);
    process.exit(1);
  });
}