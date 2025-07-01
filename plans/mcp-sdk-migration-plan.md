# MCP SDK 移行計画

## 概要
MCPの最新仕様に準拠するため、生成されるMCPサーバーコードを更新する必要があります。主な変更点は以下の通りです：

1. **パッケージ名の変更**: すでに`@modelcontextprotocol/sdk`に移行済み
2. **prompts/listハンドラーの実装が必須**: 現在のコードには実装されていない
3. **新しいSDKのAPIに準拠したコード生成**

## 影響範囲
- `src/mcp-server-generator.ts`: 生成されるMCPサーバーコードのテンプレートを更新

## 修正内容

### 1. MCPサーバーコードテンプレートの更新（src/mcp-server-generator.ts）

#### 現在の問題点
- 古いMCP SDKのAPIを使用している（`McpServer`クラスなど）
- 必須の`prompts/list`ハンドラーが実装されていない
- 新しいSDKの構造に準拠していない

#### 修正内容
1. **インポート文の更新**
   - `McpServer` → `Server`に変更
   - 必要なスキーマのインポート追加

2. **サーバー初期化の更新**
   - 新しい`Server`クラスの初期化方法に変更
   - capabilitiesの設定を追加

3. **ハンドラーの実装**
   - `ListPromptsRequestSchema`ハンドラーの追加（必須）
   - `GetPromptRequestSchema`ハンドラーの追加
   - `ListToolsRequestSchema`ハンドラーの追加
   - `CallToolRequestSchema`ハンドラーの追加

4. **ツール定義の更新**
   - 新しいAPIに準拠したツール定義方法に変更

## 実装手順

1. **src/mcp-server-generator.tsの更新**
   - `getServerIndexTsContent`関数を修正
   - 新しいMCP SDKのAPIに準拠したコードテンプレートに更新

2. **テストの実行**
   - 既存のテストが通ることを確認
   - 生成されたMCPサーバーが正常に動作することを確認

3. **ドキュメントの更新**
   - 必要に応じてREADMEを更新

## タイムライン
1. 修正実装: 30分
2. テスト: 15分
3. 動作確認: 15分

## リスク
- 生成されたサーバーコードの互換性の問題
- 既存のMCPクライアントとの互換性

## 成功基準
- 生成されたMCPサーバーがエラーなく起動する
- Claude DesktopやCursorなどのMCPクライアントから正常に接続できる
- ツールが正常に動作する