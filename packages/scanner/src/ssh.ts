import { Client, ClientChannel } from 'ssh2';
import * as path from 'node:path';

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export class SSHScanner {
  private config: SSHConfig;
  private client: Client | null = null;

  constructor(config: SSHConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = new Client();
      this.client.on('ready', () => resolve());
      this.client.on('error', (err) => reject(err));
      this.client.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
        privateKey: this.config.privateKey,
        passphrase: this.config.passphrase,
        readyTimeout: 10000,
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }

  async execCommand(cmd: string): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.client!.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let output = '';
        stream.on('data', (data: Buffer) => output += data.toString());
        stream.stderr.on('data', (data: Buffer) => output += data.toString());
        stream.on('close', () => resolve(output));
        stream.on('error', reject);
      });
    });
  }

  /** 列出遠端目錄下的所有原始碼檔案（相對路徑） */
  async listFiles(remotePath: string, extensions: string[]): Promise<string[]> {
    const extPattern = extensions.map(e => `-name '*${e}'`).join(' -o ');
    const cmd = `find ${remotePath} -type f \\( ${extPattern} \\) ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/target/*' ! -path '*/dist/*' 2>/dev/null`;
    const output = await this.execCommand(cmd);
    return output.split('\n').filter(Boolean).map(f => path.relative(remotePath, f.trim()));
  }

  /** 讀取遠端檔案內容 */
  async readFile(remotePath: string): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.client!.sftp((err, sftp) => {
        if (err) return reject(err);
        const stream = sftp.createReadStream(remotePath);
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
      });
    });
  }

  /** 取得 Git commit hash */
  async getGitHash(remotePath: string): Promise<string | null> {
    try {
      return (await this.execCommand(`cd ${remotePath} && git rev-parse HEAD 2>/dev/null`)).trim() || null;
    } catch {
      return null;
    }
  }
}
