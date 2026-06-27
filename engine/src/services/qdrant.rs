use serde::{Deserialize, Serialize};

/// Qdrant 向量搜尋服務
/// 預計封裝：collection 管理、upsert、search、payload filter
pub struct QdrantService {
    pub endpoint: String,
    pub api_key: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct SearchResult {
    pub id: u64,
    pub score: f32,
    pub payload: serde_json::Value,
}

impl QdrantService {
    pub fn new(endpoint: &str, api_key: Option<&str>) -> Self {
        Self {
            endpoint: endpoint.to_string(),
            api_key: api_key.map(|s| s.to_string()),
        }
    }

    /// 根據 project_id 回傳前綴隔離的 collection 名稱
    pub fn collection_name(&self, project_id: &str, suffix: &str) -> String {
        format!("pcm_{}_{}", project_id, suffix)
    }
}
