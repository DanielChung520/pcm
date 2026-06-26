import type { StorageAdapter } from '@pcm/core';

interface QdrantPoint {
  id: number;
  vector: number[];
  payload: Record<string, unknown>;
}

export class QdrantAdapter {
  readonly name = 'qdrant';
  private url: string;
  private apiKey: string;

  constructor(config?: { url?: string; apiKey?: string }) {
    this.url = config?.url || 'http://localhost:6333';
    this.apiKey = config?.apiKey || '';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'api-key': this.apiKey } : {}),
    };
  }

  async ensureCollection(name: string, vectorSize: number): Promise<void> {
    const exists = await this.collectionExists(name);
    if (!exists) {
      await fetch(`${this.url}/collections/${name}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({
          vectors: { size: vectorSize, distance: 'Cosine' },
        }),
      });
    }
  }

  async collectionExists(name: string): Promise<boolean> {
    const res = await fetch(`${this.url}/collections/${name}`, {
      method: 'GET',
      headers: this.headers,
    });
    return res.ok;
  }

  async upsertPoints(collection: string, points: QdrantPoint[]): Promise<void> {
    await fetch(`${this.url}/collections/${collection}/points`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ points }),
    });
  }

  async search(
    collection: string,
    vector: number[],
    limit = 10,
  ): Promise<{ id: number; score: number; payload: Record<string, unknown> }[]> {
    const res = await fetch(`${this.url}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ vector, limit, with_payload: true }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result || []).map((r: any) => ({
      id: r.id,
      score: r.score,
      payload: r.payload || {},
    }));
  }

  async deleteCollection(name: string): Promise<void> {
    await fetch(`${this.url}/collections/${name}`, {
      method: 'DELETE',
      headers: this.headers,
    });
  }

  async collectionInfo(name: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(`${this.url}/collections/${name}`, {
      method: 'GET',
      headers: this.headers,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result || null;
  }
}
