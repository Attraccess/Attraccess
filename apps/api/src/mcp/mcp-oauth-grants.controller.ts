import { Controller, Delete, Get, HttpCode, Param, Req, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, SessionAuth } from '@attraccess/plugins-backend-sdk';
import { translateOAuthError } from './mcp-oauth.controller';
import { McpOAuthGrantDto } from './mcp-oauth.dto';
import { McpOAuthGrantsService } from './mcp-oauth-grants.service';
import { McpRateLimit, McpRateLimitGuard } from './mcp-rate-limit.guard';

/** The signed-in user's connected MCP clients. Session only: neither an API token nor an MCP token manages grants. */
@ApiTags('MCP OAuth')
@Controller('mcp/oauth/grants')
@UseGuards(McpRateLimitGuard)
export class McpOAuthGrantsController {
  constructor(private readonly grants: McpOAuthGrantsService) {}

  @SessionAuth()
  @Get()
  @McpRateLimit('consent')
  @ApiOperation({ summary: 'List the MCP clients you have connected', operationId: 'listMcpOAuthGrants' })
  @ApiOkResponse({ type: [McpOAuthGrantDto] })
  list(@Req() req: AuthenticatedRequest): Promise<McpOAuthGrantDto[]> {
    return this.grants.list(req.user.id);
  }

  @SessionAuth()
  @Delete(':grantId')
  @HttpCode(204)
  @McpRateLimit('consent')
  @ApiOperation({ summary: 'Revoke an MCP client, with its tokens', operationId: 'revokeMcpOAuthGrant' })
  @ApiNoContentResponse({ description: 'The grant and its tokens are gone.' })
  @ApiNotFoundResponse({ description: 'No such grant of yours.' })
  async revoke(@Req() req: AuthenticatedRequest, @Param('grantId') grantId: string): Promise<void> {
    await translateOAuthError(() => this.grants.revoke(req.user.id, grantId));
  }
}
