import { Injectable } from '@nestjs/common';
import { AiSettingsDto } from './dto/ai-settings.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { SettingsStoreService } from './settings-store.service';
import { AI_KEYS, AI_PARENT } from './constants';

export type AiSettingsInternal = {
  enabled: boolean;
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  maxContextChunks: number;
};

const DEFAULTS: AiSettingsInternal = {
  enabled: false,
  ollamaBaseUrl: 'http://localhost:11434',
  chatModel: 'llama3.2',
  embedModel: 'nomic-embed-text',
  maxContextChunks: 5,
};

@Injectable()
export class AiSettingsService {
  constructor(private readonly settingsStore: SettingsStoreService) {}

  async getSettings(): Promise<AiSettingsDto> {
    const [enabledRaw, ollamaBaseUrl, chatModel, embedModel, maxContextChunksRaw] =
      await Promise.all([
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.enabled),
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.ollamaBaseUrl),
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.chatModel),
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.embedModel),
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.maxContextChunks),
      ]);

    return {
      enabled: this.parseBoolean(enabledRaw) ?? DEFAULTS.enabled,
      ollamaBaseUrl,
      chatModel,
      embedModel,
      maxContextChunks: this.parseNumber(maxContextChunksRaw),
    };
  }

  async updateSettings(update: UpdateAiSettingsDto): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(update, 'enabled')) {
      await this.settingsStore.setPlainSetting(
        AI_PARENT,
        AI_KEYS.enabled,
        update.enabled === undefined ? null : String(update.enabled),
      );
    }
    if (Object.prototype.hasOwnProperty.call(update, 'ollamaBaseUrl')) {
      await this.settingsStore.setPlainSetting(AI_PARENT, AI_KEYS.ollamaBaseUrl, update.ollamaBaseUrl ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'chatModel')) {
      await this.settingsStore.setPlainSetting(AI_PARENT, AI_KEYS.chatModel, update.chatModel ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'embedModel')) {
      await this.settingsStore.setPlainSetting(AI_PARENT, AI_KEYS.embedModel, update.embedModel ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'maxContextChunks')) {
      const val = update.maxContextChunks ?? null;
      await this.settingsStore.setPlainSetting(
        AI_PARENT,
        AI_KEYS.maxContextChunks,
        val === null ? null : String(val),
      );
    }
  }

  async getConfiguration(): Promise<AiSettingsInternal> {
    const [enabledRaw, ollamaBaseUrl, chatModel, embedModel, maxContextChunksRaw] =
      await Promise.all([
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.enabled),
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.ollamaBaseUrl),
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.chatModel),
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.embedModel),
        this.settingsStore.getPlainSetting(AI_PARENT, AI_KEYS.maxContextChunks),
      ]);

    return {
      enabled: this.parseBoolean(enabledRaw) ?? DEFAULTS.enabled,
      ollamaBaseUrl: ollamaBaseUrl || DEFAULTS.ollamaBaseUrl,
      chatModel: chatModel || DEFAULTS.chatModel,
      embedModel: embedModel || DEFAULTS.embedModel,
      maxContextChunks: this.parseNumber(maxContextChunksRaw) ?? DEFAULTS.maxContextChunks,
    };
  }

  private parseBoolean(value: string | null): boolean | null {
    if (value === null) return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return null;
  }

  private parseNumber(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  }
}
