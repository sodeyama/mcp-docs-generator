import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { McpToolMetadata } from './metadata-generator';
import { execSync } from 'child_process';

// 定数
const DEFAULT_MCP_SERVER_DIR = '.mcp-server';
const DEFAULT_PORT = 3000;
const SERVER_VERSION = '1.0.0';
const TRANSPORT_TYPE = 'stdio';
const SRC_DIR_NAME = 'src';
const DIST_DIR_NAME = 'dist';
const LOGS_DIR_NAME = 'logs';
const DEBUG_LOG_FILENAME = 'debug.log';

// ファイル名
const PACKAGE_JSON = 'package.json';
const TSCONFIG_JSON = 'tsconfig.json';
const MCP_SERVER_CONFIG_JSON = 'mcp-server-config.json';
const INDEX_TS = 'index.ts';
const ENV_EXAMPLE = '.env.example';
const GITIGNORE = '.gitignore';
const MCP_CONFIG_JSON = 'mcp-config.json';

// 依存関係のバージョン
const DEPENDENCIES = {
  '@modelcontextprotocol/sdk': '^1.1.4',
  'dotenv': '^16.0.0',
  'zod': '^3.22.4'
};

const DEV_DEPENDENCIES = {
  '@types/node': '^20.0.0',
  'ts-node': '^10.9.2',
  'typescript': '^5.0.0'
};

/**
 * MCPサーバーの出力ディレクトリを解決する
 * @param projectName プロジェクト名
 * @param customOutDir カスタム出力ディレクトリ（オプション）
 * @returns 解決されたディレクトリパス
 */
function resolveServerOutDir(projectName: string, customOutDir?: string): string {
  if (customOutDir) {
    // カスタム出力ディレクトリが指定されている場合、プロジェクト名をサブディレクトリとして結合
    return path.resolve(customOutDir, projectName);
  }
  // デフォルトは ~/.mcp-server/{project_name}
  return path.join(os.homedir(), DEFAULT_MCP_SERVER_DIR, projectName);
}

/**
 * ディレクトリを作成してからファイルを書き込む
 * @param filePath ファイルパス
 * @param content ファイルの内容
 */
async function writeFileEnsuringDir(filePath: string, content: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`  File created: ${filePath}`);
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * package.jsonの内容を生成する
 * @param serverProjectName サーバープロジェクト名
 * @returns package.jsonの内容
 */
function getServerPackageJsonContent(serverProjectName: string): string {
  const packageJson = {
    name: serverProjectName,
    version: SERVER_VERSION,
    description: `MCP Server for ${serverProjectName}`,
    main: `${DIST_DIR_NAME}/index.js`,
    type: 'module',
    scripts: {
      build: 'tsc',
      start: `node ${DIST_DIR_NAME}/index.js`,
      dev: `ts-node --esm ${SRC_DIR_NAME}/index.ts`
    },
    dependencies: DEPENDENCIES,
    devDependencies: DEV_DEPENDENCIES
  };
  
  return JSON.stringify(packageJson, null, 2);
}

/**
 * tsconfig.jsonの内容を生成する
 * @returns tsconfig.jsonの内容
 */
function getServerTsConfigJsonContent(): string {
  const tsConfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      rootDir: `./${SRC_DIR_NAME}`,
      outDir: `./${DIST_DIR_NAME}`,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      strict: true,
      skipLibCheck: true,
      resolveJsonModule: true
    },
    include: [`${SRC_DIR_NAME}/**/*`]
  };
  
  return JSON.stringify(tsConfig, null, 2);
}

/**
 * 利用可能なパスのマッピングを作成する
 * @param metadata MCPツールメタデータ
 * @returns パスマッピング
 */
function createPathMapping(metadata: McpToolMetadata): Record<string, {
  originalPath: string;
  title: string | null;
  description: string;
}> {
  return metadata.availablePaths.reduce((acc, p) => {
    acc[p.path] = {
      originalPath: p.originalPath,
      title: p.title || null,
      description: p.description
    };
    return acc;
  }, {} as Record<string, { originalPath: string, title: string | null, description: string }>);
}

/**
 * MCPサーバー設定ファイルの内容を生成する
 * @param metadata MCPツールメタデータ
 * @returns 設定ファイルの内容
 */
function getMcpServerConfigJsonContent(metadata: McpToolMetadata): string {
  // mcp-server-config.jsonの内容を生成
  const config = {
    port: DEFAULT_PORT,
    name: metadata.toolName,
    description: metadata.toolDescription,
    availablePaths: metadata.availablePaths.map(p => p.path),
    // MCPサーバー設定
    server: {
      name: metadata.toolName,
      version: SERVER_VERSION,
      transport: TRANSPORT_TYPE
    }
  };
  
  return JSON.stringify(config, null, 2);
}

/**
 * サーバーのindex.tsファイルの内容を生成する
 * @param metadata MCPツールメタデータ
 * @returns index.tsの内容
 */
function getServerIndexTsContent(metadata: McpToolMetadata): string {
  // 利用可能なパスのマッピングを作成
  const pathMapping = createPathMapping(metadata);

  return `
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// 環境変数の読み込み
dotenv.config();

// ESM用のディレクトリ名を取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定
const TOOL_NAME = "${metadata.toolName}";
const TOOL_DESCRIPTION = \`${metadata.toolDescription}\`;

// 利用可能なパスのマッピング
const PATH_MAPPING = ${JSON.stringify(pathMapping, null, 2)};

// 利用可能なパスのリスト
const AVAILABLE_PATHS = Object.keys(PATH_MAPPING);

// デバッグ情報をファイルに記録する関数
async function logDebug(message: string): Promise<void> {
  // デバッグモードが環境変数で有効になっている場合のみファイルに記録
  if (process.env.DEBUG === 'true') {
    try {
      const logDir = path.join(__dirname, '../${LOGS_DIR_NAME}');
      // ログディレクトリが存在しない場合は作成
      await fs.mkdir(logDir, { recursive: true }).catch(() => {});
      
      const logFile = path.join(logDir, '${DEBUG_LOG_FILENAME}');
      await fs.appendFile(logFile, \`\${new Date().toISOString()} - \${message}\\n\`);
    } catch (err) {
      // エラーが発生しても標準出力には出力しない
    }
  }
}

// ドキュメントの内容を読み込む関数
async function readMarkdownContent(originalPath: string): Promise<string> {
  try {
    return await fs.readFile(originalPath, 'utf-8');
  } catch (e) {
    await logDebug(\`Error reading original file \${originalPath} from server: \${e instanceof Error ? e.message : String(e)}\`);
    throw new Error(\`Could not read document: \${originalPath}\`);
  }
}

// ドキュメントリクエストを処理する関数
async function handleDocumentRequest(documentPath: string): Promise<{ content: string; path: string; title: string | null }> {
  const pathInfo = PATH_MAPPING[documentPath as keyof typeof PATH_MAPPING];
  
  if (!pathInfo) {
    throw new Error(\`Document not found for path: \${documentPath}\`);
  }

  // 元のファイルパスから内容を読み込む
  const content = await readMarkdownContent(pathInfo.originalPath);

  return {
    content,
    path: documentPath,
    title: pathInfo.title
  };
}

// サーバーの初期化
const server = new Server(
  {
    name: TOOL_NAME,
    version: "${SERVER_VERSION}"
  },
  {
    capabilities: {
      prompts: {},
      tools: {}
    }
  }
);

// prompts/listハンドラーの実装（必須）
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: []  // プロンプトがない場合は空配列を返す
  };
});

// prompts/getハンドラーの実装（オプションだが推奨）
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  // プロンプトがない場合はエラーを返す
  throw new Error(\`Unknown prompt: \${request.params.name}\`);
});

// tools/listハンドラーの実装
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            document_path: {
              type: "string",
              enum: AVAILABLE_PATHS,
              description: "Relative path of the document you want to retrieve. See tool description for available paths."
            }
          },
          required: ["document_path"]
        }
      }
    ]
  };
});

// tools/callハンドラーの実装
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== TOOL_NAME) {
    throw new Error(\`Unknown tool: \${request.params.name}\`);
  }

  const { document_path } = request.params.arguments as { document_path?: string };

  if (!document_path) {
    throw new Error("document_path is required.");
  }
  
  // 利用可能なパスかどうかチェック
  if (!AVAILABLE_PATHS.includes(document_path)) {
    throw new Error(\`Invalid document_path: \${document_path}. Please choose from available paths.\`);
  }
  
  // ドキュメントリクエストの処理
  const result = await handleDocumentRequest(document_path);
  
  return {
    content: [{
      type: "text",
      text: result.content
    }],
    _meta: {
      path: result.path,
      title: result.title
    }
  };
});

// サーバーの起動
const transport = new StdioServerTransport();

// トランスポートの設定と接続
(async () => {
  try {
    await server.connect(transport);
    await logDebug(\`MCP Server for \${TOOL_NAME} started successfully\`);
    await logDebug(\`Available tool: \${TOOL_NAME}\`);
    await logDebug(\`Available paths: \${AVAILABLE_PATHS.length}\`);
  } catch (err) {
    await logDebug(\`Error connecting to transport: \${err instanceof Error ? err.message : String(err)}\`);
    console.error('Failed to start MCP server:', err);
    process.exit(1);
  }
})();
`;
}

/**
 * .env.exampleファイルの内容を生成する
 * @returns .env.exampleの内容
 */
function getEnvExampleContent(): string {
  return `ANTHROPIC_API_KEY=YOUR_KEY_IF_SERVER_USES_LLM_DIRECTLY\nPORT=${DEFAULT_PORT}`;
}

/**
 * .gitignoreファイルの内容を生成する
 * @returns .gitignoreの内容
 */
function getGitignoreContent(): string {
  return "/node_modules\n/dist\n.env\n*.env";
}

/**
 * TypeScriptをコンパイルする
 * @param serverOutDir サーバー出力ディレクトリ
 */
async function compileTypeScript(serverOutDir: string): Promise<void> {
  try {
    console.log(`Compiling TypeScript...`);
    // distディレクトリの作成
    await fs.mkdir(path.join(serverOutDir, DIST_DIR_NAME), { recursive: true });
    
    // TypeScriptコンパイラのインストールと実行
    console.log(`  Running npm install...`);
    execSync('npm install', { cwd: serverOutDir, stdio: 'ignore' });
    
    console.log(`  Running npm run build...`);
    execSync('npm run build', { cwd: serverOutDir, stdio: 'ignore' });
    
    console.log(`TypeScript compilation completed.`);
  } catch (error) {
    console.warn(`Warning: Failed to compile TypeScript. Please compile manually.`, error);
  }
}

/**
 * サーバーファイルを生成する
 * @param serverOutDir サーバー出力ディレクトリ
 * @param serverSrcDir サーバーソースディレクトリ
 * @param projectName プロジェクト名
 * @param metadata MCPツールメタデータ
 */
async function generateServerFiles(
  serverOutDir: string,
  serverSrcDir: string,
  projectName: string,
  metadata: McpToolMetadata
): Promise<void> {
  // package.json
  await writeFileEnsuringDir(
    path.join(serverOutDir, PACKAGE_JSON),
    getServerPackageJsonContent(projectName)
  );

  // tsconfig.json
  await writeFileEnsuringDir(
    path.join(serverOutDir, TSCONFIG_JSON),
    getServerTsConfigJsonContent()
  );

  // mcp-server-config.json
  await writeFileEnsuringDir(
    path.join(serverOutDir, MCP_SERVER_CONFIG_JSON),
    getMcpServerConfigJsonContent(metadata)
  );

  // src/index.ts (サーバーエントリーポイント)
  await writeFileEnsuringDir(
    path.join(serverSrcDir, INDEX_TS),
    getServerIndexTsContent(metadata)
  );

  // .env.example
  await writeFileEnsuringDir(
    path.join(serverOutDir, ENV_EXAMPLE),
    getEnvExampleContent()
  );

  // .gitignore
  await writeFileEnsuringDir(
    path.join(serverOutDir, GITIGNORE),
    getGitignoreContent()
  );
}

/**
 * 完了メッセージを表示する
 * @param serverOutDir サーバー出力ディレクトリ
 */
function displayCompletionMessage(serverOutDir: string): void {
  console.log(`MCP server generation completed: ${serverOutDir}`);
  console.log(`To start the server, run the following commands:`);
  console.log(`  cd ${serverOutDir}`);
  console.log(`  npm install`);
  console.log(`  npm run dev (development mode) or npm start (after building)`);
}

/**
 * MCPサーバーのコード一式を生成し、指定されたディレクトリに出力する
 * @param metadata 生成されたMCPツールメタデータ
 * @param projectName プロジェクト名（サーバー出力ディレクトリ名としても使用）
 * @param generatorDocsDir このジェネレーターがドキュメントを読み込んだ元のディレクトリパス
 * @param customOutDirRoot MCPサーバーを配置するカスタムルートディレクトリ（オプション）
 * @returns サーバー出力ディレクトリパス
 */
export async function generateMcpServer(
  metadata: McpToolMetadata,
  projectName: string,
  generatorDocsDir: string,
  customOutDirRoot?: string
): Promise<string> {
  try {
    // サーバー出力ディレクトリを解決
    const serverOutDir = resolveServerOutDir(projectName, customOutDirRoot);
    const serverSrcDir = path.join(serverOutDir, SRC_DIR_NAME);

    console.log(`Generating MCP server at ${serverOutDir}...`);

    // サーバーファイルの生成
    await generateServerFiles(serverOutDir, serverSrcDir, projectName, metadata);

    // TypeScriptのコンパイル
    await compileTypeScript(serverOutDir);

    // 完了メッセージの表示
    displayCompletionMessage(serverOutDir);

    return serverOutDir;
  } catch (error) {
    throw new Error(`Failed to generate MCP server: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * MCPサーバーの実行用設定ファイルを生成する
 * @param projectName プロジェクト名
 * @param serverOutputPath MCPサーバーの出力ディレクトリ
 * @returns 生成された設定ファイルのパス
 */
export async function generateMcpServerConfig(projectName: string, serverOutputPath: string): Promise<string> {
  try {
    // ビルドされたJSファイルへのパスを構築
    const buildIndexJsPath = path.join(serverOutputPath, DIST_DIR_NAME, 'index.js');
    
    // 設定ファイルの内容を作成
    const config = {
      mcpServers: {
        [projectName]: {
          command: 'node', // システムPATHから検索可能にする
          args: [
            buildIndexJsPath // ビルドされたJSファイルへのパス
          ]
        }
      },
      globalShortcut: "Shift+Alt+Space"
    };
    
    // 設定ファイルの内容をJSON文字列に変換
    const configJson = JSON.stringify(config, null, 2);
    
    // 設定ファイルのパス（dist配下に生成）
    const configFilePath = path.join(serverOutputPath, DIST_DIR_NAME, MCP_CONFIG_JSON);
    
    // ディレクトリが存在しない場合は作成
    await fs.mkdir(path.dirname(configFilePath), { recursive: true });
    
    // 設定ファイルを書き込み
    await fs.writeFile(configFilePath, configJson, 'utf-8');
    
    // コンソールにもコピペ用に出力
    console.log('\n=== MCP Server Configuration File Content (for copy-paste) ===\n');
    console.log(configJson);
    console.log('\n=== End of Configuration File Content ===\n');
    
    return configFilePath;
  } catch (error) {
    throw new Error(`Failed to generate MCP server config: ${error instanceof Error ? error.message : String(error)}`);
  }
}