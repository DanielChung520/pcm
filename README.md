# PCM — Project Code Management

AI 時代開發者第二大腦。讓 AI Agent 和人類開發者都能瞬間理解任何專案的知識中樞。

## 快速安裝

```bash
# 1. 安裝依賴
cd ~/github/pcm
pnpm install

# 2. 編譯全部套件
pnpm -r build

# 3. 註冊為全域指令（可選）
npm link packages/cli

# 4. 掃描你的第一個專案
pcm scan ~/github/your-project
```

## CLI 指令大全

全部指令支援 `--json` 輸出（供 AI Agent 解析），進度訊息送 stderr，資料送 stdout。

### 掃描與查詢

| 指令 | 用途 | 範例 |
|------|------|------|
| `pcm scan <path>` | 掃描專案，建立代碼圖譜 | `pcm scan ~/github/aibox` |
| `pcm scan <path> --force` | 強制重新掃描（忽略快取） | `pcm scan ~/github/aibox --force` |
| `pcm list` | 列出所有已掃描專案 | `pcm list` |
| `pcm status [project]` | 查看掃描狀態 | `pcm status aibox` |
| `pcm graph <project>` | 輸出依賴圖（Mermaid） | `pcm graph aibox` |
| `pcm graph <project> --format json` | 輸出原始圖譜 JSON | `pcm graph aibox --format json` |
| `pcm modules <project>` | 列出所有模組與符號 | `pcm modules aibox` |
| `pcm modules <project> --filter class` | 只列出類別 | `pcm modules aibox --filter class` |
| `pcm hotspots <project>` | 列出複雜度熱點 | `pcm hotspots aibox` |
| `pcm hotspots <project> --limit 5` | 只看前 5 名 | `pcm hotspots aibox --limit 5` |

### 分析

| 指令 | 用途 | 範例 |
|------|------|------|
| `pcm impact <project> <target>` | 影響分析：改了某符號會影響誰 | `pcm impact aibox AuthService` |
| `pcm cycles <project>` | 偵測循環依賴 | `pcm cycles aibox` |

### 輸出格式

```bash
# 人類可讀（預設）
pcm scan ~/github/aibox
# → 🔍 正在掃描 aibox ...
# → ✓ aibox 掃描完成 (73ms)
# →   11 個檔案, 64 個符號, 65 個關係

# JSON 輸出（給 AI Agent）
pcm scan ~/github/aibox --json
# → {"project":"aibox","stats":{"fileCount":11,...}}

# 非同步掃描時進度到 stderr，資料到 stdout 不互相污染
pcm scan ~/github/aibox --json 2>/dev/null | jq '.stats'
```

## 掃描產出

執行 `pcm scan` 後，會在 `~/.agents/pcm/` 產生三個 Markdown 檔案：

| 檔案 | 用途 | AI Agent 怎麼用 |
|------|------|----------------|
| `architecture.md` | 模組依賴圖（Mermaid）+ 目錄結構 | Agent 讀懂專案整體架構 |
| `modules.md` | 所有函數/類別/介面字典 | Agent 知道有哪些符號可用 |
| `hotspots.md` | 複雜度熱點排名 | Agent 知道哪裡最危險 |

## 架構

```
~/.pcm/              ← 工作區（設定、快取、授權）
~/github/pcm/        ← 專案目錄（開發原始碼）
SeaweedFS buckets    ← 用戶專案檔案（分散式儲存）
```

### 套件對照

| 套件 | 語言 | 說明 |
|------|------|------|
| `packages/core` | TypeScript | 微內核：資料模型、插件系統、事件總線 |
| `packages/cli` | TypeScript | CLI 工具（8 個指令） |
| `packages/mcp-server` | TypeScript | MCP Server（9 個 Tool，對接 OpenCode） |
| `packages/scanner` | TypeScript | 掃描器、影響分析、Markdown 輸出、LLM 插件 |
| `packages/storage` | TypeScript | 儲存抽象層（SQLite / SeaweedFS / ArangoDB / Qdrant） |
| `packages/plugins/typescript` | TypeScript | TS/JS 語言解析器（Tree-sitter） |
| `packages/plugins/python` | TypeScript | Python 語言解析器（Tree-sitter） |
| `packages/engine` | Bridge | Rust napi-rs 原生模組橋接 |
| `engine/` | Rust | 核心引擎：服務層 + 圖演算法 + Tork 排程 |
| `analyzer/` | Python | AI 分析層：CodeEmbedder + GraphRAG |
| `web/` | TypeScript/Rust | Tauri Desktop App（React + D3.js + xterm.js） |

## MCP Server（AI Agent 直連）

啟動後 OpenCode / Claude Code 可直接調用：

```bash
node packages/mcp-server/dist/index.js
```

提供的 9 個 Tool：

| Tool | 功能 |
|------|------|
| `pcm_project_list` | 列出專案 |
| `pcm_project_status` | 查看狀態 |
| `pcm_scan` | 掃描專案 |
| `pcm_graph` | 依賴圖（Mermaid） |
| `pcm_lookup` | 符號查詢 |
| `pcm_hotspots` | 複雜度熱點 |
| `pcm_impact` | 影響分析 |
| `pcm_cycles` | 循環依賴 |
| `pcm_scan_all` | 批次掃描 |

## 基礎建設整合

| 服務 | 用途 | PCM 元件 | 狀態 |
|------|------|---------|------|
| SQLite | 預設儲存（零配置） | `LocalStorageAdapter` | ✅ 預設啟用 |
| SeaweedFS | 原始碼檔案儲存（S3） | `SeaweedFSFileStore` | ✅ 已實作 |
| ArangoDB | 圖資料庫 | `ArangoDBAdapter` | ✅ 已實作 |
| Qdrant | 向量搜尋 | `QdrantAdapter` | ✅ 已實作 |
| dllm | LLM 程式碼分析 | `LLMPlugin` | ✅ 已實作 |
| Tork | 任務排程 | `TorkScheduler` | ✅ 已實作（engine/services） |

## 開發

```bash
pnpm -r build              # 編譯所有 TS 套件
cargo build                 # 編譯 Rust 引擎（engine/）
napi build --release        # 編譯 napi-rs 二進制
source analyzer/.venv/bin/activate && pip install -e analyzer/  # 安裝 Python 分析層
cd web && npm run build     # 編譯 Tauri 前端
```

## License

MIT
