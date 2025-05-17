import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file (existing environment variables are not overwritten)
dotenv.config({ override: false });

// Get API key from environment variables (shell-set environment variables take precedence)
const apiKey = process.env.ANTHROPIC_API_KEY;

// Error message if API key is not set
if (!apiKey) {
  console.warn('Warning: ANTHROPIC_API_KEY is not set. LLM functionality will not be available.');
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey, // Get API key from environment variables
});

export interface SummarizationResult {
  projectName: string; // LLMが提案するプロジェクト名
  summary: string; // ドキュメント全体の要約
  topics: string[]; // 主要なトピックのリスト
}

export interface DocumentInfo {
  path: string;
  content: string;
  title?: string; // オプションのタイトル（Markdownから抽出）
  description?: string; // ドキュメントの説明（LLMで生成）
}

/**
 * Summarizes a list of Markdown content using LLM.
 * @param documents Array of document information to analyze
 * @returns Summarization result (SummarizationResult)
 */
export async function summarizeDocuments(
  documents: DocumentInfo[]
): Promise<SummarizationResult> {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Please set it in the .env file or as an environment variable.');
  }

  // Simple function to estimate token count
  const estimateTokens = (text: string): number => {
    // Check if Japanese characters are included
    const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(text);
    // For Japanese, estimate token count as character count (erring on the side of caution)
    if (hasJapanese) {
      return text.length;
    }
    // For English, estimate as about 1.3 times the word count
    return text.split(/\s+/).length * 1.3;
  };

  // Safety margin for API maximum token count
  const MAX_PROMPT_TOKENS = 150000; // Using about 75% of 200,000
  
  // Select documents and create prompt
  let combinedContent = '';
  let totalTokens = 0;
  let usedDocuments = 0;
  
  // Estimate token count for each document and add until limit is reached
  for (const doc of documents) {
    const titleInfo = doc.title ? `Title: ${doc.title}\n` : '';
    const docContent = `File path: ${doc.path}\n${titleInfo}\n${doc.content}`;
    const docTokens = estimateTokens(docContent);
    
    // If adding this document would exceed the token limit
    if (totalTokens + docTokens > MAX_PROMPT_TOKENS) {
      // If at least one document has already been added, stop here
      if (usedDocuments > 0) {
        break;
      }
      // If no documents have been added yet,
      // add at least part of the first document even if it's too large
      const maxChars = MAX_PROMPT_TOKENS; // Simply assume 1 character = 1 token
      combinedContent = docContent.substring(0, maxChars) + "\n\n[Content truncated because it was too long]";
      usedDocuments = 1;
      console.log(`Warning: First document was too large, content has been truncated.`);
      break;
    }
    
    // Add document
    if (combinedContent) {
      combinedContent += '\n\n---\n\n';
    }
    combinedContent += docContent;
    totalTokens += docTokens;
    usedDocuments++;
  }
  
  console.log(`Processing documents: ${usedDocuments}/${documents.length} (estimated token count: ${totalTokens})`);
  
  if (usedDocuments < documents.length) {
    console.log(`Warning: ${documents.length - usedDocuments} documents were excluded from processing due to token limit.`);
  }

  const prompt = `Analyze the following Markdown documents and extract the following information:
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

  try {
    // Get model name from environment variables (shell-set environment variables take precedence)
    // Use default 'claude-3-sonnet-20240229' if not specified
    const modelName = process.env.ANTHROPIC_API_MODEL || 'claude-3-sonnet-20240229';
    console.log(`Using Anthropic model: ${modelName}`);

    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1024, // 必要に応じて調整
      messages: [{ role: 'user', content: prompt }],
    });

    // レスポンスからテキストを抽出
    let resultText = '';
    if (Array.isArray(response.content)) {
      for (const block of response.content) {
        if (block.type === 'text') {
          resultText += block.text;
        }
      }
    }

    if (!resultText) {
      throw new Error('Response from LLM is empty.');
    }

    // Remove markdown blocks like ```json ... ``` before parsing JSON string
    const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const parsableResultText = jsonMatch ? jsonMatch[1] : resultText;

    try {
      const result = JSON.parse(parsableResultText) as SummarizationResult;
      return result;
    } catch (parseError) {
      console.error('JSON parsing error. LLM response:', resultText);
      throw new Error(`Could not parse LLM response as JSON: ${parseError}`);
    }

  } catch (error) {
    console.error('Error occurred during LLM summarization:', error);
    throw error;
  }
}

/**
 * Summarizes the content of the specified document and generates a concise description.
 * @param document Document information
 * @returns Generated description
 */
export async function generateDocumentDescription(document: DocumentInfo): Promise<string> {
  if (!apiKey) {
    // Return filename if API key is not available
    return `Document: ${path.basename(document.path)}`;
  }

  try {
    const modelName = process.env.ANTHROPIC_API_MODEL || 'claude-3-sonnet-20240229';
    
    const titleInfo = document.title ? `Title: ${document.title}\n` : '';
    const prompt = `Analyze the following Markdown document and provide a concise description of its content in about 30 characters.
Avoid redundant expressions like "This document is..." and directly express the content.

Document:
File path: ${document.path}
${titleInfo}
${document.content.substring(0, 10000)} ${document.content.length > 10000 ? '...(truncated)' : ''}

Description:`;

    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });

    // レスポンスからテキストを抽出
    let description = '';
    if (Array.isArray(response.content)) {
      for (const block of response.content) {
        if (block.type === 'text') {
          description += block.text;
        }
      }
    }

    // Use filename if description could not be generated
    if (!description.trim()) {
      return `Document: ${path.basename(document.path)}`;
    }

    return description.trim();
  } catch (error) {
    console.warn(`Error occurred while generating description for document ${document.path}. Using filename instead.`, error);
    return `Document: ${path.basename(document.path)}`;
  }
}