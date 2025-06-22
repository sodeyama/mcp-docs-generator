import { generateToolName, validateMcpToolName, generateMcpToolMetadata } from '../src/metadata-generator';
import { SummarizationResult, DocumentInfo } from '../src/llm-summarizer';

describe('metadata-generator', () => {
  describe('generateToolName', () => {
    test('通常のプロジェクト名からツール名を生成', () => {
      expect(generateToolName('my-project')).toBe('search-my-project-docs');
    });

    test('スペースを含むプロジェクト名をケバブケースに変換', () => {
      expect(generateToolName('My Project Name')).toBe('search-my-project-name-docs');
    });

    test('特殊文字を含むプロジェクト名を正規化', () => {
      expect(generateToolName('My@Project#123')).toBe('search-myproject123-docs');
    });

    test('空文字列の場合はデフォルト値を返す', () => {
      expect(generateToolName('')).toBe('search-docs');
    });
  });

  describe('validateMcpToolName', () => {
    test('64文字以内の場合はエラーが発生しない', () => {
      // mcp__short__search-short-docs = 29文字
      expect(() => validateMcpToolName('short', 'search-short-docs')).not.toThrow();
    });

    test('64文字を超える場合はエラーが発生する', () => {
      // 長いプロジェクト名とツール名を作成
      const longProjectName = 'very-long-project-name-that-exceeds-limits';
      const longToolName = 'search-very-long-project-name-that-exceeds-limits-docs';
      
      expect(() => validateMcpToolName(longProjectName, longToolName)).toThrow(
        /MCPツール名が64文字制限を超えています/
      );
    });

    test('エラーメッセージに詳細情報が含まれる', () => {
      const longProjectName = 'very-long-project-name-that-exceeds-limits';
      const longToolName = 'search-very-long-project-name-that-exceeds-limits-docs';
      
      try {
        validateMcpToolName(longProjectName, longToolName);
        fail('エラーが発生するはずです');
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('MCPツール名が64文字制限を超えています');
        expect(errorMessage).toContain('制限: 64文字');
        expect(errorMessage).toContain('サーバー名:');
        expect(errorMessage).toContain('ツール名:');
        expect(errorMessage).toContain('プロジェクト名またはツール名を短くしてください');
      }
    });

    test('境界値テスト: ちょうど64文字の場合', () => {
      // mcp__test__aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      // = 11 + 53 = 64文字
      const projectName = 'test';
      const toolName = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      
      expect(() => validateMcpToolName(projectName, toolName)).not.toThrow();
    });

    test('境界値テスト: 65文字の場合', () => {
      // mcp__test__aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      // = 11 + 54 = 65文字
      const projectName = 'test';
      const toolName = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      
      expect(() => validateMcpToolName(projectName, toolName)).toThrow(
        /MCPツール名が64文字制限を超えています/
      );
    });
  });

  describe('generateMcpToolMetadata', () => {
    const mockSummarizationResult: SummarizationResult = {
      projectName: 'test-project',
      summary: 'テストドキュメント集',
      topics: ['トピック1', 'トピック2']
    };

    const mockMarkdownFiles: DocumentInfo[] = [
      {
        path: '/test/doc1.md',
        content: '# ドキュメント1\n内容1',
        description: 'ドキュメント1の説明'
      }
    ];

    test('正常なプロジェクト名の場合はメタデータが生成される', () => {
      const result = generateMcpToolMetadata(
        'test-project',
        mockSummarizationResult,
        mockMarkdownFiles,
        '/test'
      );

      expect(result.toolName).toBe('search-test-project-docs');
      expect(result.toolDescription).toContain('テストドキュメント集');
      expect(result.availablePaths).toHaveLength(1);
    });

    test('長すぎるプロジェクト名の場合はエラーが発生する', () => {
      const longProjectName = 'very-long-project-name-that-will-exceed-the-sixty-four-character-limit';
      
      expect(() => generateMcpToolMetadata(
        longProjectName,
        mockSummarizationResult,
        mockMarkdownFiles,
        '/test'
      )).toThrow(/MCPツール名が64文字制限を超えています/);
    });
  });
});