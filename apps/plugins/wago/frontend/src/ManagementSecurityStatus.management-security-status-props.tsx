import type {
  ManagementException,
  ManagementMode,
  ManagementPublicStatus,
  SessionCredential,
} from '../../backend/wago-management.types';

/** Coordinator supplies authenticated API callbacks. Credentials live only in the form/request;
 * this component never caches them, accepts scripts, or makes readiness depend on WBM setup.
 */
export interface ManagementSecurityStatusProps {
  controllerId: number;
  status: ManagementPublicStatus | null;
  onInspect(credential: SessionCredential): Promise<ManagementPublicStatus>;
  onReview(input: { mode: ManagementMode; exceptions: ManagementException[] }): Promise<ManagementPublicStatus>;
  onApply(input: {
    reviewToken: string;
    confirm: true;
    temporarySsh: SessionCredential;
  }): Promise<ManagementPublicStatus>;
  onRecover(input: { confirm: true; temporarySsh: SessionCredential }): Promise<ManagementPublicStatus>;
}
