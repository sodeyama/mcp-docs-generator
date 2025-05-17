import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { findMarkdownFiles, readMarkdownFile, extractTitleFromMarkdown } from './markdown-parser';
import { summarizeDocuments, generateDocumentDescription, DocumentInfo } from './llm-summarizer';
import { generateMcpToolMetadata, McpToolMetadata } from './metadata-generator';
import { generateMcpServer, generateMcpServerConfig } from './mcp-server-generator';

// Set program version and description
const program = new Command();
program
  .version('0.1.0')
  .description('Generator for creating dynamic MCP tool definitions from Markdown documents')
  .requiredOption('-d, --docs <type>', 'Path to directory containing Markdown documents')
  .option('-o, --output <type>', 'Output directory for MCP server (default: ~/.mcp-server/{project_name})')
  .option('-p, --project <type>', 'Project name (if not specified, LLM will suggest one)');

// Parse arguments
program.parse(process.argv);

// Get options
const options = program.opts();
const docsDir = options.docs as string;
const customOutDir = options.output as string | undefined;
const customProjectName = options.project as string | undefined;

// Define main process as async function
async function main() {
  console.log(`Specified document directory: ${docsDir}`);
  if (customOutDir) {
    console.log(`Specified output directory: ${customOutDir}`);
  }
  if (customProjectName) {
    console.log(`Specified project name: ${customProjectName}`);
  }

  try {
    // Check if directory exists
    const stats = await fs.stat(docsDir);
    if (!stats.isDirectory()) {
      console.error(`Error: ${docsDir} is not a directory.`);
      process.exit(1);
    }
    console.log(`${docsDir} is a valid directory.`);

    // Process Markdown files
    console.log('Searching for Markdown files...');
    const markdownFilePaths = await findMarkdownFiles(docsDir);

    if (markdownFilePaths.length === 0) {
      console.log(`No Markdown files found in ${docsDir}.`);
      process.exit(0); // Exit normally
    }

    console.log(`Found Markdown files: (${markdownFilePaths.length})`);
    markdownFilePaths.forEach(filePath => console.log(`  - ${filePath}`));

    // Read Markdown file contents
    const markdownDocuments: DocumentInfo[] = [];
    console.log('Reading Markdown file contents...');
    for (const filePath of markdownFilePaths) {
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
      console.error('Error: Failed to load all valid Markdown files.');
      process.exit(1);
    }

    // Determine project name (use custom if specified)
    let projectName = '';
    
    if (customProjectName) {
      // Use custom project name if specified
      projectName = customProjectName
        .toLowerCase() // Convert to lowercase
        .replace(/\s+/g, '-') // Convert spaces to hyphens
        .replace(/[^a-z0-9-]/g, ''); // Remove non-alphanumeric characters except hyphens
      
      if (!projectName) {
        console.warn('Warning: Specified project name is invalid. Using LLM suggestion instead.');
        // Continue with LLM processing below if invalid
      } else {
        console.log(`Using specified project name "${customProjectName}" as "${projectName}".`);
      }
    }

    // LLM summarization process (if custom project name is not specified or invalid)
    if (!customProjectName || !projectName) {
      console.log('Starting document summarization...');
      try {
        const summarizationResult = await summarizeDocuments(markdownDocuments);
        console.log('Summarization results:');
        console.log(`  Suggested project name: ${summarizationResult.projectName}`);
        console.log(`  Summary: ${summarizationResult.summary}`);
        console.log('  Main topics:');
        summarizationResult.topics.forEach(topic => console.log(`    - ${topic}`));

        // Determine project name
        projectName = summarizationResult.projectName
          .toLowerCase() // Convert to lowercase
          .replace(/\s+/g, '-') // Convert spaces to hyphens
          .replace(/[^a-z0-9-]/g, ''); // Remove non-alphanumeric characters except hyphens
        
        // Set default value if project name becomes empty
        if (!projectName) {
          projectName = 'markdown-docs-server';
          console.warn('Warning: Project name suggested by LLM is invalid. Using default name.');
        }
        
        console.log(`Using LLM suggested project name "${summarizationResult.projectName}" as "${projectName}".`);

        // Generate description for each document
        console.log('Generating descriptions for each document...');
        for (const doc of markdownDocuments) {
          try {
            doc.description = await generateDocumentDescription(doc);
            console.log(`  - ${doc.path} description: ${doc.description}`);
          } catch (err) {
            console.warn(`Warning: Error occurred while generating description for document ${doc.path}.`, err);
            doc.description = `Document: ${path.basename(doc.path)}`;
          }
        }

        // Generate MCP server metadata
        console.log('Generating MCP tool metadata...');
        const mcpToolMetadata: McpToolMetadata = generateMcpToolMetadata(
          projectName,
          summarizationResult,
          markdownDocuments,
          docsDir // Document root directory specified by CLI
        );
        console.log('MCP tool metadata:');
        console.log(`  Tool name: ${mcpToolMetadata.toolName}`);
        console.log(`  Tool description (partial): ${mcpToolMetadata.toolDescription.substring(0, 100)}...`);
        console.log(`  Available paths (${mcpToolMetadata.availablePaths.length}):`)
        mcpToolMetadata.availablePaths.slice(0, 5).forEach(p => console.log(`    - ${p.path} (${p.description})`)); // Show only first 5

        // Generate MCP server
        console.log('Generating MCP server...');
        const serverOutputPath = await generateMcpServer(
          mcpToolMetadata,
          projectName,
          docsDir, // Original document directory path
          customOutDir // Custom output directory (if specified)
        );
        console.log(`MCP server successfully generated at ${serverOutputPath}.`);

        // Generate configuration file for running MCP server
        console.log('Generating MCP Server configuration file...');
        const configFilePath = await generateMcpServerConfig(projectName, serverOutputPath);
        console.log(`MCP Server configuration file successfully generated at ${configFilePath}.`);

      } catch (processError) {
        console.error('Error occurred during processing.', processError);
        process.exit(1);
      }
    } else {
      // If custom project name is specified, skip LLM summarization and generate metadata directly
      // However, still generate descriptions for each document
      console.log('Generating descriptions for each document...');
      for (const doc of markdownDocuments) {
        try {
          doc.description = await generateDocumentDescription(doc);
          console.log(`  - ${doc.path} description: ${doc.description}`);
        } catch (err) {
          console.warn(`Warning: Error occurred while generating description for document ${doc.path}.`, err);
          doc.description = `Document: ${path.basename(doc.path)}`;
        }
      }

      // Create simple summarization result
      const simpleSummarization = {
        projectName: customProjectName,
        summary: `Collection of Markdown documents in ${path.basename(docsDir)} directory`,
        topics: markdownDocuments.slice(0, 5).map(doc => doc.title || path.basename(doc.path))
      };

      // Generate MCP server metadata
      console.log('Generating MCP tool metadata...');
      const mcpToolMetadata: McpToolMetadata = generateMcpToolMetadata(
        projectName,
        simpleSummarization,
        markdownDocuments,
        docsDir
      );
      console.log('MCP tool metadata:');
      console.log(`  Tool name: ${mcpToolMetadata.toolName}`);
      console.log(`  Tool description (partial): ${mcpToolMetadata.toolDescription.substring(0, 100)}...`);
      console.log(`  Available paths (${mcpToolMetadata.availablePaths.length}):`)
      mcpToolMetadata.availablePaths.slice(0, 5).forEach(p => console.log(`    - ${p.path} (${p.description})`));

      // Generate MCP server
      console.log('Generating MCP server...');
      const serverOutputPath = await generateMcpServer(
        mcpToolMetadata,
        projectName,
        docsDir,
        customOutDir
      );
      console.log(`MCP server successfully generated at ${serverOutputPath}.`);

      // Generate configuration file for running MCP server
      console.log('Generating MCP Server configuration file...');
      const configFilePath = await generateMcpServerConfig(projectName, serverOutputPath);
      console.log(`MCP Server configuration file successfully generated at ${configFilePath}.`);
    }

    console.log('\n=== Processing Complete ===');
    console.log(`Generated MCP server is located at ${customOutDir ? path.join(customOutDir, projectName) : path.join(os.homedir(), '.mcp-server', projectName)}.`);
    console.log('To start the server, run the following commands:');
    console.log(`  cd ${customOutDir ? path.join(customOutDir, projectName) : path.join(os.homedir(), '.mcp-server', projectName)}`);
    console.log('  npm install');
    console.log('  npm run dev');
    console.log('\nAlternatively, you can connect from an MCP client using the generated configuration file.');

  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      console.error(`Error: Directory ${docsDir} not found.`);
    } else {
      console.error('An error occurred:', error);
    }
    process.exit(1);
  }
}

// Execute main process
main().catch(err => {
  console.error("Unexpected error occurred:", err);
  process.exit(1);
});