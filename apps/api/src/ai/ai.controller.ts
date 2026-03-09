import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  Logger,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { UIMessage } from 'ai';
import { AiConfigType } from '../config/ai.config';
import { AiService } from './ai.service';
import { OllamaService } from './ollama.service';
import { RagService } from './rag/rag.service';
import { AiStatusDto } from './dto/ai-status.dto';
import { DualAuthGuard, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

@ApiTags('AI')
@Controller('ai')
@UseGuards(DualAuthGuard)
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly ollamaService: OllamaService,
    private readonly ragService: RagService,
    private readonly configService: ConfigService,
  ) {}

  @Post('chat')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a message to the AI assistant and receive a streaming response' })
  @ApiResponse({ status: 200, description: 'AI SDK data stream' })
  async chat(
    @Body() body: { messages: UIMessage[]; id?: string },
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const sessionCookie = req.headers.cookie || '';
    const userName = req.user?.username || req.user?.email;

    try {
      const { conversationId, result } = await this.aiService.chat(
        body.id,
        body.messages,
        req.user.id,
        userName,
        sessionCookie,
      );

      res.setHeader('X-Conversation-Id', conversationId);
      result.pipeUIMessageStreamToResponse(res, { sendReasoning: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Chat endpoint error: user=${req.user.id} conv=${body.id ?? 'new'} error=${message}`, err instanceof Error ? err.stack : undefined);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  }

  @Get('conversations/active')
  @ApiOperation({ summary: 'Get the active conversation within 24h window' })
  @ApiResponse({ status: 200, description: 'Active conversation with messages, or null' })
  async getActiveConversation(@Req() req: AuthenticatedRequest) {
    return this.aiService.getActiveConversation(req.user.id);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List conversations for the current user' })
  @ApiResponse({ status: 200, description: 'List of conversations' })
  async listConversations(@Req() req: AuthenticatedRequest) {
    return this.aiService.listConversations(req.user.id);
  }

  @Get('conversations/:uuid/messages')
  @ApiOperation({ summary: 'Get messages for a conversation' })
  @ApiResponse({ status: 200, description: 'Conversation messages' })
  async getConversationMessages(
    @Param('uuid') uuid: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const messages = await this.aiService.getConversationMessages(uuid, req.user.id);
    if (!messages) throw new NotFoundException('Conversation not found');
    return messages;
  }

  @Get('status')
  @ApiOperation({ summary: 'Get AI feature status' })
  @ApiResponse({ status: 200, description: 'AI status information', type: AiStatusDto })
  async getStatus(): Promise<AiStatusDto> {
    const ollamaHealthy = await this.ollamaService.healthCheck();
    return {
      enabled: this.configService.get<AiConfigType>('ai')?.enabled ?? false,
      ollamaConnected: ollamaHealthy,
      modelsReady: this.ollamaService.modelsReady,
      modelsPulling: this.ollamaService.modelsPulling,
      pullProgress: this.ollamaService.modelsPulling ? this.ollamaService.pullProgress : undefined,
      embeddingIndexed: this.ragService.isIndexed,
    };
  }

  @Delete('chat/:conversationId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear a conversation' })
  @ApiResponse({ status: 204, description: 'Conversation cleared' })
  async clearConversation(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.aiService.clearConversation(conversationId, req.user.id);
  }
}
