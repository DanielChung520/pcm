import type { Project, Symbol, Relationship, CodeGraph, SymbolFilter, RelationshipFilter, StorageAdapter } from '@pcm/core';

interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region?: string;
}

export class SeaweedFSFileStore {
  readonly name = 'seaweedfs';
  private config: S3Config;
  private client: any = null;

  constructor(config: S3Config) {
    this.config = { region: 'us-east-1', ...config };
  }

  async connect(): Promise<void> {
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle: true,
    });
  }

  async readFile(bucket: string, path: string): Promise<string | null> {
    if (!this.client) await this.connect();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: bucket, Key: path,
      }));
      return await response.Body?.transformToString() ?? null;
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async writeFile(bucket: string, path: string, content: string): Promise<void> {
    if (!this.client) await this.connect();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(new PutObjectCommand({
      Bucket: bucket, Key: path, Body: content,
    }));
  }

  async listFiles(bucket: string, prefix: string): Promise<string[]> {
    if (!this.client) await this.connect();
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: prefix,
    }));
    return (response.Contents || []).map((obj: any) => obj.Key as string);
  }

  async deleteFile(bucket: string, path: string): Promise<void> {
    if (!this.client) await this.connect();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(new DeleteObjectCommand({
      Bucket: bucket, Key: path,
    }));
  }
}
