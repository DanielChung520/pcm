# ADR-004: CLI Agent 優先設計

## 日期
2025-06-27

## 狀態
Accepted

## 背景
PCM 的主要使用者不是人類，而是 AI Agent（透過 OpenCode 等工具調用）。
用戶透過聊天下達意圖，AI Agent 執行 CLI 命令。

## 決策
CLI 設計遵循 Agent 友好原則：
1. 所有命令支援 `--json` 輸出（機器可讀）
2. 進度資訊送 stderr，資料送 stdout（不互相污染）
3. 操作必須冪等（重複執行不改變結果）
4. 明確退出碼: 0=成功 1=錯誤 2=部分成功
5. 支援 `--limit`/`--offset` 分頁（避免輸出過大）
6. 命令極短，一致命名: `pcm scan`, `pcm graph`, `pcm query`

## 影響
- 優點：OpenCode/Claude Code/Cursor 等工具可無縫整合
- 優點：人類用戶仍可直接使用，但非主要場景
- 成本：必須維護兩套輸出格式（人類可讀 + JSON）

## 參照
- packages/cli/src/commands/*.ts（CLI 命令實現）
- packages/mcp-server/src/index.ts（MCP Server 封裝）
