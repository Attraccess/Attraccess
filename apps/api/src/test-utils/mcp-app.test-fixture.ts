import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { User } from '@attraccess/database-entities';
import type { AppConfigType } from '../config/app.config';
import { ApiTokenRequestRateLimitService } from '../users-and-auth/auth/api-token/api-token-request-rate-limit.service';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { SessionService } from '../users-and-auth/auth/session.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { createTestDatabaseEnv } from '../test/test-database-env';

export const MCP_ACCEPT = 'application/json, text/event-stream';

/** The API-token rate limiter needs Valkey, which is not part of this test. Its own spec covers the limit. */
const unlimitedApiTokenRequests = { assertWithinLimit: async () => undefined };

/** Boots the real application (plugins disabled, a private PostgreSQL database that `close()` drops) for MCP integration tests. */
export async function startMcpTestApp(publicUrl: string) {
  const databaseEnv = createTestDatabaseEnv();
  await databaseEnv.setup();
  try {
    return await bootMcpTestApp(publicUrl, databaseEnv);
  } catch (error) {
    await databaseEnv.teardown();
    throw error;
  }
}

async function bootMcpTestApp(publicUrl: string, databaseEnv: ReturnType<typeof createTestDatabaseEnv>) {
  process.env.DISABLE_PLUGINS = 'true';
  process.env.AUTH_SESSION_SECRET ??= 'mcp-integration-session-secret-0123456789';
  // A developer's .env may point at a real Valkey; these tests run without one.
  delete process.env.VALKEY_URL;
  process.env.ATTRACCESS_URL = publicUrl;
  process.env.ATTRACCESS_PUBLIC_INTERNET_URL = publicUrl;
  const { PluginModule } = await import('../plugin-system/plugin.module');
  const { PluginService } = await import('../plugin-system/plugin.service');
  PluginService.configure({ PLUGIN_DIR: '', RESTART_BY_EXIT: false });
  PluginModule.configure({ DISABLE_PLUGINS: true });
  const { AppModule } = await import('../app/app.module');
  const { configureBootstrapApi, configureBootstrapHttp } = await import('../main.bootstrap');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ApiTokenRequestRateLimitService)
    .useValue(unlimitedApiTokenRequests)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error', 'warn'] });
  const appConfig = app.get(ConfigService).get<AppConfigType>('app') as AppConfigType;
  const logger = new Logger('McpTestApp');
  configureBootstrapHttp(app, appConfig, logger);
  configureBootstrapApi(app, appConfig, logger);
  await app.init();
  return new McpTestApp(app, databaseEnv);
}

export class McpTestApp {
  readonly db: DataSource;
  private counter = 0;

  constructor(
    readonly app: NestExpressApplication,
    private readonly databaseEnv: ReturnType<typeof createTestDatabaseEnv>,
  ) {
    this.db = app.get(DataSource);
  }

  get http() {
    return request(this.app.getHttpServer());
  }

  /** A user whose role holds exactly `permissions`. */
  async createUser(permissions: string[]): Promise<User> {
    const n = (this.counter += 1);
    const user = await this.db.getRepository(User).save({
      username: `mcp-user-${n}`,
      email: `mcp-user-${n}@example.invalid`,
      isEmailVerified: true,
      locale: 'en',
    });
    const rbac = this.app.get(RbacService);
    const granted = new Set(permissions);
    const role = await rbac.createRole({ name: `MCP test role ${n}`, permissionKeys: permissions }, granted, {
      actor: { id: null, authenticationMethod: null },
    });
    await rbac.assignRole(user.id, role.id, granted);
    return Object.assign(user, { roleId: role.id });
  }

  async revokeRole(userId: number, roleId: number, actorPermissions: string[]) {
    await this.app.get(RbacService).revokeRole(userId, roleId, new Set(actorPermissions));
  }

  async createApiToken(userId: number, permissionKeys: string[]): Promise<string> {
    const { token } = await this.app.get(ApiTokenService).create(userId, { name: 'MCP test token', permissionKeys });
    return token;
  }

  async createSessionToken(user: User): Promise<string> {
    return this.app.get(SessionService).createSession(user);
  }

  /** One JSON-RPC request to the MCP endpoint. */
  rpc(
    bearer: string | undefined,
    method: string,
    params?: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    const call = this.http
      .post('/api/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .set(headers);
    if (bearer) call.set('Authorization', `Bearer ${bearer}`);
    return call.send({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) });
  }

  callTool(bearer: string, name: string, args: Record<string, unknown> = {}) {
    return this.rpc(bearer, 'tools/call', { name, arguments: args });
  }

  async close() {
    await this.app.close();
    await this.databaseEnv.teardown();
  }
}
