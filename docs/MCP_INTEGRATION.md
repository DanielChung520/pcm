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

## 架構

```mermaid
flowchart TB
    subgraph client["遠端開發機"]
        OC[OpenCode / Cursor / Claude Code]
    end

    subgraph pcm["PCM 服務 (pcm.aiconn.ai)"]
        MCP[MCP Server<br/>POST /mcp]
        API[HTTP API<br/>:56521]
        WEB[Web UI<br/>:56520]
    end

    subgraph infra["基礎建設"]
        AR[ArangoDB :8529<br/>code graph + 對話知識]
        QD[Qdrant :6333<br/>向量搜尋]
        VL[vLLM :18001<br/>Qwen3-8B-AWQ]
    end

    OC -->|"MCP JSON-RPC"| MCP
    MCP --> AR
    MCP --> VL
    API --> AR
    WEB --> API
```

## 核心閉環（maGraphRAG）

```mermaid
flowchart LR
    A["👤 開發者提問<br/>「這個函數做什麼？」"] --> B["🔍 pcm_query<br/>搜尋 ArangoDB 符號"]
    B --> C["🧠 vLLM 回答<br/>結合程式碼上下文"]
    C --> D["📝 記錄對話<br/>conv_messages"]
    C --> E["🔄 maGraphRAG 異步萃取<br/>vLLM 提取事實/關聯"]
    E --> F["💾 conv_knowledge<br/>獨立存儲，re-scan 安全"]
    F -.->|"下次查詢更精準"| B

    style A fill:#6366f1,color:#fff
    style C fill:#22c55e,color:#fff
    style F fill:#f59e0b,color:#000
```

## 使用流程

### 場景 1：理解陌生專案

```mermaid
sequenceDiagram
    actor Dev as 開發者
    participant AI as AI Coder
    participant PCM as PCM MCP
    participant AR as ArangoDB
    participant LLM as vLLM

    Dev->>AI: 這個專案的認證機制怎麼運作？
    AI->>PCM: pcm_query("auth service")
    PCM->>AR: 搜尋 auth 相關符號
    AR-->>PCM: PluginManager, AuthService
    PCM->>LLM: 傳入上下文 + 提問
    LLM-->>PCM: 回答認證機制說明
    PCM-->>AI: JSON-RPC 回應
    AI-->>Dev: 認證流程是這樣的...
    
    Note over PCM: maGraphRAG 異步萃取知識
```

### 場景 2：安全修改代碼

```mermaid
sequenceDiagram
    actor Dev as 開發者
    participant AI as AI Coder
    participant PCM as PCM MCP
    
    Dev->>AI: 幫我把 getUser 改成支援多用戶
    AI->>PCM: pcm_impact("getUser")
    PCM-->>AI: 12 個檔案依賴 getUser
    AI->>PCM: pcm_lookup("getUser")
    PCM-->>AI: 位於 src/services/user.ts, L45
    AI->>Dev: getUser 被 12 個檔案引用，修改時要小心
    
    Note over AI: AI 根據影響分析結果<br/>安全地進行修改
```

### 場景 3：知識累積（maGraphRAG）

```mermaid
sequenceDiagram
    participant AI as AI Coder
    participant PCM as PCM MCP
    participant LLM as vLLM
    participant AR as ArangoDB

    AI->>PCM: pcm_query("PluginManager")
    PCM->>LLM: 回答問題
    LLM-->>PCM: 回答內容
    PCM-->>AI: 回答

    Note over PCM: 非同步知識萃取開始

    PCM->>LLM: 從對話中萃取事實
    LLM-->>PCM: [{entity:"PluginManager", fact:"負責插件生命周期..."}]
    PCM->>AR: 寫入 conv_knowledge

    Note over AR: 知識永久保留<br/>下次查詢可檢索
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
