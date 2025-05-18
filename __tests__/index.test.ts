import { jest } from '@jest/globals';
import path from 'path';
import { Command } from 'commander';

// モックの設定
jest.mock('fs/promises', () => ({
  stat: jest.fn(),
  readdir: jest.fn(),
  readFile: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// Anthropic SDKのモック
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({
      messages: {
        create: jest.fn(() => Promise.resolve({
          content: [{ type: 'text', text: '{"projectName":"test-project","summary":"Test summary","topics":["Topic 1","Topic 2"]}' }],
        })),
      },
    })),
  };
});

// モジュールのモック
jest.mock('../src/markdown-parser', () => ({
  findMarkdownFiles: jest.fn(),
  readMarkdownFile: jest.fn(),
  extractTitleFromMarkdown: jest.fn(),
}));

jest.mock('../src/llm-summarizer', () => ({
  summarizeDocuments: jest.fn(),
  generateDocumentDescription: jest.fn(),
}));

jest.mock('../src/metadata-generator', () => ({
  generateMcpToolMetadata: jest.fn(),
  generateToolName: jest.fn(),
}));

jest.mock('../src/mcp-server-generator', () => ({
  generateMcpServer: jest.fn(),
  generateMcpServerConfig: jest.fn(),
}));

// Commanderのモック
jest.mock('commander', () => {
  const mockCommand = {
    version: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    requiredOption: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    opts: jest.fn(),
  };
  return {
    Command: jest.fn(() => mockCommand),
  };
});

// テスト前に実行される処理
beforeEach(() => {
  jest.clearAllMocks();
  // コンソール出力をモック
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  // process.exitをモック
  jest.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => {
    return undefined as never;
  }) as any);
});

// テスト後に実行される処理
afterEach(() => {
  jest.restoreAllMocks();
});

// リファクタリングした関数をインポート
import {
  main,
  parseCommandLineOptions,
  validateDocsDirectory,
  loadMarkdownDocuments,
  sanitizeProjectName,
  determineProjectName,
  processDocumentInfo,
  generateMcpServerArtifacts,
  displayCompletionMessage
} from '../src/index';

// モックデータ
const mockMarkdownFiles = [
  '/path/to/file1.md',
  '/path/to/file2.md',
];

const mockMarkdownContent = `# Test Document
This is a test document.
`;

const mockDocumentInfo = [
  {
    path: '/path/to/file1.md',
    content: mockMarkdownContent,
    title: 'Test Document',
    description: 'A test document description',
  },
];

const mockSummarizationResult = {
  projectName: 'test-project',
  summary: 'Test summary',
  topics: ['Topic 1', 'Topic 2'],
};

const mockToolMetadata = {
  toolName: 'search-test-project-docs',
  toolDescription: 'Test summary\n\nThis tool provides access to documents on the following main topics:\n- Topic 1\n- Topic 2\n\nYou can retrieve information by specifying a specific document path.',
  availablePaths: [
    {
      path: 'file1.md',
      description: 'A test document description',
      originalPath: '/path/to/file1.md',
      title: 'Test Document',
    },
  ],
};

describe('index.ts', () => {
  // 統合テスト
  describe('Integration test', () => {
    it('should run the entire process successfully with custom project name', async () => {
      // モックの設定
      const fs = require('fs/promises');
      const { findMarkdownFiles, readMarkdownFile, extractTitleFromMarkdown } = require('../src/markdown-parser');
      const { summarizeDocuments, generateDocumentDescription } = require('../src/llm-summarizer');
      const { generateMcpToolMetadata } = require('../src/metadata-generator');
      const { generateMcpServer, generateMcpServerConfig } = require('../src/mcp-server-generator');
      const commanderMock = require('commander').Command();

      // Commanderのモック設定
      commanderMock.opts.mockReturnValue({
        docs: '/path/to/docs',
        output: '/path/to/output',
        project: 'custom-project',
      });

      // fs.statのモック
      fs.stat.mockResolvedValue({
        isDirectory: () => true,
      });

      // findMarkdownFilesのモック
      findMarkdownFiles.mockResolvedValue(mockMarkdownFiles);

      // readMarkdownFileのモック
      readMarkdownFile.mockResolvedValue(mockMarkdownContent);

      // extractTitleFromMarkdownのモック
      extractTitleFromMarkdown.mockReturnValue('Test Document');

      // generateDocumentDescriptionのモック
      generateDocumentDescription.mockResolvedValue('A test document description');

      // generateMcpToolMetadataのモック
      generateMcpToolMetadata.mockReturnValue(mockToolMetadata);

      // generateMcpServerのモック
      generateMcpServer.mockResolvedValue('/path/to/output/custom-project');

      // generateMcpServerConfigのモック
      generateMcpServerConfig.mockResolvedValue('/path/to/output/custom-project/dist/mcp-config.json');

      // main関数の実行
      await main(['node', 'index.js', '--docs', '/path/to/docs', '--output', '/path/to/output', '--project', 'custom-project']);

      // 期待される呼び出し
      expect(fs.stat).toHaveBeenCalledWith('/path/to/docs');
      expect(findMarkdownFiles).toHaveBeenCalledWith('/path/to/docs');
      expect(readMarkdownFile).toHaveBeenCalledWith(expect.any(String));
      expect(extractTitleFromMarkdown).toHaveBeenCalledWith(mockMarkdownContent);
      expect(generateDocumentDescription).toHaveBeenCalledWith(expect.objectContaining({
        path: expect.any(String),
        content: mockMarkdownContent,
      }));
      expect(generateMcpToolMetadata).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Array),
        '/path/to/docs'
      );
      expect(generateMcpServer).toHaveBeenCalledWith(
        mockToolMetadata,
        expect.any(String),
        '/path/to/docs',
        '/path/to/output'
      );
      expect(generateMcpServerConfig).toHaveBeenCalledWith(
        expect.any(String),
        '/path/to/output/custom-project'
      );
    });

    it('should run the entire process successfully with LLM suggested project name', async () => {
      // モックの設定
      const fs = require('fs/promises');
      const { findMarkdownFiles, readMarkdownFile, extractTitleFromMarkdown } = require('../src/markdown-parser');
      const { summarizeDocuments, generateDocumentDescription } = require('../src/llm-summarizer');
      const { generateMcpToolMetadata } = require('../src/metadata-generator');
      const { generateMcpServer, generateMcpServerConfig } = require('../src/mcp-server-generator');
      const commanderMock = require('commander').Command();

      // Commanderのモック設定
      commanderMock.opts.mockReturnValue({
        docs: '/path/to/docs',
        output: '/path/to/output',
        project: undefined,
      });

      // fs.statのモック
      fs.stat.mockResolvedValue({
        isDirectory: () => true,
      });

      // findMarkdownFilesのモック
      findMarkdownFiles.mockResolvedValue(mockMarkdownFiles);

      // readMarkdownFileのモック
      readMarkdownFile.mockResolvedValue(mockMarkdownContent);

      // extractTitleFromMarkdownのモック
      extractTitleFromMarkdown.mockReturnValue('Test Document');

      // summarizeDocumentsのモック
      summarizeDocuments.mockResolvedValue(mockSummarizationResult);

      // generateDocumentDescriptionのモック
      generateDocumentDescription.mockResolvedValue('A test document description');

      // generateMcpToolMetadataのモック
      generateMcpToolMetadata.mockReturnValue(mockToolMetadata);

      // generateMcpServerのモック
      generateMcpServer.mockResolvedValue('/path/to/output/test-project');

      // generateMcpServerConfigのモック
      generateMcpServerConfig.mockResolvedValue('/path/to/output/test-project/dist/mcp-config.json');

      // main関数の実行
      await main(['node', 'index.js', '--docs', '/path/to/docs', '--output', '/path/to/output']);

      // 期待される呼び出し
      expect(fs.stat).toHaveBeenCalledWith('/path/to/docs');
      expect(findMarkdownFiles).toHaveBeenCalledWith('/path/to/docs');
      expect(readMarkdownFile).toHaveBeenCalledWith(expect.any(String));
      expect(extractTitleFromMarkdown).toHaveBeenCalledWith(mockMarkdownContent);
      expect(summarizeDocuments).toHaveBeenCalledWith(expect.any(Array));
      expect(generateDocumentDescription).toHaveBeenCalledWith(expect.objectContaining({
        path: expect.any(String),
        content: mockMarkdownContent,
      }));
      expect(generateMcpToolMetadata).toHaveBeenCalledWith(
        expect.any(String),
        mockSummarizationResult,
        expect.any(Array),
        '/path/to/docs'
      );
      expect(generateMcpServer).toHaveBeenCalledWith(
        mockToolMetadata,
        expect.any(String),
        '/path/to/docs',
        '/path/to/output'
      );
      expect(generateMcpServerConfig).toHaveBeenCalledWith(
        expect.any(String),
        '/path/to/output/test-project'
      );
    });

    it('should handle errors gracefully', async () => {
      // モックの設定
      const fs = require('fs/promises');
      const commanderMock = require('commander').Command();

      // Commanderのモック設定
      commanderMock.opts.mockReturnValue({
        docs: '/path/to/docs',
        output: '/path/to/output',
        project: 'custom-project',
      });

      // fs.statのモックでエラーを発生させる
      fs.stat.mockRejectedValue(new Error('ENOENT'));

      // main関数の実行
      await main(['node', 'index.js', '--docs', '/path/to/docs', '--output', '/path/to/output', '--project', 'custom-project']);

      // 期待される呼び出し
      expect(fs.stat).toHaveBeenCalledWith('/path/to/docs');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  // 個別の関数のテスト
  describe('parseCommandLineOptions', () => {
    it('should parse command line options correctly', () => {
      const argv = ['node', 'index.js', '--docs', '/path/to/docs', '--output', '/path/to/output', '--project', 'custom-project'];
      const options = parseCommandLineOptions(argv);
      
      expect(options).toEqual({
        docsDir: '/path/to/docs',
        customOutDir: '/path/to/output',
        customProjectName: 'custom-project',
      });
    });

    it('should handle missing optional arguments', () => {
      // Commanderのモックを再設定
      const commanderMock = require('commander').Command();
      commanderMock.opts.mockReturnValue({
        docs: '/path/to/docs',
        output: undefined,
        project: undefined,
      });
      
      const argv = ['node', 'index.js', '--docs', '/path/to/docs'];
      const options = parseCommandLineOptions(argv);
      
      expect(options).toEqual({
        docsDir: '/path/to/docs',
        customOutDir: undefined,
        customProjectName: undefined,
      });
    });
  });

  describe('sanitizeProjectName', () => {
    it('should convert project name to lowercase', () => {
      expect(sanitizeProjectName('MyProject')).toBe('myproject');
    });

    it('should replace spaces with hyphens', () => {
      expect(sanitizeProjectName('My Project')).toBe('my-project');
    });

    it('should remove non-alphanumeric characters except hyphens', () => {
      expect(sanitizeProjectName('My Project!')).toBe('my-project');
      // アンダースコアは削除されるので、期待値を修正
      expect(sanitizeProjectName('My_Project@123')).toBe('myproject123');
    });

    it('should handle empty strings', () => {
      expect(sanitizeProjectName('')).toBe('');
    });
  });

  describe('validateDocsDirectory', () => {
    it('should validate a valid directory', async () => {
      const fs = require('fs/promises');
      fs.stat.mockResolvedValue({
        isDirectory: () => true,
      });

      await expect(validateDocsDirectory('/path/to/docs')).resolves.not.toThrow();
      expect(fs.stat).toHaveBeenCalledWith('/path/to/docs');
    });

    it('should throw an error if path is not a directory', async () => {
      const fs = require('fs/promises');
      fs.stat.mockResolvedValue({
        isDirectory: () => false,
      });

      await expect(validateDocsDirectory('/path/to/file')).rejects.toThrow('not a directory');
      expect(fs.stat).toHaveBeenCalledWith('/path/to/file');
    });

    it('should throw an error if directory does not exist', async () => {
      const fs = require('fs/promises');
      const error = new Error('Directory not found') as any;
      error.code = 'ENOENT';
      fs.stat.mockRejectedValue(error);

      await expect(validateDocsDirectory('/path/to/nonexistent')).rejects.toThrow('Directory /path/to/nonexistent not found');
      expect(fs.stat).toHaveBeenCalledWith('/path/to/nonexistent');
    });
  });

  describe('loadMarkdownDocuments', () => {
    it('should load markdown documents correctly', async () => {
      const { readMarkdownFile, extractTitleFromMarkdown } = require('../src/markdown-parser');
      
      readMarkdownFile.mockResolvedValue(mockMarkdownContent);
      extractTitleFromMarkdown.mockReturnValue('Test Document');
      
      const filePaths = ['/path/to/file1.md', '/path/to/file2.md'];
      const result = await loadMarkdownDocuments(filePaths);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        path: '/path/to/file1.md',
        content: mockMarkdownContent,
        title: 'Test Document',
      });
      expect(readMarkdownFile).toHaveBeenCalledTimes(2);
      expect(extractTitleFromMarkdown).toHaveBeenCalledTimes(2);
    });

    it('should handle file reading errors', async () => {
      const { readMarkdownFile, extractTitleFromMarkdown } = require('../src/markdown-parser');
      
      readMarkdownFile.mockResolvedValueOnce(mockMarkdownContent);
      readMarkdownFile.mockRejectedValueOnce(new Error('File read error'));
      extractTitleFromMarkdown.mockReturnValue('Test Document');
      
      const filePaths = ['/path/to/file1.md', '/path/to/file2.md'];
      const result = await loadMarkdownDocuments(filePaths);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: '/path/to/file1.md',
        content: mockMarkdownContent,
        title: 'Test Document',
      });
    });

    it('should throw an error if no files could be loaded', async () => {
      const { readMarkdownFile } = require('../src/markdown-parser');
      
      readMarkdownFile.mockRejectedValue(new Error('File read error'));
      
      const filePaths = ['/path/to/file1.md'];
      await expect(loadMarkdownDocuments(filePaths)).rejects.toThrow('Failed to load all valid Markdown files');
    });
  });

  describe('determineProjectName', () => {
    it('should use custom project name when specified and valid', async () => {
      const result = await determineProjectName('Custom Project', []);
      
      expect(result).toEqual({
        projectName: 'custom-project',
      });
    });

    it('should use LLM suggestion when custom project name is not specified', async () => {
      const { summarizeDocuments } = require('../src/llm-summarizer');
      
      summarizeDocuments.mockResolvedValue(mockSummarizationResult);
      
      const result = await determineProjectName(undefined, mockDocumentInfo);
      
      expect(result).toEqual({
        projectName: 'test-project',
        summarizationResult: mockSummarizationResult,
      });
      expect(summarizeDocuments).toHaveBeenCalledWith(mockDocumentInfo);
    });

    it('should handle invalid custom project names', async () => {
      const { summarizeDocuments } = require('../src/llm-summarizer');
      
      summarizeDocuments.mockResolvedValue(mockSummarizationResult);
      
      const result = await determineProjectName('!!!', mockDocumentInfo);
      
      expect(result).toEqual({
        projectName: 'test-project',
        summarizationResult: mockSummarizationResult,
      });
    });

    it('should handle LLM errors', async () => {
      const { summarizeDocuments } = require('../src/llm-summarizer');
      
      summarizeDocuments.mockRejectedValue(new Error('LLM error'));
      
      const result = await determineProjectName(undefined, mockDocumentInfo);
      
      expect(result).toEqual({
        projectName: 'markdown-docs-server',
      });
    });
  });
});