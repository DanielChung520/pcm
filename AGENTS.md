# PCM — Project Code Management

**願景：** AI 時代開發者第二大腦。讓 AI Agent 和人類開發者都能瞬間理解任何專案的知識中樞。

**開發態度：** 產品級品質，先自己用到成熟，再逐步開放。

## 三層分離架構

| 層級 | 路徑 | 用途 |
|------|------|------|
| **專案目錄** | `/home/daniel/github/pcm/` | 開發原始碼（git版本控制） |
| **工作區** | `~/.pcm/` | 運行時資料（config, cache, keys, audit） |
| **用戶檔案** | SeaweedFS buckets | 各專案原始碼（分散式儲存） |

## 技術棧

- **TypeScript**: CLI + MCP Server（薄交互層）
- **Rust (Phase 2+)**: 核心引擎（Tree-sitter, 圖查詢, napi-rs）
- **Python (Phase 2+)**: AI 分析層（嵌入, GraphRAG, pyo3）
- **前端 (Phase 3+)**: Tauri + React + D3.js（Desktop App）
- **基礎建設**: dllm（LLM）、ArangoDB（圖庫）、Qdrant（向量）、SeaweedFS（檔案）

## 專案結構

```
pcm/
├── packages/
│   ├── core/              # 微內核：模型、插件系統、事件總線
│   ├── cli/               # CLI 工具（pcm 命令）
│   ├── mcp-server/        # MCP Server（AI Agent 接口）
│   ├── storage/           # 儲存抽象層（SQLite / SeaweedFS）
│   └── plugins/
│       └── typescript/    # TS/JS 語言解析器（Tree-sitter）
├── engine/                # [預留] Rust 查詢引擎
├── analyzer/              # [預留] Python 分析引擎
├── web/                   # [預留] Tauri Desktop App
├── docs/adr/              # 架構決策記錄
└── package.json           # pnpm workspace root
```

## 開發命令

```bash
pnpm build          # 編譯所有套件
pnpm dev            # 開發模式（CLI）
pnpm test           # 執行測試
pnpm -r build       # 遞迴編譯
```

## CLI 命令（Agent 友好）

| 命令 | 用途 |
|------|------|
| `pcm list` | 列出所有專案 |
| `pcm scan <project>` | 掃描專案，生成圖譜 |
| `pcm status [project]` | 查看掃描狀態 |
| `pcm graph <project>` | 輸出依賴圖 |
| `pcm modules <project>` | 列出模組與符號 |
| `pcm hotspots <project>` | 複雜度熱點 |

所有命令支援 `--json` 輸出。進度→stderr，資料→stdout。

## 開發階段

- [ ] **Phase 0** (目前): CLI + 基本掃描 + Markdown 輸出
- [ ] **Phase 1**: SQLite 查詢 + 影響分析 + MCP Server 完整
- [ ] **Phase 2**: 語義搜索 + GraphRAG + Rust/Python 引擎
- [ ] **Phase 3**: Tauri Desktop App + 圖譜可視化
- [ ] **Phase 4**: 插件市場 + 生態化

## 設計原則

1. **微內核 + 插件**: 核心只定義模型和接口，功能都是插件
2. **Agent 優先**: CLI 設計以 AI Agent 調用為主要場景
3. **本地優先**: 無需外部服務即可運行（SQLite 為預設儲存）
4. **增量更新**: 只分析變更文件，冪等操作
