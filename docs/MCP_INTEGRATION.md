# PCM MCP 整合指南

PCM 提供符合 MCP (Model Context Protocol) 標準的遠端 JSON-RPC 端點，任何支援 MCP 的 AI Coding 工具都能連接。

## 端點資訊

```
URL:       https://pcm.aiconn.ai/mcp
Transport: HTTP POST (JSON-RPC)
Auth:      無需認證（可搭配 Cloudflare Tunnel 保護）
```

## 可用工具（9 個）

| Tool | 說明 | 必要參數 |
|------|------|---------|
| `pcm_project_list` | 列出已掃描專案 | 無 |
| `pcm_project_status` | 查看專案掃描狀態 | `project` |
| `pcm_scan` | 掃描專案，建立 CodeGraph | `path` |
| `pcm_graph` | 取得專案依賴圖 | `project` |
| `pcm_lookup` | 查詢程式碼符號 | `project`, `name` |
| `pcm_hotspots` | 複雜度熱點 | `project` |
| `pcm_impact` | 影響分析（改了 X 會影響誰） | `project`, `target` |
| `pcm_cycles` | 循環依賴檢測 | `project` |
| `pcm_query` | GraphRAG 問答 + maGraphRAG 萃取 | `question`, `project`(可選) |

## 各工具設定方式

### OpenCode

編輯 `~/.opencode.json` 或專案根目錄的 `.opencode.json`：

```json
{
  "mcpServers": {
    "pcm": {
      "url": "https://pcm.aiconn.ai/mcp",
      "transport": "http"
    }
  }
}
```

### Claude Code (Anthropic)

編輯 `~/.claude/claude_desktop_config.json` 或專案 `.mcp.json`：

```json
{
  "mcpServers": {
    "pcm": {
      "url": "https://pcm.aiconn.ai/mcp",
      "transport": "http"
    }
  }
}
```

### Cursor

在專案根目錄建立 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "pcm": {
      "url": "https://pcm.aiconn.ai/mcp",
      "transport": "http"
    }
  }
}
```

### Antigravity

編輯設定檔（通常為 `~/.antigravity/mcp.json`）：

```json
{
  "mcpServers": {
    "pcm": {
      "url": "https://pcm.aiconn.ai/mcp",
      "transport": "http"
    }
  }
}
```

### Codex (OpenAI)

編輯設定檔（`~/.codex/config.json`）：

```json
{
  "mcp": {
    "pcm": {
      "url": "https://pcm.aiconn.ai/mcp",
      "transport": "http"
    }
  }
}
```

### 通用格式（所有 MCP 相容工具）

幾乎所有支援 MCP 的 AI Coding 工具都使用相同的 JSON 結構：

```json
{
  "mcpServers": {
    "服務名稱": {
      "url": "MCP 端點 URL",
      "transport": "http | stdio | sse"
    }
  }
}
```

## 使用場景

### 場景 1：理解陌生專案

```
你在 OpenCode 中問：
"這個專案的認證機制是怎麼運作的？"

OpenCode 自動呼叫 pcm_query →
→ 搜尋 ArangoDB 中的 auth 相關符號
→ 取得依賴關係上下文
→ vLLM 回答，解釋認證流程
```

### 場景 2：安全修改代碼

```
你在 OpenCode 中：
"幫我把 getUser 函數改成支援多用戶查詢"

OpenCode 自動呼叫 pcm_impact("getUser") →
→ 回報：「getUser 被 12 個檔案引用，修改需注意...」
→ AI 根據影響分析結果，安全地進行修改
```

### 場景 3：知識累積（maGraphRAG）

```
每次 OpenCode 與你對話關於程式碼時：
1. 對話自動記錄到 conv_messages
2. vLLM 非同步萃取關鍵事實和關聯
3. 寫入 conv_knowledge（與 code graph 隔離，re-scan 安全）
4. 下次查詢時，知識更豐富、回答更精準
```

## 架構

```
你的 AI Coding 工具 (OpenCode/Cursor/Claude Code/...)
  │
  │ MCP JSON-RPC over HTTPS
  ▼
pcm.aiconn.ai/mcp
  │
  ├─ ArangoDB :8529  ── 程式碼圖譜 + 對話知識
  ├─ Qdrant    :6333  ── 向量搜尋
  └─ vLLM      :18001 ── Qwen3-8B-AWQ (DGX Spark GPU)
```

## 安全建議

1. 使用 Cloudflare Tunnel 保護端點（`pcm.aiconn.ai` 已設定）
2. 可考慮加入 API Key 驗證：
   ```json
   "pcm": {
     "url": "https://pcm.aiconn.ai/mcp",
     "transport": "http",
     "headers": { "Authorization": "Bearer YOUR_API_KEY" }
   }
   ```
3. 所有代碼分析都在本機執行，不會上傳原始碼到外部服務
