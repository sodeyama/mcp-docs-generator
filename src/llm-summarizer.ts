import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';

// 定数
const DEFAULT_MODEL = 'claude-3-sonnet-20240229';
const MAX_PROMPT_TOKENS = 150000; // 約75%の200,000トークン
const MAX_DOCUMENT_CHARS = 10000; // ドキュメント説明生成時の最大文字数
const DOCUMENT_SEPARATOR = '\n\n---\n\n';
const TRUNCATION_MESSAGE = '\n\n[Content truncated because it was too long]';
const DEFAULT_DESCRIPTION_PREFIX = 'Document: ';
const JAPANESE_CHAR_PATTERN = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/;
const JSON_CODE_BLOCK_PATTERN = /```(?:json)?\s*([\s\S]*?)\s*```/;

// 環境変数の読み込み（既存の環境変数は上書きしない）
dotenv.config({ override: false });

// APIキーを環境変数から取得（シェルで設定された環境変数が優先）
const apiKey = process.env.ANTHROPIC_API_KEY;

// APIキーが設定されていない場合の警告
if (!apiKey) {
  console.warn('Warning: ANTHROPIC_API_KEY is not set. LLM functionality will not be available.');
}

// Anthropicクライアントの初期化
const anthropic = new Anthropic({
  apiKey,
});

/**
 * 要約結果のインターフェース
 */
export interface SummarizationResult {
  projectName: string; // LLMが提案するプロジェクト名
  summary: string; // ドキュメント全体の要約
  topics: string[]; // 主要なトピックのリスト
}

/**
 * ドキュメント情報のインターフェース
 */
export interface DocumentInfo {
  path: string; // ファイルパス
  content: string; // ファイルの内容
  title?: string; // オプションのタイトル（Markdownから抽出）
  description?: string; // ドキュメントの説明（LLMで生成）
}

/**
 * テキストのトークン数を見積もる
 * @param text 見積もり対象のテキスト
 * @returns 見積もりトークン数
 */
function estimateTokenCount(text: string): number {
  // 日本語文字が含まれているかチェック
  const hasJapanese = JAPANESE_CHAR_PATTERN.test(text);
  
  // 日本語の場合、文字数をトークン数として見積もる（安全側に倒す）
  if (hasJapanese) {
    return text.length;
  }
  
  // 英語の場合、単語数の約1.3倍として見積もる
  return text.split(/\s+/).length * 1.3;
}

/**
 * ドキュメントをトークン制限内に収まるように結合する
 * @param documents ドキュメント情報の配列
 * @returns 結合されたコンテンツと使用されたドキュメント数
 */
function combineDocumentsWithinTokenLimit(documents: DocumentInfo[]): {
  combinedContent: string;
  usedDocuments: number;
  totalTokens: number;
} {
  let combinedContent = '';
  let totalTokens = 0;
  let usedDocuments = 0;
  
  // 各ドキュメントのトークン数を見積もり、制限に達するまで追加
  for (const doc of documents) {
    const titleInfo = doc.title ? `Title: ${doc.title}\n` : '';
    const docContent = `File path: ${doc.path}\n${titleInfo}\n${doc.content}`;
    const docTokens = estimateTokenCount(docContent);
    
    // このドキュメントを追加するとトークン制限を超える場合
    if (totalTokens + docTokens > MAX_PROMPT_TOKENS) {
      // 少なくとも1つのドキュメントが既に追加されている場合はここで終了
      if (usedDocuments > 0) {
        break;
      }
      
      // ドキュメントがまだ追加されていない場合、最初のドキュメントの一部だけでも追加
      const maxChars = MAX_PROMPT_TOKENS; // 簡易的に1文字=1トークンと仮定
      combinedContent = docContent.substring(0, maxChars) + TRUNCATION_MESSAGE;
      usedDocuments = 1;
      totalTokens = maxChars;
      console.log(`Warning: First document was too large, content has been truncated.`);
      break;
    }
    
    // ドキュメントを追加
    if (combinedContent) {
      combinedContent += DOCUMENT_SEPARATOR;
    }
    combinedContent += docContent;
    totalTokens += docTokens;
    usedDocuments++;
  }
  
  return { combinedContent, usedDocuments, totalTokens };
}

/**
 * LLMレスポンスからテキストを抽出する
 * @param response LLMからのレスポンス
 * @returns 抽出されたテキスト
 */
function extractTextFromLlmResponse(response: Anthropic.Message): string {
  let resultText = '';
  
  if (Array.isArray(response.content)) {
    for (const block of response.content) {
      if (block.type === 'text') {
        resultText += block.text;
      }
    }
  }
  
  return resultText;
}

/**
 * LLMレスポンスからJSONを解析する
 * @param resultText LLMレスポンスのテキスト
 * @returns 解析されたJSON
 */
function parseJsonFromLlmResponse(resultText: string): SummarizationResult {
  if (!resultText) {
    throw new Error('Response from LLM is empty.');
  }
  
  // コードブロック（```json ... ```）からJSONを抽出
  const jsonMatch = resultText.match(JSON_CODE_BLOCK_PATTERN);
  const parsableResultText = jsonMatch ? jsonMatch[1] : resultText;
  
  try {
    return JSON.parse(parsableResultText) as SummarizationResult;
  } catch (parseError) {
    console.error('JSON parsing error. LLM response:', resultText);
    throw new Error(`Could not parse LLM response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }
}

/**
 * ドキュメント要約用のプロンプトを作成する
 * @param combinedContent 結合されたドキュメントコンテンツ
 * @returns プロンプト
 */
function createSummarizationPrompt(combinedContent: string): string {
  return `Analyze the following Markdown documents and extract the following information:
1. A concise project name that represents the entire collection of documents (e.g., my-awesome-project-docs)
2. A comprehensive summary of the entire document collection (approximately 100-200 characters)
3. Main topics included in the document collection (5-10 bullet points)

Documents:
${combinedContent}

Please return the extracted results in the following JSON format:
{
  "projectName": "project name",
  "summary": "summary text",
  "topics": ["topic1", "topic2", ...]
}
`;
}

/**
 * ドキュメント説明生成用のプロンプトを作成する
 * @param document ドキュメント情報
 * @returns プロンプト
 */
function createDescriptionPrompt(document: DocumentInfo): string {
  const titleInfo = document.title ? `Title: ${document.title}\n` : '';
  const truncatedContent = document.content.length > MAX_DOCUMENT_CHARS
    ? `${document.content.substring(0, MAX_DOCUMENT_CHARS)}...(truncated)`
    : document.content;
  
  return `Analyze the following Markdown document and provide a concise description of its content in about 30 characters.
Avoid redundant expressions like "This document is..." and directly express the content.

Document:
File path: ${document.path}
${titleInfo}
${truncatedContent}

Description:`;
}

/**
 * LLMを使用して複数のMarkdownドキュメントを要約する
 * @param documents 分析するドキュメント情報の配列
 * @returns 要約結果（SummarizationResult）
 * @throws APIキーが設定されていない場合、またはLLM処理中にエラーが発生した場合
 */
export async function summarizeDocuments(
  documents: DocumentInfo[]
): Promise<SummarizationResult> {
  // APIキーが設定されているか確認
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Please set it in the .env file or as an environment variable.');
  }
  
  // ドキュメントをトークン制限内に結合
  const { combinedContent, usedDocuments, totalTokens } = combineDocumentsWithinTokenLimit(documents);
  
  // 処理状況のログ出力
  console.log(`Processing documents: ${usedDocuments}/${documents.length} (estimated token count: ${totalTokens})`);
  
  if (usedDocuments < documents.length) {
    console.log(`Warning: ${documents.length - usedDocuments} documents were excluded from processing due to token limit.`);
  }
  
  // プロンプトの作成
  const prompt = createSummarizationPrompt(combinedContent);
  
  try {
    // モデル名を環境変数から取得（デフォルト値を使用）
    const modelName = process.env.ANTHROPIC_API_MODEL || DEFAULT_MODEL;
    console.log(`Using Anthropic model: ${modelName}`);
    
    // LLM APIの呼び出し
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    
    // レスポンスからテキストを抽出
    const resultText = extractTextFromLlmResponse(response);
    
    // テキストからJSONを解析
    return parseJsonFromLlmResponse(resultText);
    
  } catch (error) {
    console.error('Error occurred during LLM summarization:', error);
    throw new Error(`Failed to summarize documents: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 指定されたドキュメントの内容を要約し、簡潔な説明を生成する
 * @param document ドキュメント情報
 * @returns 生成された説明
 */
export async function generateDocumentDescription(document: DocumentInfo): Promise<string> {
  // APIキーが設定されていない場合はファイル名を返す
  if (!apiKey) {
    return `${DEFAULT_DESCRIPTION_PREFIX}${path.basename(document.path)}`;
  }
  
  try {
    // モデル名を環境変数から取得（デフォルト値を使用）
    const modelName = process.env.ANTHROPIC_API_MODEL || DEFAULT_MODEL;
    
    // プロンプトの作成
    const prompt = createDescriptionPrompt(document);
    
    // LLM APIの呼び出し
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });
    
    // レスポンスからテキストを抽出
    const description = extractTextFromLlmResponse(response);
    
    // 説明が生成できなかった場合はファイル名を使用
    if (!description.trim()) {
      return `${DEFAULT_DESCRIPTION_PREFIX}${path.basename(document.path)}`;
    }
    
    return description.trim();
  } catch (error) {
    console.warn(`Error occurred while generating description for document ${document.path}. Using filename instead.`, error);
    return `${DEFAULT_DESCRIPTION_PREFIX}${path.basename(document.path)}`;
  }
}