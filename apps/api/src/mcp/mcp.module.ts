import { Module } from '@nestjs/common';
import { McpPersistenceModule } from '../database/adapters/mcp/mcp-persistence.module';
import { SessionsPersistenceModule } from '../database/adapters/sessions/sessions-persistence.module';
import { NetworkRestrictionModule } from '../network-restriction/network-restriction.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { McpBearerGuard } from './mcp-bearer.guard';
import { McpConnectionController } from './mcp-connection.controller';
import { McpController } from './mcp.controller';
import { McpOAuthConsentController, McpOAuthController } from './mcp-oauth.controller';
import { McpOAuthGrantsController } from './mcp-oauth-grants.controller';
import { McpOAuthGrantsService } from './mcp-oauth-grants.service';
import { McpOAuthService } from './mcp-oauth.service';
import { McpPublicUrls } from './mcp-public-urls.service';
import { McpRestGateway } from './mcp-rest-gateway';
import { McpRateLimitGuard } from './mcp-rate-limit.guard';
import { McpToolRegistry } from './mcp-tool-registry';

@Module({
  imports: [
    McpPersistenceModule,
    SessionsPersistenceModule,
    SettingsModule,
    UsersAndAuthModule,
    NetworkRestrictionModule,
  ],
  controllers: [
    McpController,
    McpOAuthController,
    McpOAuthConsentController,
    McpOAuthGrantsController,
    McpConnectionController,
  ],
  providers: [
    McpToolRegistry,
    McpPublicUrls,
    McpOAuthService,
    McpOAuthGrantsService,
    McpBearerGuard,
    McpRateLimitGuard,
    McpRestGateway,
  ],
  exports: [McpToolRegistry],
})
export class McpModule {}
