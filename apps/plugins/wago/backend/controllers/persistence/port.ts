import { pluginOperationToken } from '@attraccess/plugins-backend-sdk/v2';
import type { WagoController } from '../record';
import type { WagoEnrollment } from '../enrollment.record';
import type { WagoSettings } from '../settings.record';

export abstract class WagoControllerPersistence {
  abstract controller(id: number): Promise<WagoController | null>;
  abstract controllerByHardware(hardwareId: string): Promise<WagoController | null>;
  abstract controllers(order?: 'hardwareId', claimedOnly?: boolean): Promise<WagoController[]>;
  abstract commandControllers(id?: number): Promise<WagoController[]>;
  abstract saveController(input: Partial<WagoController>): Promise<WagoController>;
  abstract removeController(id: number): Promise<void>;
  abstract enrollment(id: number): Promise<WagoEnrollment | null>;
  abstract enrollmentBySecret(
    secretHash: string,
    mqttServerId: number,
    hardwareId: string,
  ): Promise<WagoEnrollment | null>;
  abstract unconsumedEnrollments(): Promise<WagoEnrollment[]>;
  abstract activeEnrollments(now: string): Promise<WagoEnrollment[]>;
  abstract saveEnrollment(input: Partial<WagoEnrollment>): Promise<WagoEnrollment>;
  abstract removeEnrollment(id: number): Promise<void>;
  abstract settings(): Promise<WagoSettings | null>;
  abstract initializeSettings(input: WagoSettings): Promise<WagoSettings>;
  abstract saveSettings(input: WagoSettings): Promise<void>;
}
export const WAGO_CONTROLLERS = pluginOperationToken<WagoControllerPersistence>('wago controller registry', [
  'controller',
  'commandControllers',
  'controllerByHardware',
  'controllers',
  'saveController',
  'removeController',
  'enrollment',
  'enrollmentBySecret',
  'unconsumedEnrollments',
  'activeEnrollments',
  'saveEnrollment',
  'removeEnrollment',
  'settings',
  'initializeSettings',
  'saveSettings',
]);
