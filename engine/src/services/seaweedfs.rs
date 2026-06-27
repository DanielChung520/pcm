/// SeaweedFS 檔案儲存服務
/// 預計封裝：S3-compatible 讀寫、bucket policy 管理
pub struct SeaweedFSService {
    pub endpoint: String,
    pub access_key: String,
    pub secret_key: String,
}

impl SeaweedFSService {
    pub fn new(endpoint: &str, access_key: &str, secret_key: &str) -> Self {
        Self {
            endpoint: endpoint.to_string(),
            access_key: access_key.to_string(),
            secret_key: secret_key.to_string(),
        }
    }
}
