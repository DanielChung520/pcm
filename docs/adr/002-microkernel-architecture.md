# ADR-002: 微內核 + 插件架構

## 日期
2025-06-27

## 狀態
Accepted

## 背景
PCM 需要支援 N 個專案 × M 個功能的矩陣擴展，同時保持核心穩定。

## 決策
採用微內核架構，定義三大插件介面：
1. FeaturePlugin — 功能插件（掃描、RAG、影響分析...）
2. LanguagePlugin — 語言解析（TS、Python、Go...）
3. StorageAdapter — 儲存後端（SQLite、ArangoDB、FalkorDB...）

核心（@pcm/core）僅包含：
- 資料模型（Project, Symbol, Relationship, CodeGraph）
- 插件管理器
- 事件總線
- 專案生命週期管理

## 影響
- 優點：新增功能只要寫新插件，不改核心
- 優點：每個插件可獨立測試、獨立發布
- 缺點：初期需多花時間定義插件介面
- 權衡：超過 3 個功能後，插件架構的 ROI 就超過了初期成本

## 參照
- packages/core/src/plugins/types.ts（三大介面定義）
- packages/core/src/kernel.ts（微內核實現）
- packages/core/src/events.ts（事件總線）
