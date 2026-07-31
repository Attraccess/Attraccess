// Zigbee pairing orchestration (ATT-789).
//
// Pairing spans two systems and takes minutes, so it runs as a background job
// the UI polls rather than as one long HTTP request:
//
//   1. open the gateway for joining      (bridge/request/permit_join)
//   2. make sure the device's Zigbee radio is on   (Zigbee.SetConfig + reboot)
//   3. tell the device to look for a network       (Zigbee.StartNetworkSteering)
//   4. watch bridge/event for a device we did not know before, through to
//      `device_interview: successful`
//   5. rename it to a stable, Attraccess-controlled friendly name so topics do
//      not depend on what the operator does in the z2m UI
//   6. link the IEEE address to the device record and close the join window
//
// Only one pairing runs at a time: permit_join is a property of the whole
// Zigbee network, so two concurrent runs could not tell whose device joined.
//
// ponytail: job state is in-memory and single-process. Attraccess runs one API
// instance; if that ever changes, move this to the DB alongside the device row.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeviceRegistryService } from './device-registry.service';
import { ShellyDeviceApiService, type DeviceCredentials } from './shelly-device-api.service';
import { MAX_PERMIT_JOIN_SECONDS, Z2mGatewayService, type Z2mBridgeEvent } from './z2m-gateway.service';
import type { ShellyDevice } from './shelly-device.entity';

/** Coarse progress, so the UI can narrate what is happening. */
export type PairingStep =
  | 'opening-network'
  | 'enabling-zigbee'
  | 'waiting-for-reboot'
  | 'network-steering'
  | 'waiting-for-join'
  | 'waiting-for-interview'
  | 'linking';

export interface PairingJob {
  deviceId: number;
  status: 'running' | 'succeeded' | 'failed';
  step: PairingStep;
  error: string | null;
  ieeeAddress: string | null;
  friendlyName: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** Raised when a second pairing is started while one is already running. */
export class PairingInProgressError extends Error {
  constructor(deviceId: number) {
    super(`a pairing run for device ${deviceId} is already in progress`);
  }
}

/** How long to wait for the device to reboot after switching the radio on. */
const REBOOT_TIMEOUT_MS = 60_000;
const REBOOT_POLL_INTERVAL_MS = 3_000;
/** Bounded by the gateway's own 254s join window. */
const JOIN_TIMEOUT_MS = MAX_PERMIT_JOIN_SECONDS * 1000;

/**
 * The friendly name we impose on a paired device. Derived from the Attraccess
 * device id so it is stable across renames of the device's display name.
 */
export function friendlyNameFor(deviceId: number): string {
  return `attraccess-shelly-${deviceId}`;
}

@Injectable()
export class ZigbeePairingService {
  private readonly logger = new Logger(ZigbeePairingService.name);
  private readonly jobs = new Map<number, PairingJob>();
  private activeDeviceId: number | null = null;

  constructor(
    @Inject(Z2mGatewayService) private readonly gateway: Z2mGatewayService,
    @Inject(DeviceRegistryService) private readonly registry: DeviceRegistryService,
    @Inject(ShellyDeviceApiService) private readonly deviceApi: ShellyDeviceApiService
  ) {}

  getJob(deviceId: number): PairingJob | null {
    return this.jobs.get(deviceId) ?? null;
  }

  /**
   * Kicks off pairing and returns the initial job immediately. Progress is read
   * back through {@link getJob}.
   */
  start(device: ShellyDevice & { generation: number }, credentials: DeviceCredentials): PairingJob {
    if (this.activeDeviceId !== null) {
      throw new PairingInProgressError(this.activeDeviceId);
    }

    const job: PairingJob = {
      deviceId: device.id,
      status: 'running',
      step: 'opening-network',
      error: null,
      ieeeAddress: null,
      friendlyName: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.jobs.set(device.id, job);
    this.activeDeviceId = device.id;

    void this.run(device, credentials, job)
      .then(() => {
        job.status = 'succeeded';
      })
      .catch((err: unknown) => {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Zigbee pairing for device ${device.id} failed: ${job.error}`);
      })
      .finally(async () => {
        job.finishedAt = new Date().toISOString();
        this.activeDeviceId = null;
        // Always close the join window, including on failure — leaving a Zigbee
        // network open invites unrelated devices to join.
        try {
          await this.gateway.permitJoin(0);
        } catch (err) {
          this.logger.warn(`could not close the join window: ${err instanceof Error ? err.message : String(err)}`);
        }
      });

    return job;
  }

  private async run(
    device: ShellyDevice & { generation: number },
    credentials: DeviceCredentials,
    job: PairingJob
  ): Promise<void> {
    const target = { ipAddress: device.ipAddress, generation: device.generation, ...credentials };

    // Start listening before anything else: a device can join fast enough that
    // the events would otherwise land before the listener is attached.
    const known = new Set(this.gateway.listDevices().map((entry) => entry.ieee_address));
    const joined = this.awaitJoin(known, job);

    // Every step below can throw on an ordinary failure (device offline, auth
    // required, a gateway request timing out). The join wait must be cancelled
    // on the way out, or its watchdog would reject a promise nobody awaits —
    // an unhandled rejection that takes the API process down minutes later.
    try {
      job.step = 'opening-network';
      await this.gateway.permitJoin(MAX_PERMIT_JOIN_SECONDS);

      const status = await this.deviceApi.getZigbeeStatus(target);
      if (!status.enabled) {
        job.step = 'enabling-zigbee';
        const { restartRequired } = await this.deviceApi.enableZigbee(target);
        if (restartRequired) {
          job.step = 'waiting-for-reboot';
          await this.awaitReboot(target);
        }
      }

      job.step = 'network-steering';
      await this.deviceApi.startNetworkSteering(target);

      job.step = 'waiting-for-join';
      const ieeeAddress = await joined.promise;
      job.ieeeAddress = ieeeAddress;

      job.step = 'linking';
      const friendlyName = friendlyNameFor(device.id);
      // Rename by IEEE rather than `{last: true}`: the join we matched is the one
      // we want, and IEEE cannot be raced by an unrelated device joining after it.
      await this.gateway.renameDevice(ieeeAddress, friendlyName);
      await this.registry.linkZigbeeDevice(device.id, { ieeeAddress, friendlyName });
      job.friendlyName = friendlyName;
      // We just changed the inventory, so make sure our copy reflects it instead
      // of waiting for a push that may never arrive.
      await this.gateway.refreshDevices();
    } finally {
      joined.cancel();
    }
  }

  /**
   * Resolves with the IEEE address of the first device that joins and completes
   * its interview, ignoring devices the gateway already knew about.
   *
   * `cancel()` drops the watchdog and the subscription and leaves the promise
   * unsettled — the caller is abandoning it, so it must not reject at anyone.
   */
  private awaitJoin(known: Set<string>, job: PairingJob): { promise: Promise<string>; cancel: () => void } {
    let cancel = () => undefined as void;
    const promise = new Promise<string>((resolve, reject) => {
      let candidate: string | null = null;

      const stop = () => {
        clearTimeout(timer);
        unsubscribe();
      };
      cancel = stop;

      const finish = (err: Error | null, ieeeAddress?: string) => {
        stop();
        if (err) reject(err);
        else resolve(ieeeAddress as string);
      };

      // unref: this is a watchdog, not work — it must never be the reason the
      // process stays alive.
      const timer = setTimeout(
        () => finish(new Error('no device joined the Zigbee network before the join window closed')),
        JOIN_TIMEOUT_MS
      ).unref();

      const unsubscribe = this.gateway.onBridgeEvent((event: Z2mBridgeEvent) => {
        const ieeeAddress = event.data?.ieee_address;
        if (!ieeeAddress || known.has(ieeeAddress)) return;

        if (event.type === 'device_joined' || event.type === 'device_announce') {
          candidate = ieeeAddress;
          job.step = 'waiting-for-interview';
          return;
        }
        if (event.type !== 'device_interview') return;

        // A join event is not guaranteed to precede the interview, so treat the
        // first interviewing device as the candidate if we have none yet.
        candidate ??= ieeeAddress;
        if (ieeeAddress !== candidate) return;

        if (event.data.status === 'started') {
          job.step = 'waiting-for-interview';
        } else if (event.data.status === 'successful') {
          finish(null, ieeeAddress);
        } else if (event.data.status === 'failed') {
          finish(new Error(`zigbee2mqtt could not interview ${ieeeAddress} — retry closer to the coordinator`));
        }
      });
    });
    return { promise, cancel: () => cancel() };
  }

  /** Polls the device until its RPC endpoint answers again after a reboot. */
  private async awaitReboot(target: { ipAddress: string; generation: number } & DeviceCredentials): Promise<void> {
    const deadline = Date.now() + REBOOT_TIMEOUT_MS;
    let lastError: unknown = null;
    while (Date.now() < deadline) {
      await sleep(REBOOT_POLL_INTERVAL_MS);
      try {
        const status = await this.deviceApi.getZigbeeStatus(target);
        if (status.enabled) return;
        lastError = new Error(`device reports Zigbee still disabled (network_state=${status.networkState ?? 'unknown'})`);
      } catch (err) {
        lastError = err;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`device did not come back with Zigbee enabled within ${REBOOT_TIMEOUT_MS / 1000}s: ${reason}`);
  }

  /**
   * Removes a device from the Zigbee network and clears its link. Falls back to
   * a forced removal, because a device that is already unplugged can never
   * acknowledge a leave request and would otherwise be undeletable.
   */
  async unpair(device: ShellyDevice): Promise<void> {
    if (!device.zigbeeIeeeAddress) return;
    try {
      await this.gateway.removeDevice(device.zigbeeIeeeAddress);
    } catch (err) {
      this.logger.warn(
        `graceful z2m removal of ${device.zigbeeIeeeAddress} failed, forcing: ${err instanceof Error ? err.message : String(err)}`
      );
      try {
        await this.gateway.removeDevice(device.zigbeeIeeeAddress, { force: true });
      } catch (forceErr) {
        // The gateway may legitimately not know the device — e.g. it was already
        // removed from the z2m frontend. The goal is "this device is no longer
        // paired", which is then already true, so drop the link either way
        // rather than leaving a record that can never be unpaired.
        this.logger.warn(
          `forced z2m removal of ${device.zigbeeIeeeAddress} failed too, unlinking anyway: ${
            forceErr instanceof Error ? forceErr.message : String(forceErr)
          }`
        );
      }
    }
    await this.registry.unlinkZigbeeDevice(device.id);
    this.jobs.delete(device.id);
    // Same as pairing: re-read rather than trust a push we may not get.
    await this.gateway.refreshDevices().catch(() => undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
