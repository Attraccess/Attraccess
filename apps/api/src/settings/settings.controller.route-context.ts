import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { PreviousAuditSettings } from '../audit/audit-administration-policy';
import { MetricsSettingsDto } from './dto/metrics-settings.dto';
import { SettingsService } from './settings.service';

export abstract class SettingsControllerRouteContext {
  protected abstract buildMetricsSettings(): Promise<MetricsSettingsDto>;
  protected abstract readonly settingsService: SettingsService;
  protected abstract recordChanges(
    req: AuthenticatedRequest,
    prefix: string,
    before: object,
    after: object,
    previousAuditSettings?: PreviousAuditSettings,
  ): Promise<void>;
  protected abstract recordKey(req: AuthenticatedRequest, action: string, configured: number): Promise<void>;
}
