# MCP Docs Generator

A generator that creates dynamic MCP tool definitions from Markdown documents

## Overview

This tool is a system that automatically generates document search MCP tools for Anthropic Claude from Markdown document directories. The basic MCP-Server implementation is fixed, and the document content is summarized and analyzed using LLM (Anthropic Claude), which optimizes the tool's name, description, and other metadata based on the results. Users only need to specify the document directory, and an MCP server optimized for the document content will be generated.

### Key Features

1. **Document Analysis and LLM Summarization**
   - Scan Markdown files in the specified directory
   - Summarize and analyze document content using LLM
   - Extract key topics and information structure

2. **Tool Metadata Generation**
   - Generate appropriate names based on project name
   - Create optimal descriptions utilizing LLM summaries
   - Dynamically generate available path lists and descriptions

3. **MCP Server Template Application**
   - Apply dynamic metadata to fixed server implementation
   - Reflect necessary settings
   - Generate startup scripts
   - Compatible with the latest @modelcontextprotocol/sdk v1.x

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Anthropic API key

### Installation Steps

1. Clone or download the repository.
   ```bash
   git clone <repository URL>
   cd mcp-docs-generator
   ```

2. Install dependencies.
   ```bash
   npm install
   ```

3. Set up environment variables.
   - Copy `.env.example` to `.env` and enter the necessary information.
   ```bash
   cp .env.example .env
   # Edit the .env file to set up API keys
   ```
   - Alternatively, you can set them directly as system environment variables (these take precedence).

## Usage

### Setting Environment Variables

You can set the following environment variables. They are prioritized in this order: System environment variables > .env file > default values.

- `ANTHROPIC_API_KEY` (required): Anthropic API key
- `ANTHROPIC_API_MODEL` (optional): Anthropic model to use (default: `claude-3-sonnet-20240229`)

### Build and Run

1. Build the TypeScript code.
   ```bash
   npm run build
   ```

2. Run the generator.
   ```bash
   npm start -- -d <document directory path>
   ```
   
   To specify a custom output directory:
   ```bash
   npm start -- -d <document directory path> -o <output directory path>
   ```

   To specify a project name:
   ```bash
   npm start -- -d <document directory path> -p <project name>
   ```

   Alternatively, you can run it directly in development mode.
   ```bash
   npm run dev -- -d <document directory path>
   ```

### Examples

```bash
# Run in development mode
npm run dev -- -d ./docs

# Build and run
npm run build
npm start -- -d ./docs

# Run with custom output directory
npm start -- -d ./docs -o ./output-servers

# Run with specified project name
npm start -- -d ./docs -p "my-project-docs"

# Run with all options
npm start -- -d ./docs -o ./output-servers -p "my-project-docs"
```

## Creating and Using MCP Servers

### MCP Server Creation Process

This tool creates MCP servers through the following steps:

1. **Document Analysis**
   - Search for Markdown files in the specified directory
   - Read the content of each file and extract titles

2. **LLM Summarization**
   - Send document content to the Anthropic Claude API
   - Get project name, summary, and key topics
   - Generate concise descriptions for each document

3. **Metadata Generation**
   - Generate tool name, description, and list of available paths
   - Map each document's path, title, and description
   - Validate MCP tool name length (64 character limit for `mcp__<server-name>__<tool-name>` format)

4. **Server Code Generation**
   - Generate TypeScript code in ES module format
   - Create package.json, tsconfig.json, and other configuration files
   - Compile TypeScript code

5. **Configuration File Generation**
   - Generate configuration files for MCP clients

### Output Location

By default, the generated MCP server is output to the following directory:
```
~/.mcp-server/{project name}
```

If a custom output directory is specified, it will be generated in that directory:
```
<custom output directory>/{project name}
```

### Generated Files

The MCP server directory contains the following files:

- `package.json`: Definition of dependencies and execution scripts
- `tsconfig.json`: TypeScript compiler settings
- `mcp-server-config.json`: MCP server configuration
- `src/index.ts`: Main server code
- `.env.example`: Example environment variable settings
- `.gitignore`: Git exclusion file settings
- `dist/`: Compiled JavaScript files
- `dist/mcp-config.json`: Configuration file for MCP clients

### Starting the Server

To start the generated MCP server, run the following commands:

```bash
cd ~/.mcp-server/{project name}
npm install
npm run dev  # Development mode
# or
npm start    # Run after build
```

### Connecting with MCP Clients

The generated MCP server can be connected to and used from MCP clients (e.g., Claude AI).

1. **Using the Configuration File**
   - Copy the generated `dist/mcp-config.json` file to the MCP client's configuration directory
   - Or use the configuration content output to the console

2. **Manual Connection**
   - Add a new server in the MCP client
   - Specify the server name and port (default: 3000)

### Using MCP Tools

The generated MCP server provides the following features:

1. **Retrieving Document Content**
   - You can retrieve the content of documents at specified paths
   - Example: `document_path: "path/to/document.md"`

2. **Getting Document Titles**
   - Title information extracted from Markdown files is also provided
   - Example: `title: "Document Title"`

3. **Document Descriptions**
   - Concise descriptions summarized by LLM for each document are provided
   - Example: `description: "This document explains how to use the API"`

## Notes

- The generated server directly accesses the original document files. You need to ensure these files are accessible from the environment where the server is running.
- For more robust operation, consider additional processing such as copying document files under server management.
- LLM summarization processing may take time depending on the amount and complexity of documents.
- Be careful with API key management. Make sure `.env` file is added to `.gitignore` to prevent committing it to Git repositories.

## Troubleshooting

### API Key Error

```
Error: ANTHROPIC_API_KEY is not set in the .env file.
```

- Check that `ANTHROPIC_API_KEY` is correctly set in the `.env` file.
- Or set `ANTHROPIC_API_KEY` as a system environment variable.

### Document Directory Not Found

```
Error: Directory <path> not found.
```

- Check that the path to the document directory is correct.
- For relative paths, note that they are relative to the current directory.

### MCP Tool Name Length Limit Error

```
Error: MCPツール名が64文字制限を超えています: "mcp__very-long-project-name__search-very-long-project-name-docs" (XX文字)
制限: 64文字
サーバー名: "very-long-project-name" (XX文字)
ツール名: "search-very-long-project-name-docs" (XX文字)
プロジェクト名またはツール名を短くしてください。
```

This error occurs when the generated MCP tool name exceeds the 64-character limit. The MCP tool name format is `mcp__<server-name>__<tool-name>`. To resolve this:

1. Use a shorter project name with the `-p` option:
   ```bash
   npm start -- -d ./docs -p "short-name"
   ```

2. Or rename your document directory to a shorter name and use that as the project name.

### MCP Server Startup Error

```
SyntaxError: The requested module '@mastra/mcp' does not provide an export named 'createServer'
```

This error is due to changes in the API of the @mastra/mcp package. It can be resolved by:

1. Regenerating the MCP server using the latest version of the generator
2. Or modifying the `src/index.ts` file of the generated MCP server as follows:

```typescript
// Before
import { createServer } from '@mastra/mcp';
// ...
const server = createServer({...});

// After
import * as mcp from '@mastra/mcp';
// ...
const server = new mcp.Server({...});
```

3. After modification, run the following commands to rebuild the server:

```bash
cd ~/.mcp-server/{project name}
npm run build
npm start
```

### TypeScript Compilation Error

If TypeScript compilation of the generated MCP server fails, manually compile it with the following steps:

```bash
cd ~/.mcp-server/{project name}
npm install
npx tsc
```

## License

This project is released under the [ISC License](LICENSE).