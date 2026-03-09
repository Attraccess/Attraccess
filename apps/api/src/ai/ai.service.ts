import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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

@Injectable()
export class AiService {
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

  async chat(
    conversationId: string | undefined,
    messages: UIMessage[],
    userId: number,
    userName: string | undefined,
    sessionCookie: string,
  ): Promise<{ conversationId: string; result: ReturnType<typeof streamText> }> {
    const convId = conversationId || crypto.randomUUID();
    const dbConv = await this.getOrCreateConversation(convId, userId);

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

    const appUrl = (await this.settingsService.getUrl()) || this.configService.get<AppConfigType>('app')?.ATTRACCESS_URL || '';
    const resources = await this.fetchResourceContext(userId);
    const systemPrompt = buildSystemPrompt({ userName, appUrl, resources });
    const tools = this.toolRegistry.buildTools(sessionCookie);

    const ollamaProvider = createOllama({ baseURL: this.ollamaService.baseUrl + '/api' });
    const model = ollamaProvider.chat(this.ollamaService.modelName);

    const modelMessages = await convertToModelMessages(messages);

    this.logger.log(`Chat request: conv=${convId} user=${userId} messages=${messages.length} tools=${Object.keys(tools).join(',')}`);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: tools as any,
      stopWhen: stepCountIs(15),
      onFinish: async ({ text, steps, finishReason, usage }) => {
        const toolCalls = steps?.flatMap((s) => s.toolCalls || []) || [];
        const toolResults = steps?.flatMap((s) => s.toolResults || []) || [];
        this.logger.log(
          `Chat finished: conv=${convId} reason=${finishReason} steps=${steps?.length ?? 0} toolCalls=${toolCalls.length} toolResults=${toolResults.length} tokens=${JSON.stringify(usage)}`,
        );
        for (const tc of toolCalls) {
          this.logger.debug(`  Tool call: ${tc.toolName}(${JSON.stringify((tc as any).args).slice(0, 200)})`);
        }
        for (const tr of toolResults) {
          const resultStr = JSON.stringify((tr as any).result ?? tr).slice(0, 300);
          this.logger.debug(`  Tool result [${tr.toolName}]: ${resultStr}`);
        }
        if (text) {
          await this.saveMessage(dbConv.id, 'assistant', text);
        }
      },
      onError: (err) => {
        const error = err.error instanceof Error ? err.error : err;
        this.logger.error(`Chat stream error: conv=${convId} error=${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      },
    });

    return { conversationId: convId, result };
  }

  async clearConversation(conversationId: string, userId: number) {
    const dbConv = await this.conversationRepo.findOne({ where: { uuid: conversationId, userId } });
    if (dbConv) {
      await this.conversationRepo.remove(dbConv);
    }
  }

  async listConversations(userId: number): Promise<{ uuid: string; title: string | null; updatedAt: Date }[]> {
    const conversations = await this.conversationRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
    return conversations.map((c) => ({ uuid: c.uuid, title: c.title, updatedAt: c.updatedAt }));
  }

  async getConversationMessages(
    conversationId: string,
    userId: number,
  ): Promise<{ role: string; content: string; toolCalls?: unknown[]; createdAt: Date }[] | null> {
    const dbConv = await this.conversationRepo.findOne({ where: { uuid: conversationId, userId } });
    if (!dbConv) return null;

    const messages = await this.messageRepo.find({
      where: { conversationId: dbConv.id },
      order: { createdAt: 'ASC' },
    });

    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls || undefined,
        createdAt: m.createdAt,
      }));
  }

  private async fetchResourceContext(userId: number): Promise<{ resources: ResourceInfo[]; hasMore: boolean }> {
    try {
      const allResources = await this.resourcesService.listResources({ page: 1, limit: 100, returnUsingUser: true });
      const accessibleRes = await this.resourcesService.listResources({ page: 1, limit: 100, onlyWithPermissionForUserId: userId });
      const accessibleIds = new Set(accessibleRes.data.map((r) => r.id));

      const mapped: ResourceInfo[] = allResources.data.map((r) => {
        const activeUsage = r.usages?.find((u) => !u.endTime);
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          userHasAccess: accessibleIds.has(r.id),
          currentlyUsedBy: activeUsage?.user ? { id: activeUsage.user.id, name: activeUsage.user.username || `User #${activeUsage.user.id}` } : undefined,
          isUsedByCurrentUser: activeUsage?.userId === userId,
        };
      });

      mapped.sort((a, b) => {
        if (a.isUsedByCurrentUser !== b.isUsedByCurrentUser) return a.isUsedByCurrentUser ? -1 : 1;
        if (a.userHasAccess !== b.userHasAccess) return a.userHasAccess ? -1 : 1;
        if (!!a.currentlyUsedBy !== !!b.currentlyUsedBy) return a.currentlyUsedBy ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const limit = 15;
      return { resources: mapped.slice(0, limit), hasMore: mapped.length > limit };
    } catch (err) {
      this.logger.warn('Failed to fetch resource context for AI', err);
      return { resources: [], hasMore: false };
    }
  }

  private async getOrCreateConversation(conversationId: string, userId: number): Promise<AiConversation> {
    let dbConv = await this.conversationRepo.findOne({ where: { uuid: conversationId, userId } });
    if (!dbConv) {
      dbConv = await this.conversationRepo.save({ uuid: conversationId, userId, title: null });
    }
    return dbConv;
  }

  private async saveMessage(conversationDbId: number, role: string, content: string): Promise<void> {
    await this.messageRepo.save({ conversationId: conversationDbId, role, content });
  }

  private async updateConversationTitle(dbId: number, firstMessage: string): Promise<void> {
    const title = firstMessage.length > 50 ? firstMessage.slice(0, 50) + '...' : firstMessage;
    await this.conversationRepo.update({ id: dbId, title: IsNull() }, { title });
  }

}
