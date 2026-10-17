import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
import type { WagoCommissioningSession } from '../sessions/session.record';
import type { WagoController } from '../../controllers/record';
import type { WagoEnrollment } from '../../controllers/enrollment.record';
import type { WagoConfigurationRevision } from '../../configuration/revision.record';

export abstract class WagoCommissioningPersistence {
  abstract session(id: number): Promise<WagoCommissioningSession | null>;
  abstract claimSession(
    hardwareId: string,
    mqttServerId: number,
    enrollmentId: number,
  ): Promise<WagoCommissioningSession | null>;
  abstract recentSessions(offset: number, limit: number): Promise<WagoCommissioningSession[]>;
  abstract hardwareSessions(hardwareId: string, newestFirst?: boolean): Promise<WagoCommissioningSession[]>;
  abstract hardwareSessionPage(hardwareId: string, offset: number): Promise<WagoCommissioningSession[]>;
  abstract recoveryPage(offset: number, completedOnly?: boolean): Promise<WagoCommissioningSession[]>;
  abstract saveSession(input: Partial<WagoCommissioningSession>): Promise<WagoCommissioningSession>;
  abstract updateSession(id: number, input: Partial<WagoCommissioningSession>): Promise<void>;
  abstract removeSession(id: number): Promise<void>;
  abstract controller(id: number, claimedOnly?: boolean): Promise<WagoController | null>;
  abstract controllerByHardware(
    hardwareId: string,
    mqttServerId?: number,
    enrollmentId?: number,
  ): Promise<WagoController | null>;
  abstract enrollment(id: number): Promise<WagoEnrollment | null>;
  abstract latestRevision(controllerId: number): Promise<WagoConfigurationRevision | null>;
}
export const WAGO_COMMISSIONING = pluginOperationToken<WagoCommissioningPersistence>('wago commissioning history', [
  'session',
  'claimSession',
  'recentSessions',
  'hardwareSessions',
  'hardwareSessionPage',
  'recoveryPage',
  'saveSession',
  'updateSession',
  'removeSession',
  'controller',
  'controllerByHardware',
  'enrollment',
  'latestRevision',
]);
