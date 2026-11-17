import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionAuth } from '@attraccess/plugins-backend-sdk';
import type { Request } from 'express';
import { McpConnectionInfoDto } from './mcp-oauth.dto';
import { McpPublicUrls } from './mcp-public-urls.service';
import { McpRateLimit, McpRateLimitGuard } from './mcp-rate-limit.guard';

/** What the account page shows signed-in users about connecting an AI client to this deployment. */
@ApiTags('MCP')
@Controller('mcp/connection')
@UseGuards(McpRateLimitGuard)
export class McpConnectionController {
  constructor(private readonly urls: McpPublicUrls) {}

  @SessionAuth()
  @Get()
  @McpRateLimit('consent')
  @ApiOperation({ summary: 'How to connect an MCP client to this server', operationId: 'getMcpConnectionInfo' })
  @ApiOkResponse({ type: McpConnectionInfoDto })
  async describe(@Req() req: Request): Promise<McpConnectionInfoDto> {
    const endpoints = await this.urls.resolve(req);
    return { url: endpoints.resource, oauthEnabled: endpoints.oauthEnabled };
  }
}
