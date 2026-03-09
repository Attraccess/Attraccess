import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { OllamaService, OllamaChatMessage } from './ollama.service';
import { RagService } from './rag/rag.service';
import { ToolRegistry } from './tools/tool-registry';
import { ToolExecutor } from './tools/tool-executor';
import { buildSystemPrompt } from './prompts/system-prompt';
import { ChatEvent } from './dto/chat-event.dto';
import { randomUUID } from 'crypto';

interface Conversation {
  messages: OllamaChatMessage[];
  pendingToolCalls: Map<string, { name: string; arguments: Record<string, unknown> }>;
  lastActivity: number;
}

interface MessageEvent {
  data: ChatEvent;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly conversations = new Map<string, Conversation>();
  private readonly conversationTtlMs = 30 * 60 * 1000;

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly ragService: RagService,
    private readonly toolRegistry: ToolRegistry,
    private readonly toolExecutor: ToolExecutor,
  ) {
    setInterval(() => this.cleanupConversations(), 5 * 60 * 1000);
  }

  async chat(
    conversationId: string | undefined,
    message: string,
    userName: string | undefined,
    sessionCookie: string,
  ): Promise<{ conversationId: string; stream: Subject<MessageEvent> }> {
    const convId = conversationId || randomUUID();
    const conversation = this.getOrCreateConversation(convId);
    const subject = new Subject<MessageEvent>();

    this.processChat(conversation, message, userName, sessionCookie, subject).catch((err) => {
      this.logger.error('Chat processing error', err);
      subject.next({ data: { type: 'error', message: err.message || 'Internal error' } });
      subject.next({ data: { type: 'done' } });
      subject.complete();
    });

    return { conversationId: convId, stream: subject };
  }

  async approveActions(
    conversationId: string,
    actionIds: string[],
    sessionCookie: string,
  ): Promise<Subject<MessageEvent>> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      const subject = new Subject<MessageEvent>();
      subject.next({ data: { type: 'error', message: 'Conversation not found' } });
      subject.next({ data: { type: 'done' } });
      subject.complete();
      return subject;
    }

    const subject = new Subject<MessageEvent>();

    this.executeApprovedActions(conversation, actionIds, sessionCookie, subject).catch((err) => {
      this.logger.error('Action execution error', err);
      subject.next({ data: { type: 'error', message: err.message || 'Internal error' } });
      subject.next({ data: { type: 'done' } });
      subject.complete();
    });

    return subject;
  }

  clearConversation(conversationId: string) {
    this.conversations.delete(conversationId);
  }

  private async processChat(
    conversation: Conversation,
    message: string,
    userName: string | undefined,
    sessionCookie: string,
    subject: Subject<MessageEvent>,
  ) {
    conversation.lastActivity = Date.now();
    conversation.messages.push({ role: 'user', content: message });

    let ragChunks: { source: string; content: string }[] = [];
    try {
      if (this.ragService.isIndexed) {
        ragChunks = await this.ragService.search(message, 5);
      }
    } catch (err) {
      this.logger.warn('RAG search failed, continuing without context', err);
    }

    const systemPrompt = buildSystemPrompt({ ragChunks, userName });
    const messagesWithSystem: OllamaChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversation.messages,
    ];

    const tools = this.toolRegistry.getTools();
    let fullContent = '';

    for await (const chunk of this.ollamaService.chatStream(messagesWithSystem, tools)) {
      if (!chunk.message) continue;

      if (chunk.message.tool_calls?.length) {
        for (const toolCall of chunk.message.tool_calls) {
          const callId = randomUUID();
          const endpoint = this.toolRegistry.getEndpoint(toolCall.function.name);

          conversation.pendingToolCalls.set(callId, {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          });

          subject.next({
            data: {
              type: 'tool-call',
              id: callId,
              name: toolCall.function.name,
              description: endpoint ? `${toolCall.function.name}` : toolCall.function.name,
              parameters: toolCall.function.arguments,
            },
          });
        }
      }

      if (chunk.message.content) {
        fullContent += chunk.message.content;
        subject.next({ data: { type: 'text-delta', content: chunk.message.content } });
      }
    }

    if (fullContent) {
      conversation.messages.push({ role: 'assistant', content: fullContent });
    }

    subject.next({ data: { type: 'done' } });
    subject.complete();
  }

  private async executeApprovedActions(
    conversation: Conversation,
    actionIds: string[],
    sessionCookie: string,
    subject: Subject<MessageEvent>,
  ) {
    conversation.lastActivity = Date.now();

    for (const actionId of actionIds) {
      const toolCall = conversation.pendingToolCalls.get(actionId);
      if (!toolCall) continue;

      const result = await this.toolExecutor.execute(toolCall.name, toolCall.arguments, sessionCookie);
      conversation.pendingToolCalls.delete(actionId);

      subject.next({ data: { type: 'tool-result', id: actionId, result } });

      conversation.messages.push({
        role: 'tool',
        content: JSON.stringify(result),
      });
    }

    const systemPrompt = buildSystemPrompt({ ragChunks: [], userName: undefined });
    const messagesWithSystem: OllamaChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversation.messages,
    ];

    let fullContent = '';
    const tools = this.toolRegistry.getTools();

    for await (const chunk of this.ollamaService.chatStream(messagesWithSystem, tools)) {
      if (!chunk.message) continue;

      if (chunk.message.content) {
        fullContent += chunk.message.content;
        subject.next({ data: { type: 'text-delta', content: chunk.message.content } });
      }

      if (chunk.message.tool_calls?.length) {
        for (const toolCall of chunk.message.tool_calls) {
          const callId = randomUUID();
          conversation.pendingToolCalls.set(callId, {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          });

          subject.next({
            data: {
              type: 'tool-call',
              id: callId,
              name: toolCall.function.name,
              description: toolCall.function.name,
              parameters: toolCall.function.arguments,
            },
          });
        }
      }
    }

    if (fullContent) {
      conversation.messages.push({ role: 'assistant', content: fullContent });
    }

    subject.next({ data: { type: 'done' } });
    subject.complete();
  }

  private getOrCreateConversation(conversationId: string): Conversation {
    let conversation = this.conversations.get(conversationId);
    if (!conversation) {
      conversation = {
        messages: [],
        pendingToolCalls: new Map(),
        lastActivity: Date.now(),
      };
      this.conversations.set(conversationId, conversation);
    }
    return conversation;
  }

  private cleanupConversations() {
    const now = Date.now();
    for (const [id, conv] of this.conversations) {
      if (now - conv.lastActivity > this.conversationTtlMs) {
        this.conversations.delete(id);
      }
    }
  }
}
