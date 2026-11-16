import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpOAuthClient, McpOAuthGrant, McpOAuthToken, User } from '@attraccess/database-entities';
import { SettingsModule } from '../settings/settings.module';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { McpBearerGuard } from './mcp-bearer.guard';
import { McpConnectionController } from './mcp-connection.controller';
import { McpController } from './mcp.controller';
import { McpOAuthConsentController, McpOAuthController } from './mcp-oauth.controller';
import { McpOAuthService } from './mcp-oauth.service';
import { McpPublicUrls } from './mcp-public-urls.service';
import { McpRestGateway } from './mcp-rest-gateway';
import { McpRateLimitGuard } from './mcp-rate-limit.guard';
import { McpToolRegistry } from './mcp-tool-registry';

@Module({
  imports: [
    TypeOrmModule.forFeature([McpOAuthClient, McpOAuthGrant, McpOAuthToken, User]),
    SettingsModule,
    UsersAndAuthModule,
  ],
  controllers: [McpController, McpOAuthController, McpOAuthConsentController, McpConnectionController],
  providers: [McpToolRegistry, McpPublicUrls, McpOAuthService, McpBearerGuard, McpRateLimitGuard, McpRestGateway],
  exports: [McpToolRegistry],
})
export class McpModule {}
