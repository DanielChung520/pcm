# ADR-003: 專案目錄與工作區分離

## 日期
2025-06-27

## 狀態
Accepted

## 背景
PCM 開發過程需要區分「開發 PCM 原始碼」與「實際操作 PCM」。

## 決策
嚴格分離三個層級：
1. PCM 專案目錄: ~/github/pcm/ — 開發原始碼（git 版本控制）
2. PCM 工作區: ~/.pcm/ — 運行時資料（設定、快取、授權、審計日誌）
3. 用戶檔案: SeaweedFS buckets — 各專案原始碼（分散式儲存）

## 影響
- 優點：任意目錄可搬遷，不影響運行
- 優點：~/.pcm/ 可整個打包遷移到新機器
- 優點：SeaweedFS 提供分散式儲存，不綁定本機
- 警示：遷移時需要複製 ~/.pcm/ + 確保 SeaweedFS 連線

## 參照
- ~/.pcm/config.toml（工作區配置）
- packages/core/src/models/project.ts（ProjectSource 定義）
