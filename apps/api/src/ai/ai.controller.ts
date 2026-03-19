import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Res,
  HttpCode,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import type { UIMessage } from 'ai';
import { AiService } from './ai.service';
import { OllamaService } from './ollama.service';
import { RagService } from './rag/rag.service';
import { AiStatusDto } from './dto/ai-status.dto';
import { SettingsService } from '../settings/settings.service';
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
    private readonly settingsService: SettingsService,
  ) {}

  @Post('chat')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a message to the AI assistant and receive a streaming response' })
  @ApiResponse({ status: 200, description: 'AI SDK data stream' })
  async chat(
    @Body() body: { messages: UIMessage[] },
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const sessionCookie = req.headers.cookie || '';
    const userName = req.user?.username || req.user?.email;

    try {
      const { result } = await this.aiService.chat(
        body.messages,
        req.user.id,
        userName,
        sessionCookie,
      );

      result.pipeUIMessageStreamToResponse(res, { sendReasoning: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Chat endpoint error: user=${req.user.id} error=${message}`, err instanceof Error ? err.stack : undefined);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  }

  @Get('status')
  @ApiOperation({ summary: 'Get AI feature status' })
  @ApiResponse({ status: 200, description: 'AI status information', type: AiStatusDto })
  async getStatus(): Promise<AiStatusDto> {
    const [aiConfig, ollamaHealthy] = await Promise.all([
      this.settingsService.getAiConfiguration(),
      this.ollamaService.healthCheck(),
    ]);
    return {
      enabled: aiConfig.enabled,
      ollamaConnected: ollamaHealthy,
      modelsReady: this.ollamaService.modelsReady,
      modelsPulling: this.ollamaService.modelsPulling,
      pullProgress: this.ollamaService.modelsPulling ? this.ollamaService.pullProgress : undefined,
      embeddingIndexed: this.ragService.isIndexed,
      chatModel: aiConfig.chatModel,
      embedModel: aiConfig.embedModel,
    };
  }

  @Delete('chat')
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear the current user conversation' })
  @ApiResponse({ status: 204, description: 'Conversation cleared' })
  async clearConversation(
    @Req() req: AuthenticatedRequest,
  ) {
    await this.aiService.clearConversation(req.user.id);
  }
}
