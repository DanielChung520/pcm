use serde::{Deserialize, Serialize};

pub struct TorkScheduler {
    pub endpoint: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorkJob {
    pub name: String,
    pub schedule: Option<String>,
    pub tasks: Vec<TorkTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TorkTask {
    pub name: String,
    pub image: String,
    pub run: String,
    pub queue: Option<String>,
    pub env: Option<Vec<String>>,
}

impl TorkScheduler {
    pub fn new(endpoint: &str) -> Self {
        Self {
            endpoint: endpoint.to_string(),
            enabled: false,
        }
    }

    pub fn create_scan_job(&self, project_id: &str, repo_path: &str, cron: &str) -> TorkJob {
        TorkJob {
            name: format!("pcm-scan-{}", project_id),
            schedule: Some(cron.to_string()),
            tasks: vec![TorkTask {
                name: "scan".to_string(),
                image: "pcm-scanner:latest".to_string(),
                run: format!("pcm scan --json {}", repo_path),
                queue: Some("pcm".to_string()),
                env: Some(vec![format!("PCM_PROJECT={}", project_id)]),
            }],
        }
    }

    pub fn create_embedding_job(&self, project_id: &str) -> TorkJob {
        TorkJob {
            name: format!("pcm-embed-{}", project_id),
            schedule: Some("0 3 * * *".to_string()),
            tasks: vec![TorkTask {
                name: "embed".to_string(),
                image: "pcm-analyzer:latest".to_string(),
                run: "pcm-analyzer embed-sync --all".to_string(),
                queue: Some("pcm".to_string()),
                env: Some(vec![format!("PCM_PROJECT={}", project_id)]),
            }],
        }
    }

    pub async fn submit_job(&self, job: &TorkJob) -> Result<String, String> {
        if !self.enabled {
            return Err("Tork scheduler not enabled".to_string());
        }
        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{}/jobs", self.endpoint))
            .json(job)
            .send()
            .await
            .map_err(|e| format!("Failed to submit job: {}", e))?;
        resp.text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))
    }

    pub async fn get_job_status(&self, job_id: &str) -> Result<String, String> {
        let client = reqwest::Client::new();
        let resp = client
            .get(format!("{}/jobs/{}", self.endpoint, job_id))
            .send()
            .await
            .map_err(|e| format!("Failed to get job status: {}", e))?;
        resp.text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))
    }
}
