# ADR-001: 專案骨架與多語言策略

## 日期
2025-06-27

## 狀態
Accepted

## 背景
PCM 需要支援多語言協作（TypeScript 交互層、Rust 核心引擎、Python AI 分析），同
時保持開發初期迭代快速。

## 決策
1. 使用 pnpm workspace monorepo 管理 TypeScript packages
2. engine/ 目錄預留為 Rust napi-rs crate
3. analyzer/ 目錄預留為 Python maturin+pyo3 專案
4. 開發階段先用 TypeScript + Tree-sitter WASM 快速驗證
5. Rust/Python 在 Phase 2+ 逐步引入，不急於早期

## 影響
- 優點：Phase 0 快速出 MVP，後續有明確遷移路徑
- 缺點：Phase 2 需要重構部分核心為 Rust
- 權衡：不一次到位，而是讓市場驗證先行

## 參照
- pnpm-workspace.yaml
- engine/Cargo.toml
- analyzer/pyproject.toml
