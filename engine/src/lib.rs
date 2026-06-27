pub mod api;
pub mod services;

use napi_derive::napi;

// ── 既有的 napi-rs 介面保持向下相容 ──

#[napi]
pub fn generate_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

// 既有圖查詢函數委派給 services
#[napi]
pub fn find_dependents(graph_json: String, seed_ids: Vec<String>, max_depth: i32) -> String {
    api::query::find_dependents(&graph_json, &seed_ids, max_depth)
}

#[napi]
pub fn find_paths(graph_json: String, source_id: String, target_id: String, max_depth: i32) -> String {
    api::query::find_paths(&graph_json, &source_id, &target_id, max_depth)
}

#[napi]
pub fn detect_cycles(graph_json: String) -> String {
    api::query::detect_cycles(&graph_json)
}

#[napi]
pub fn compute_impact_scores(graph_json: String, seed_id: String) -> String {
    api::query::compute_impact_scores(&graph_json, &seed_id)
}
