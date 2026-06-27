/// ArangoDB 圖資料庫服務
/// 預計封裝：graph traversal、AQL 查詢、collection 管理
pub struct ArangoService {
    pub endpoint: String,
    pub db_name: String,
    pub username: String,
    pub password: String,
}

impl ArangoService {
    pub fn new(endpoint: &str, db_name: &str, username: &str, password: &str) -> Self {
        Self {
            endpoint: endpoint.to_string(),
            db_name: db_name.to_string(),
            username: username.to_string(),
            password: password.to_string(),
        }
    }
}
