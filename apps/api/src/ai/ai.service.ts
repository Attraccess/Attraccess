import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';
import { AiConversation, AiConversationMessage } from '@attraccess/database-entities';
import { AppConfigType } from '../config/app.config';
import { OllamaService } from './ollama.service';
import { ToolRegistry } from './tools/tool-registry';
import { SettingsService } from '../settings/settings.service';
import { ResourcesService } from '../resources/resources.service';
import { buildSystemPrompt, type ResourceInfo } from './prompts/system-prompt';

const MAX_RECENT_MESSAGES = 20;
const MAX_RESOURCE_CONTEXT = 5;
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly toolRegistry: ToolRegistry,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly resourcesService: ResourcesService,
    @InjectRepository(AiConversation)
    private readonly conversationRepo: Repository<AiConversation>,
    @InjectRepository(AiConversationMessage)
    private readonly messageRepo: Repository<AiConversationMessage>,
  ) {}

  async onModuleInit() {
    await this.purgeStaleConversations();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleConversationCleanup() {
    await this.purgeStaleConversations();
  }

  async chat(
    messages: UIMessage[],
    userId: number,
    userName: string | undefined,
    sessionCookie: string,
  ): Promise<{ result: ReturnType<typeof streamText> }> {
    const dbConv = await this.getOrCreateConversation(userId);

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const lastUserText = lastUserMsg
      ? lastUserMsg.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join('')
      : '';

    if (lastUserMsg && lastUserText) {
      await Promise.all([
        this.saveMessage(dbConv.id, 'user', lastUserText),
        this.updateConversationTitle(dbConv.id, lastUserText),
      ]);
    }

    const [appUrl, resources, modelMessages] = await Promise.all([
      this.settingsService.getUrl().then((url) => url || this.configService.get<AppConfigType>('app')?.ATTRACCESS_URL || ''),
      this.fetchResourceContext(userId),
      this.prepareMessages(messages),
    ]);
    const systemPrompt = buildSystemPrompt({ userName, appUrl, resources });
    const tools = this.toolRegistry.buildTools(sessionCookie);

    const ollamaProvider = createOllama({ baseURL: this.ollamaService.baseUrl + '/api' });
    const model = ollamaProvider.chat(this.ollamaService.modelName);

    this.logger.log(`Chat request: user=${userId} messages=${modelMessages.length} tools=${Object.keys(tools).join(',')}`);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      maxOutputTokens: 2048,
      stopWhen: stepCountIs(15),
      onFinish: async ({ text, steps, finishReason, usage }) => {
        const toolCalls = steps?.flatMap((s) => s.toolCalls || []) || [];
        const toolResults = steps?.flatMap((s) => s.toolResults || []) || [];
        this.logger.log(
          `Chat finished: user=${userId} reason=${finishReason} steps=${steps?.length ?? 0} toolCalls=${toolCalls.length} toolResults=${toolResults.length} tokens=${JSON.stringify(usage)}`,
        );
        for (const tc of toolCalls) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.logger.debug(`  Tool call: ${tc.toolName}(${JSON.stringify((tc as any).args).slice(0, 200)})`);
        }
        for (const tr of toolResults) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resultStr = JSON.stringify((tr as any).result ?? tr).slice(0, 300);
          this.logger.debug(`  Tool result [${tr.toolName}]: ${resultStr}`);
        }
        if (text) {
          await this.saveMessage(dbConv.id, 'assistant', text);
        }
      },
      onError: (err) => {
        const error = err.error instanceof Error ? err.error : err;
        this.logger.error(`Chat stream error: user=${userId} error=${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      },
    });

    return { result };
  }

  async clearConversation(userId: number) {
    const dbConv = await this.conversationRepo.findOne({ where: { userId } });
    if (dbConv) {
      await this.conversationRepo.remove(dbConv);
    }
  }

  async purgeStaleConversations(): Promise<number> {
    const cutoff = new Date(Date.now() - CONVERSATION_TTL_MS);
    const { affected } = await this.conversationRepo.delete({ updatedAt: LessThan(cutoff) });
    if (affected && affected > 0) {
      this.logger.log(`Purged ${affected} stale conversations (older than 24h)`);
    }
    return affected ?? 0;
  }

  private async prepareMessages(messages: UIMessage[]) {
    const modelMessages = await convertToModelMessages(messages);

    if (modelMessages.length <= MAX_RECENT_MESSAGES) {
      return modelMessages;
    }

    const olderMessages = modelMessages.slice(0, modelMessages.length - MAX_RECENT_MESSAGES);
    const recentMessages = modelMessages.slice(modelMessages.length - MAX_RECENT_MESSAGES);

    const summary = this.summarizeOlderMessages(olderMessages);

    const summaryMessage = {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: `[Previous conversation summary: ${summary}]` }],
    };

    return [summaryMessage, ...recentMessages];
  }

  private summarizeOlderMessages(messages: Array<{ role: string; content: unknown }>): string {
    const points: string[] = [];
    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const textParts = Array.isArray(msg.content)
          ? msg.content
              .filter((p): p is { type: 'text'; text: string } => typeof p === 'object' && p !== null && 'type' in p && p.type === 'text')
              .map((p) => p.text)
          : [String(msg.content)];

        const text = textParts.join(' ').trim();
        if (text) {
          const truncated = text.length > 100 ? text.slice(0, 100) + '...' : text;
          points.push(`${msg.role}: ${truncated}`);
        }
      }
    }

    if (points.length > 10) {
      return points.slice(0, 5).join(' | ') + ' | ... | ' + points.slice(-3).join(' | ');
    }
    return points.join(' | ');
  }

  private async fetchResourceContext(userId: number): Promise<{ resources: ResourceInfo[]; hasMore: boolean }> {
    try {
      const accessibleRes = await this.resourcesService.listResources({ page: 1, limit: MAX_RESOURCE_CONTEXT*4, onlyWithPermissionForUserId: userId, returnUsingUser: true });

      const mapped: ResourceInfo[] = accessibleRes.data.map((r) => {
        const activeUsage = r.usages?.find((u) => !u.endTime);
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          currentlyUsedBy: activeUsage?.user ? { id: activeUsage.user.id, name: activeUsage.user.username || `User #${activeUsage.user.id}` } : undefined,
          isUsedByCurrentUser: activeUsage?.userId === userId,
        };
      });

      mapped.sort((a, b) => {
        if (a.isUsedByCurrentUser !== b.isUsedByCurrentUser) return a.isUsedByCurrentUser ? -1 : 1;
        if (!!a.currentlyUsedBy !== !!b.currentlyUsedBy) return a.currentlyUsedBy ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return { resources: mapped.slice(0, MAX_RESOURCE_CONTEXT), hasMore: mapped.length > MAX_RESOURCE_CONTEXT };
    } catch (err) {
      this.logger.warn('Failed to fetch resource context for AI', err);
      return { resources: [], hasMore: false };
    }
  }

  private async getOrCreateConversation(userId: number): Promise<AiConversation> {
    const existing = await this.conversationRepo.findOne({ where: { userId } });
    if (existing) return existing;
    return this.conversationRepo.save({ userId, title: null });
  }

  private async saveMessage(conversationDbId: number, role: 'user' | 'assistant', content: string): Promise<void> {
    await this.messageRepo.save({ conversationId: conversationDbId, role, content });
  }

  private async updateConversationTitle(dbId: number, firstMessage: string): Promise<void> {
    const title = firstMessage.length > 50 ? firstMessage.slice(0, 50) + '...' : firstMessage;
    await this.conversationRepo.update({ id: dbId, title: IsNull() }, { title });
  }

}
