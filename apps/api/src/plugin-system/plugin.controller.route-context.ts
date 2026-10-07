import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { InstalledNpmPlugin, NpmPluginAuditState, NpmPluginService } from './npm-plugin.service';
import { PluginService } from './plugin.service';

export const PLUGIN_SYSTEM_INSTANCE_ID = randomUUID();

export abstract class PluginControllerRouteContext {
  protected abstract readonly npmPluginService: NpmPluginService;
  protected abstract record(
    req: AuthenticatedRequest,
    action: string,
    subjectId: number,
    subjectType: string,
    details: Record<string, string | number>,
    outcome?: 'succeeded' | 'failed',
    operationId?: string,
  ): Promise<void>;
  protected abstract recordPackage(
    req: AuthenticatedRequest,
    action: string,
    installed: InstalledNpmPlugin,
  ): Promise<void>;
  protected abstract readonly pluginService: PluginService;
  protected abstract installWithAudit(
    req: AuthenticatedRequest | undefined,
    action: string,
    packageName: string,
    requestedSpec: string,
    operation: (state: NpmPluginAuditState) => Promise<InstalledNpmPlugin>,
    before?: InstalledNpmPlugin,
  ): Promise<InstalledNpmPlugin>;
  protected abstract readonly logger: Logger;
  protected abstract lifecycleDetails(state: NpmPluginAuditState): Record<string, string | number>;
  protected abstract readonly audit: AuditService;
}
