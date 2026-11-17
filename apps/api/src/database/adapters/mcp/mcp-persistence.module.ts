import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpOAuthClient, McpOAuthGrant, McpOAuthToken } from '@attraccess/database-entities';
import { MCP_OAUTH_STORE } from '../../../mcp/mcp-oauth.port';
import { UnitOfWorkModule } from '../unit-of-work.module';
import { TypeOrmMcpOAuthStore } from './typeorm-mcp-oauth.store';

/** MCP OAuth clients, grants and tokens. */
@Module({
  imports: [UnitOfWorkModule, TypeOrmModule.forFeature([McpOAuthClient, McpOAuthGrant, McpOAuthToken])],
  providers: [{ provide: MCP_OAUTH_STORE, useClass: TypeOrmMcpOAuthStore }],
  exports: [MCP_OAUTH_STORE],
})
export class McpPersistenceModule {}
