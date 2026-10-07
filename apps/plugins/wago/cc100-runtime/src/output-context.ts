import { LogicalChannel, PhysicalPoint, Pulse } from './output-types';
import { type DeviceAdapter, type PulseRoute, type RuntimeState, type Snapshot } from './runtime-types';
export abstract class OutputContext {
  protected readonly uncertainWrites = new Set<string>();

  protected readonly pendingCommands = new Map<string, number>();

  protected disconnected = false;

  protected outageGeneration = 0;

  protected readonly pulses = new Map<string, Pulse>();

  protected readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();

  protected readonly channelWrites = new Map<string, Promise<void>>();

  protected readonly feedbackChecks = new Map<string, { timer: ReturnType<typeof setTimeout>; generation: number }>();

  protected readonly feedbackGenerations = new Map<string, number>();

  protected readonly commandOperations = new Set<Promise<void>>();

  protected feedbackGenerationSequence = 0;

  protected configurationGeneration = 0;

  protected replacement?: Promise<void>;

  get busy(): boolean {
    return Boolean(this.commandOperations.size || this.channelWrites.size || this.pulses.size);
  }

  constructor(
    protected readonly options: {
      device: DeviceAdapter;
      getSnapshot: () => Snapshot | undefined;
      getState: () => RuntimeState;
      saveState: () => Promise<void>;
      publishState: () => void;
      publishFault: (channelId: string, error: unknown) => Promise<void>;
      feedbackEnabled?: () => boolean;
    },
  ) {}
  abstract isWriteUncertain(channelId: string): boolean;
  abstract assertConfigurationSafe(next: Snapshot): void;
  abstract replaceConfiguration<T>(commit: () => Promise<T>): Promise<T>;
  abstract runForCommand<T>(channelId: string, operation: () => Promise<T>): Promise<T>;
  abstract runForChannel<T>(channelId: string, operation: () => Promise<T>): Promise<T>;
  abstract write(
    channel: LogicalChannel,
    value: boolean,
    onWritten?: () => void,
    onCommitted?: () => void,
  ): Promise<boolean>;
  abstract writeWhileQueued(
    channel: LogicalChannel,
    value: boolean,
    onWritten?: () => void,
    onCommitted?: () => void,
    admit?: () => void,
    pulseDuration?: number,
    ownership?: 'manual' | 'flow',
  ): Promise<boolean>;
  protected abstract writePointWhileQueued(
    channel: LogicalChannel,
    point: PhysicalPoint,
    value: boolean,
    onWritten?: () => void,
    onCommitted?: () => void,
    configurationGeneration?: number,
    admit?: () => void,
    pulseDuration?: number,
    ownership?: 'manual' | 'flow',
  ): Promise<boolean>;
  abstract isGuardSatisfied(channel: LogicalChannel): Promise<boolean>;
  abstract schedulePulse(channel: LogicalChannel, duration: number, captured?: PulseRoute): void;
  abstract recoverPulses(): void;
  abstract clearPulse(channelId: string): void;
  abstract applyDisconnectPolicies(connected: boolean): Promise<void>;
  abstract applyRuntimeUpdateFailsafe(): Promise<void>;
  protected abstract ignoreRejection(callback: () => Promise<unknown>): void;
  protected abstract completePulse(key: string, pulse: Pulse, attempt: number): void;
  protected abstract writePulseShutdown(pulse: Pulse): Promise<boolean>;
  protected abstract restorePulseRoute(key: string | undefined, previous: PulseRoute[] | undefined): void;
  protected abstract scheduleFeedbackCheck(channel: LogicalChannel, value: boolean): void;
  protected abstract verifyFeedback(
    channel: LogicalChannel,
    value: boolean,
    generation: number,
    configurationGeneration: number,
  ): Promise<void>;
  protected abstract isCurrentFeedback(channelId: string, generation: number, configurationGeneration: number): boolean;
}
