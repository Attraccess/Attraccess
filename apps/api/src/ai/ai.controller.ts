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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AiService } from './ai.service';
import { OllamaService } from './ollama.service';
import { RagService } from './rag/rag.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { DualAuthGuard } from '@attraccess/plugins-backend-sdk';

@ApiTags('AI')
@Controller('ai')
@UseGuards(DualAuthGuard)
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly ollamaService: OllamaService,
    private readonly ragService: RagService,
  ) {}

  @Post('chat')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a message to the AI assistant and receive a streaming response' })
  @ApiResponse({ status: 200, description: 'SSE stream of chat events' })
  async chat(@Body() dto: ChatMessageDto, @Req() req: Request, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sessionCookie = req.headers.cookie || '';
    const user = (req as any).user;
    const userName = user?.username || user?.email;

    const { conversationId, stream } = await this.aiService.chat(
      dto.conversationId,
      dto.message,
      userName,
      sessionCookie,
    );

    res.write(`data: ${JSON.stringify({ type: 'conversation-id', conversationId })}\n\n`);

    const subscription = stream.subscribe({
      next: (event) => {
        res.write(`data: ${JSON.stringify(event.data)}\n\n`);
      },
      complete: () => {
        res.end();
      },
      error: (err) => {
        this.logger.error('Stream error', err);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`);
        res.end();
      },
    });

    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Post('chat/:conversationId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve pending tool calls and continue the conversation' })
  @ApiResponse({ status: 200, description: 'SSE stream of continued chat events' })
  async approveActions(
    @Param('conversationId') conversationId: string,
    @Body() body: { actionIds: string[] },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sessionCookie = req.headers.cookie || '';
    const stream = await this.aiService.approveActions(conversationId, body.actionIds, sessionCookie);

    const subscription = stream.subscribe({
      next: (event) => {
        res.write(`data: ${JSON.stringify(event.data)}\n\n`);
      },
      complete: () => {
        res.end();
      },
      error: (err) => {
        this.logger.error('Stream error', err);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`);
        res.end();
      },
    });

    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Get('status')
  @ApiOperation({ summary: 'Get AI feature status' })
  @ApiResponse({ status: 200, description: 'AI status information' })
  async getStatus() {
    const ollamaHealthy = await this.ollamaService.healthCheck();
    return {
      enabled: true,
      ollamaConnected: ollamaHealthy,
      embeddingIndexed: this.ragService.isIndexed,
    };
  }

  @Delete('chat/:conversationId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear a conversation' })
  @ApiResponse({ status: 204, description: 'Conversation cleared' })
  clearConversation(@Param('conversationId') conversationId: string) {
    this.aiService.clearConversation(conversationId);
  }
}
