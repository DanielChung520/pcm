import type { FeaturePlugin, Project, CodeGraph } from '@pcm/core';

interface LLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

const DEFAULT_CONFIG: LLMConfig = {
  endpoint: 'http://localhost:11400/v1',
  apiKey: '',
  model: 'qwen3-30b-a3b-4bit',
};

export class LLMPlugin implements FeaturePlugin {
  name = 'llm';
  version = '0.1.0';
  description = 'LLM-powered code analysis via dllm';

  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async chat(messages: { role: string; content: string }[]): Promise<string> {
    const response = await fetch(`${this.config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.3,
        max_tokens: 2048,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`dllm API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async summarizeCode(code: string, context: string): Promise<string> {
    return this.chat([
      { role: 'system', content: 'You are a code analysis expert. Summarize the provided code concisely.' },
      { role: 'user', content: `Context: ${context}\n\nCode:\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\`` },
    ]);
  }

  async analyzeArchitecture(graph: CodeGraph): Promise<string> {
    const modules = graph.symbols.filter(s => s.type === 'file').map(s => s.filePath).join('\n');
    const deps = graph.relationships.filter(r => r.type === 'imports').length;

    return this.chat([
      { role: 'system', content: 'You are a software architecture expert. Analyze the project structure.' },
      { role: 'user', content: `Project has ${graph.stats.fileCount} files, ${graph.stats.symbolCount} symbols, ${deps} dependencies.\n\nFiles:\n${modules.slice(0, 3000)}` },
    ]);
  }

  async query(project: Project, params: Record<string, unknown>): Promise<string> {
    const prompt = params.prompt as string || '';
    const graph = params.graph as CodeGraph | undefined;

    if (!prompt) return 'No prompt provided';
    if (graph) {
      const arch = graph.symbols.filter(s => s.type === 'file').map(s => `- ${s.filePath} (${s.name})`).join('\n');
      return this.chat([
        { role: 'system', content: 'You are a code analysis expert. Use the project structure to answer.' },
        { role: 'user', content: `Project structure:\n${arch.slice(0, 3000)}\n\nQuestion: ${prompt}` },
      ]);
    }
    return this.chat([
      { role: 'system', content: 'You are a helpful AI assistant integrated with PCM code analysis tools.' },
      { role: 'user', content: prompt },
    ]);
  }
}
