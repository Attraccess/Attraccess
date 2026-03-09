import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiConfigType } from '../config/ai.config';

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface OllamaChatStreamChunk {
  message?: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
}

@Injectable()
export class OllamaService implements OnModuleInit {
  private readonly logger = new Logger(OllamaService.name);
  private baseUrl!: string;
  private chatModel!: string;
  private embedModel!: string;
  private _modelsReady = false;
  private _modelsPulling = false;
  private _pullProgress: Record<string, string> = {};

  constructor(private readonly configService: ConfigService) {}

  get modelsReady(): boolean {
    return this._modelsReady;
  }

  get modelsPulling(): boolean {
    return this._modelsPulling;
  }

  get pullProgress(): Record<string, string> {
    return { ...this._pullProgress };
  }

  async onModuleInit() {
    const aiConfig = this.configService.get<AiConfigType>('ai');
    this.baseUrl = aiConfig.ollamaBaseUrl;
    this.chatModel = aiConfig.chatModel;
    this.embedModel = aiConfig.embedModel;
    this.logger.log(`Ollama configured at ${this.baseUrl} with chat model ${this.chatModel}`);
    this.ensureModels().catch((err) => this.logger.error('Failed to ensure models', err));
  }

  private async ensureModels() {
    const healthy = await this.healthCheck();
    if (!healthy) {
      this.logger.warn('Ollama not reachable, skipping model availability check');
      return;
    }

    const models = [this.chatModel, this.embedModel];
    const uniqueModels = [...new Set(models)];

    for (const model of uniqueModels) {
      await this.ensureModel(model);
    }

    this._modelsReady = true;
    this._modelsPulling = false;
    this.logger.log('All required models are available');
  }

  private async ensureModel(model: string) {
    const available = await this.isModelAvailable(model);
    if (available) {
      this.logger.log(`Model "${model}" is already available`);
      return;
    }

    this.logger.log(`Model "${model}" not found, pulling...`);
    this._modelsPulling = true;
    this._pullProgress[model] = 'starting';
    await this.pullModel(model);
    delete this._pullProgress[model];
    this.logger.log(`Model "${model}" pulled successfully`);
  }

  private async isModelAvailable(model: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return false;
      const data = await res.json();
      const modelNames: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
      const normalizedTarget = model.includes(':') ? model : `${model}:latest`;
      return modelNames.some((name) => name === normalizedTarget || name === model);
    } catch {
      return false;
    }
  }

  private async pullModel(model: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
    });

    if (!res.ok) {
      throw new Error(`Failed to start pull for model "${model}": ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No response body from Ollama pull');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let lastLogTime = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed);
          const now = Date.now();
          if (chunk.total && chunk.completed) {
            const pct = Math.round((chunk.completed / chunk.total) * 100);
            this._pullProgress[model] = `${chunk.status} ${pct}%`;
            if (now - lastLogTime > 5000) {
              this.logger.log(`Pulling "${model}": ${chunk.status} ${pct}%`);
              lastLogTime = now;
            }
          } else if (chunk.status) {
            this._pullProgress[model] = chunk.status;
            if (now - lastLogTime > 5000) {
              this.logger.log(`Pulling "${model}": ${chunk.status}`);
              lastLogTime = now;
            }
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async *chatStream(
    messages: OllamaChatMessage[],
    tools?: OllamaTool[],
  ): AsyncGenerator<OllamaChatStreamChunk> {
    const body: Record<string, unknown> = {
      model: this.chatModel,
      messages,
      stream: true,
    };

    if (tools?.length) {
      body.tools = tools;
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Ollama chat request failed: ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No response body from Ollama');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          yield JSON.parse(trimmed) as OllamaChatStreamChunk;
        } catch {
          this.logger.warn(`Failed to parse Ollama chunk: ${trimmed}`);
        }
      }
    }

    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer.trim()) as OllamaChatStreamChunk;
      } catch {
        this.logger.warn(`Failed to parse final Ollama chunk: ${buffer.trim()}`);
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embedModel, input: text }),
    });

    if (!res.ok) {
      throw new Error(`Ollama embed request failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return data.embeddings?.[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embedModel, input: texts }),
    });

    if (!res.ok) {
      throw new Error(`Ollama embed batch request failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return data.embeddings ?? [];
  }
}
