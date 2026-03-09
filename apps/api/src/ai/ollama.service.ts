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

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const aiConfig = this.configService.get<AiConfigType>('ai');
    this.baseUrl = aiConfig.ollamaBaseUrl;
    this.chatModel = aiConfig.chatModel;
    this.embedModel = aiConfig.embedModel;
    this.logger.log(`Ollama configured at ${this.baseUrl} with chat model ${this.chatModel}`);
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
