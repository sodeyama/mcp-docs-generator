import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { McpToolMetadata } from './metadata-generator';
import { execSync } from 'child_process';

/**
 * Function to resolve the output directory for the MCP server
 * @param projectName Project name
 * @param customOutDir Custom output directory (optional)
 * @returns Resolved directory path
 */
function resolveServerOutDir(projectName: string, customOutDir?: string): string {
  if (customOutDir) {
    // If custom output directory is specified, combine with project name as subdirectory
    return path.resolve(customOutDir, projectName);
  }
  // Default is ~/.mcp-server/{project_name}
  return path.join(os.homedir(), '.mcp-server', projectName);
}

/**
 * Helper function to generate a file
 * @param filePath File path
 * @param content File content
 */
async function writeFileEnsuringDir(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  console.log(`  File created: ${filePath}`);
}

/**
 * Function to generate package.json content
 * @param serverProjectName Server project name
 * @returns package.json content
 */
function getServerPackageJsonContent(serverProjectName: string): string {
  return `{
  "name": "${serverProjectName}",
  "version": "1.0.0",
  "description": "MCP Server for ${serverProjectName}",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node --esm src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.1.4",
    "dotenv": "^16.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.0.0"
  }
}`;
}

/**
 * Function to generate tsconfig.json content
 * @returns tsconfig.json content
 */
function getServerTsConfigJsonContent(): string {
  return `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}`;
}

/**
 * Function to generate MCP Server configuration file content
 * @param metadata MCP tool metadata
 * @returns Configuration file content
 */
function getMcpServerConfigJsonContent(metadata: McpToolMetadata): string {
  // Generate content for mcp-server-config.json
  const config = {
    port: 3000, // Default port
    name: metadata.toolName,
    description: metadata.toolDescription,
    availablePaths: metadata.availablePaths.map(p => p.path),
    // MCP server configuration
    server: {
      name: metadata.toolName,
      version: "1.0.0",
      transport: "stdio"
    }
  };
  return JSON.stringify(config, null, 2);
}

/**
 * Function to generate the content of the server's index.ts file
 * @param metadata MCP tool metadata
 * @returns index.ts content
 */
function getServerIndexTsContent(metadata: McpToolMetadata): string {
  // Create mapping of available paths
  const pathMapping = metadata.availablePaths.reduce((acc, p) => {
    acc[p.path] = {
      originalPath: p.originalPath,
      title: p.title || null,
      description: p.description
    };
    return acc;
  }, {} as Record<string, { originalPath: string, title: string | null, description: string }>);

  return `
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Get directory name for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TOOL_NAME = "${metadata.toolName}";
const TOOL_DESCRIPTION = \`${metadata.toolDescription}\`;

// Mapping of available paths
const PATH_MAPPING = ${JSON.stringify(pathMapping, null, 2)};

// List of available paths
const AVAILABLE_PATHS = Object.keys(PATH_MAPPING);

// Function to read document content
async function readMarkdownContent(originalPath) {
  try {
    return await fs.readFile(originalPath, 'utf-8');
  } catch (e) {
    await logDebug(\`Error reading original file \${originalPath} from server: \${e.message}\`);
    throw new Error(\`Could not read document: \${originalPath}\`);
  }
}

// Function to handle document request
async function handleDocumentRequest(documentPath) {
  const pathInfo = PATH_MAPPING[documentPath];
  
  if (!pathInfo) {
    throw new Error(\`Document not found for path: \${documentPath}\`);
  }

  // Read content from original file path
  const content = await readMarkdownContent(pathInfo.originalPath);

  return {
    content,
    path: documentPath,
    title: pathInfo.title
  };
}

// Create MCP server
const server = new McpServer({
  name: TOOL_NAME,
  version: "1.0.0"
});

// Add document retrieval tool
server.tool(
  TOOL_NAME,
  {
    document_path: z.enum(AVAILABLE_PATHS)
      .describe("Relative path of the document you want to retrieve. See tool description for available paths.")
  },
  async ({ document_path }) => {
    if (!document_path) {
      throw new Error("document_path is required.");
    }
    
    // Check if it's an available path
    if (!AVAILABLE_PATHS.includes(document_path)) {
      throw new Error(\`Invalid document_path: \${document_path}. Please choose from available paths.\`);
    }
    
    // Process document request
    const result = await handleDocumentRequest(document_path);
    
    return {
      content: [{
        type: "text",
        text: result.content
      }],
      metadata: {
        path: result.path,
        title: result.title
      }
    };
  }
);

// Start server
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Function to log debug information to file
async function logDebug(message) {
  // Only log to file if debug mode is enabled via environment variable
  if (process.env.DEBUG === 'true') {
    try {
      const logDir = path.join(__dirname, '../logs');
      // Create log directory if it doesn't exist
      await fs.mkdir(logDir, { recursive: true }).catch(() => {});
      
      const logFile = path.join(logDir, 'debug.log');
      await fs.appendFile(logFile, \`\${new Date().toISOString()} - \${message}\\n\`);
    } catch (err) {
      // Don't output to stdout even if an error occurs
    }
  }
}

// Configure transport and connect
const transport = new StdioServerTransport();
server.connect(transport).then(async () => {
  // Don't output directly to stdout, log to debug log
  await logDebug(\`MCP Server for \${TOOL_NAME} listening\`);
  await logDebug(\`Available tool: \${TOOL_NAME}\`);
  await logDebug(\`Available paths: \${AVAILABLE_PATHS.length}\`);
}).catch(async (err) => {
  await logDebug(\`Error connecting to transport: \${err.message}\`);
});
`;
}

/**
 * Generates a complete set of MCP server code and outputs it to the specified directory.
 * @param metadata Generated MCP tool metadata
 * @param projectName Project name (also used for server output directory name)
 * @param generatorDocsDir Original directory path from which this generator read documents
 * @param customOutDirRoot Custom root directory for placing MCP servers (optional)
 * @returns Server output directory path
 */
export async function generateMcpServer(
  metadata: McpToolMetadata,
  projectName: string,
  generatorDocsDir: string,
  customOutDirRoot?: string
): Promise<string> {
  const serverOutDir = resolveServerOutDir(projectName, customOutDirRoot);
  const serverSrcDir = path.join(serverOutDir, 'src');

  console.log(`Generating MCP server at ${serverOutDir}...`);

  // package.json
  await writeFileEnsuringDir(
    path.join(serverOutDir, 'package.json'),
    getServerPackageJsonContent(projectName)
  );

  // tsconfig.json
  await writeFileEnsuringDir(
    path.join(serverOutDir, 'tsconfig.json'),
    getServerTsConfigJsonContent()
  );

  // mcp-server-config.json
  await writeFileEnsuringDir(
    path.join(serverOutDir, 'mcp-server-config.json'),
    getMcpServerConfigJsonContent(metadata)
  );

  // src/index.ts (サーバーエントリーポイント)
  await writeFileEnsuringDir(
    path.join(serverSrcDir, 'index.ts'),
    getServerIndexTsContent(metadata)
  );

  // .env.example for server
  const serverEnvExample = `ANTHROPIC_API_KEY=YOUR_KEY_IF_SERVER_USES_LLM_DIRECTLY\nPORT=3000`;
  await writeFileEnsuringDir(
    path.join(serverOutDir, '.env.example'),
    serverEnvExample
  );

  // .gitignore for server
  const serverGitignore = "/node_modules\n/dist\n.env\n*.env";
  await writeFileEnsuringDir(
    path.join(serverOutDir, '.gitignore'),
    serverGitignore
  );

  // Compile TypeScript
  try {
    console.log(`Compiling TypeScript...`);
    // Create dist directory
    await fs.mkdir(path.join(serverOutDir, 'dist'), { recursive: true });
    
    // Install and run TypeScript compiler
    console.log(`  Running npm install...`);
    execSync('npm install', { cwd: serverOutDir, stdio: 'ignore' });
    
    console.log(`  Running npm run build...`);
    execSync('npm run build', { cwd: serverOutDir, stdio: 'ignore' });
    
    console.log(`TypeScript compilation completed.`);
  } catch (error) {
    console.warn(`Warning: Failed to compile TypeScript. Please compile manually.`, error);
  }

  console.log(`MCP server generation completed: ${serverOutDir}`);
  console.log(`To start the server, run the following commands:`);
  console.log(`  cd ${serverOutDir}`);
  console.log(`  npm install`);
  console.log(`  npm run dev (development mode) or npm start (after building)`);

  return serverOutDir;
}

/**
 * Generates a configuration file for running the MCP Server.
 * @param projectName Project name
 * @param serverOutputPath Output directory for the MCP server
 * @returns Path to the generated configuration file
 */
export async function generateMcpServerConfig(projectName: string, serverOutputPath: string): Promise<string> {
  // Construct path to the built JS file
  const buildIndexJsPath = path.join(serverOutputPath, 'dist', 'index.js');
  
  // Create configuration file content
  const config = {
    mcpServers: {
      [projectName]: {
        command: 'node', // Make it searchable from system PATH
        args: [
          buildIndexJsPath // Path to the built JS file
        ]
      }
    },
    globalShortcut: "Shift+Alt+Space"
  };
  
  // Convert configuration file content to JSON string
  const configJson = JSON.stringify(config, null, 2);
  
  // Configuration file path (generated under dist)
  const configFilePath = path.join(serverOutputPath, 'dist', 'mcp-config.json');
  
  // Create directory if it doesn't exist
  await fs.mkdir(path.dirname(configFilePath), { recursive: true });
  
  // Write configuration file
  await fs.writeFile(configFilePath, configJson, 'utf-8');
  
  // Also output to console standard output for copy-paste
  console.log('\n=== MCP Server Configuration File Content (for copy-paste) ===\n');
  console.log(configJson);
  console.log('\n=== End of Configuration File Content ===\n');
  
  return configFilePath;
}