import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoControllerSummary } from './wago.service.wago-controller-summary';
import { WagoServiceRefreshNetworkConnectionContract } from './wago.service.wago-service-refresh-network-connection-contract';


export abstract class WagoServiceConnectivityContract extends WagoServiceRefreshNetworkConnectionContract {
  protected abstract connectivity(controller: WagoController): WagoControllerSummary['connectivity'];
  protected abstract appliedRevision(controllerId: number): Promise<WagoConfigurationRevision | null>;
  protected abstract matchesVerifier(controller: WagoController, verifier: string): boolean;
  protected abstract validEnrollment(
    secret: string,
    serverId: number,
    hardwareId: string,
  ): Promise<WagoEnrollment | null>;
  protected abstract activeEnrollment(id: number | null): Promise<WagoEnrollment | null>;
  protected abstract activeEnrollments(): Promise<WagoEnrollment[]>;
  protected abstract isActiveEnrollment(enrollment: WagoEnrollment): boolean;
  protected abstract scheduleEnrollmentExpiry(enrollment: WagoEnrollment, delay?: number): void;
  protected abstract revokeEnrollment(enrollment: WagoEnrollment, assertOwned?: () => Promise<void>): Promise<void>;
  protected abstract clearClaimAcknowledgement(enrollmentId: number): void;
  protected abstract withClaimLock<T>(id: number, operation: () => Promise<T>): Promise<T>;
  protected abstract withClaimConfigurationLock<T>(operation: () => Promise<T>): Promise<T>;
  protected abstract claimedController(id: number): Promise<WagoController>;
  protected abstract withConfigurationLock<T>(id: number, operation: () => Promise<T>): Promise<T>;
  protected abstract scheduleSubscriptionRetry(): void;
}
