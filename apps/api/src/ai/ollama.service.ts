import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Ollama } from 'ollama';
import { SettingsService } from '../settings/settings.service';
import { AI_SETTINGS_UPDATED_EVENT } from '../settings/ai-settings.service';

@Injectable()
export class OllamaService implements OnModuleInit {
  private readonly logger = new Logger(OllamaService.name);
  private client!: Ollama;
  private chatModel!: string;
  private embedModel!: string;
  private _baseUrl!: string;
  private _modelsReady = false;
  private _modelsPulling = false;
  private _pullProgress: Record<string, string> = {};

  constructor(private readonly settingsService: SettingsService) {}

  get modelsReady(): boolean {
    return this._modelsReady;
  }

  get modelsPulling(): boolean {
    return this._modelsPulling;
  }

  get pullProgress(): Record<string, string> {
    return { ...this._pullProgress };
  }

  get modelName(): string {
    return this.chatModel;
  }

  get embeddingModelName(): string {
    return this.embedModel;
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  async onModuleInit() {
    const config = await this.settingsService.getAiConfiguration();
    this._baseUrl = config.ollamaBaseUrl;
    this.chatModel = config.chatModel;
    this.embedModel = config.embedModel;
    this.client = new Ollama({ host: this._baseUrl });
    this.logger.log(`Ollama configured at ${this._baseUrl} with chat model ${this.chatModel}`);
    if (config.enabled) {
      this.ensureModels().catch((err) => this.logger.error('Failed to ensure models', err));
    }
  }

  @OnEvent(AI_SETTINGS_UPDATED_EVENT)
  async reconfigure(): Promise<void> {
    const config = await this.settingsService.getAiConfiguration();
    const urlChanged = this._baseUrl !== config.ollamaBaseUrl;
    const chatChanged = this.chatModel !== config.chatModel;
    const embedChanged = this.embedModel !== config.embedModel;

    this._baseUrl = config.ollamaBaseUrl;
    this.chatModel = config.chatModel;
    this.embedModel = config.embedModel;

    if (urlChanged) {
      this.client = new Ollama({ host: this._baseUrl });
      this.logger.log(`Ollama reconnected to ${this._baseUrl}`);
    }

    if (config.enabled && (urlChanged || chatChanged || embedChanged || !this._modelsReady)) {
      this._modelsReady = false;
      this.ensureModels().catch((err) => this.logger.error('Failed to ensure models after reconfigure', err));
    }
  }

  private async ensureModels() {
    let availableModels: string[];
    try {
      const { models } = await this.client.list();
      availableModels = models.map((m) => m.name);
    } catch {
      this.logger.warn('Ollama not reachable, skipping model availability check');
      return;
    }

    for (const model of [...new Set([this.chatModel, this.embedModel])]) {
      await this.ensureModel(model, availableModels);
    }

    this._modelsReady = true;
    this._modelsPulling = false;
    this.logger.log('All required models are available');
  }

  private async ensureModel(model: string, availableModels: string[]) {
    const normalizedTarget = model.includes(':') ? model : `${model}:latest`;
    const available = availableModels.some((name) => name === normalizedTarget || name === model);
    if (available) {
      this.logger.log(`Model "${model}" is already available`);
      return;
    }

    this.logger.log(`Model "${model}" not found, pulling...`);
    this._modelsPulling = true;
    this._pullProgress[model] = 'starting';

    const stream = await this.client.pull({ model, stream: true });
    let lastLogTime = 0;
    for await (const chunk of stream) {
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
    }

    delete this._pullProgress[model];
    this.logger.log(`Model "${model}" pulled successfully`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      await fetch(this._baseUrl, { signal: controller.signal });
      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  }

  async embed(text: string): Promise<number[]> {
    const { embeddings } = await this.client.embed({ model: this.embedModel, input: text });
    const result = embeddings?.[0];
    if (!result || result.length === 0) {
      this.logger.warn(`Embedding returned empty vector for text: "${text.slice(0, 80)}..."`);
      return [];
    }
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const { embeddings } = await this.client.embed({ model: this.embedModel, input: texts });
    return embeddings ?? [];
  }
}
