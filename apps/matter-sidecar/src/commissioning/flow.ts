import { Bytes, EndpointNumber } from '@matter/main';
import { OperationalCredentials } from '@matter/main/clusters';
import {
  CommissioningError,
  ControllerCommissioningFlow,
  Read,
  type CommissioningOptions,
} from '@matter/main/protocol';

export type ProgressStep =
  'discovering' | 'pase' | 'reading_device' | 'attestation' | 'adding_fabric' | 'network_setup' | 'case';

/** The device already belongs to the Attraccess fabric; commissioning stops before anything is changed. */
export class AlreadyCommissionedError extends CommissioningError {
  constructor(readonly existingNodeId: string) {
    super('The device is already a member of the Attraccess fabric.');
  }
}

/** The session was cancelled; thrown between two steps, so the device's failsafe rolls the partial commissioning back. */
export class CommissioningCancelledError extends CommissioningError {
  constructor() {
    super('Commissioning was cancelled.');
  }
}

export type FlowHooks = {
  /** PASE is established and the commissioning flow starts. */
  onPaseEstablished(): void;
  /** A step of the flow starts; `step` is the session step it belongs to. */
  onStep(step: ProgressStep): void;
  /** The attestation step finished without an error finding. */
  onAttestationPassed(): void;
};

/** Maps a step of the matter.js commissioning flow to the session step the plugin shows. */
export function sessionStepOf(name: string): ProgressStep {
  if (name === 'OperationalCredentials.DeviceAttestation') return 'attestation';
  if (name === 'OperationalCredentials.Certificates' || name === 'AccessControl') return 'adding_fabric';
  if (name.startsWith('NetworkCommissioning.')) return 'network_setup';
  if (
    name === 'Reconnect' ||
    name === 'GeneralCommissioning.Complete' ||
    name.startsWith('OperationalCredentials.Update')
  ) {
    return 'case';
  }
  if (name.startsWith('AdditionalLogic.')) return 'case';
  return 'reading_device';
}

type FabricEntry = { rootPublicKey?: Uint8Array; fabricId?: bigint; nodeId?: bigint };

const sameBytes = (a: Uint8Array | undefined, b: Uint8Array): boolean =>
  a !== undefined && a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * A commissioning flow that reports its steps and refuses a device that is already in our fabric before it changes
 * anything: after PASE and before the failsafe is armed (so before AddNOC) it reads `OperationalCredentials.Fabrics`
 * unfiltered and compares each entry with this fabric's root public key and fabric ID.
 */
export function createCommissioningFlow(hooks: FlowHooks): NonNullable<CommissioningOptions['commissioningFlowImpl']> {
  return class AttraccessCommissioningFlow extends ControllerCommissioningFlow {
    constructor(...args: ConstructorParameters<typeof ControllerCommissioningFlow>) {
      super(...args);
      hooks.onPaseEstablished();
      for (const step of this.commissioningSteps) {
        const logic = step.stepLogic;
        const session = sessionStepOf(step.name);
        step.stepLogic = async () => {
          hooks.onStep(session);
          const result = await logic();
          if (session === 'attestation') hooks.onAttestationPassed();
          return result;
        };
      }
      this.commissioningSteps.push({
        stepNumber: 0,
        subStepNumber: 2,
        name: 'Attraccess.DuplicateCheck',
        stepLogic: async () => {
          hooks.onStep('reading_device');
          await this.#refuseDuplicate();
          return { code: 0, breadcrumb: this.lastBreadcrumb };
        },
      });
    }

    async #refuseDuplicate() {
      const request = Read(
        { fabricFilter: false },
        Read.Attribute({ endpoint: EndpointNumber(0), cluster: OperationalCredentials, attributes: ['fabrics'] }),
      );
      const rootPublicKey = Bytes.of(this.fabric.rootPublicKey);
      for await (const chunk of this.interaction.read(request)) {
        for await (const entry of chunk) {
          if (entry.kind !== 'attr-value' || !Array.isArray(entry.value)) continue;
          for (const fabric of entry.value as FabricEntry[]) {
            if (sameBytes(fabric.rootPublicKey, rootPublicKey) && fabric.fabricId === BigInt(this.fabric.fabricId)) {
              throw new AlreadyCommissionedError(String(fabric.nodeId ?? ''));
            }
          }
        }
      }
    }
  };
}
