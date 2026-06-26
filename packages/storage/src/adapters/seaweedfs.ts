import type { Project, Symbol, Relationship, CodeGraph, SymbolFilter, RelationshipFilter, StorageAdapter } from '@pcm/core';

/**
 * SeaweedFS 儲存適配器
 * 透過 S3-compatible API 讀取專案檔案
 * 數據結構仍儲存在本機 SQLite，原始檔案從 SeaweedFS 讀取
 */
export class SeaweedFSAdapter {
  readonly name = 'seaweedfs';
  private endpoint: string;
  private accessKey: string;
  private secretKey: string;

  constructor(config: {
    endpoint: string;
    accessKey: string;
    secretKey: string;
  }) {
    this.endpoint = config.endpoint;
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
  }

  async connect(): Promise<void> {
    // TODO: Phase 2 實作 S3 API 連線
    // const { S3Client } = await import('@aws-sdk/client-s3');
    // this.client = new S3Client({
    //   endpoint: this.endpoint,
    //   region: 'us-east-1',
    //   credentials: { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
    //   forcePathStyle: true,
    // });
  }

  /** 從 SeaweedFS 讀取檔案內容 */
  async readFile(bucket: string, path: string): Promise<string | null> {
    // TODO: Phase 2 實作
    // const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    // const response = await this.client.send(new GetObjectCommand({
    //   Bucket: bucket, Key: path
    // }));
    // return await response.Body?.transformToString() ?? null;
    return null;
  }

  /** 列出 bucket 中的檔案 */
  async listFiles(bucket: string, prefix: string): Promise<string[]> {
    // TODO
    return [];
  }
}
