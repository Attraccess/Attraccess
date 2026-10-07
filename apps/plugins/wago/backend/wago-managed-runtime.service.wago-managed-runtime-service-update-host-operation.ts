import { createHash } from 'node:crypto';
import { managedHostHelper } from './wago-managed-helper';
import { MANAGED_HELPER_PROTOCOL, signInstaller } from './wago-managed-installer';
import { RuntimeUpdateError, type ManagedRuntimeUpdateHost } from './wago-runtime-update';
import { WagoManagedRuntimeServiceUpdateStoreOperation } from './wago-managed-runtime.wago-managed-runtime-service-update-store-operation';
export abstract class WagoManagedRuntimeServiceUpdateHostOperation extends WagoManagedRuntimeServiceUpdateStoreOperation {
  protected updateHost(): ManagedRuntimeUpdateHost {
    const command = async (id: number, action: string, token: string, signal: AbortSignal, extra = '') =>
      this.connection(await this.required(id), `${action} ${token}${extra ? ` ${extra}` : ''}`, signal);
    return {
      inspect: async (id, signal) => {
        const access = await this.required(id);
        const controller = await this.controllers.findOneBy({ id, trustState: 'claimed' });
        const output = await this.connection(access, `inspect ${access.token}`, signal);
        const match = new RegExp(
          `^${MANAGED_HELPER_PROTOCOL}\\n([a-f0-9]{64})\\n(sha256:[a-f0-9]{64}) (true|false)\\n$`,
        ).exec(output);
        if (!match) throw new RuntimeUpdateError('incompatible');
        return {
          imageId: match[2],
          runtimeVersion: this.heartbeats.get(id)?.runtimeVersion ?? controller?.runtimeVersion,
          claimed: !!controller,
          managed: true,
          compatible: true,
          online: match[3] === 'true',
        };
      },
      prepare: async (id, desired, signal) => {
        const access = await this.required(id);
        const inspect = async () => {
          const output = await this.connection(access, `inspect ${access.token}`, signal);
          return new RegExp(
            `^${MANAGED_HELPER_PROTOCOL}\\n([a-f0-9]{64})\\n(sha256:[a-f0-9]{64}) (true|false)\\n$`,
          ).exec(output);
        };
        let match = await inspect();
        if (!match) throw new RuntimeUpdateError('incompatible');
        const helper = managedHostHelper(desired);
        const digest = createHash('sha256').update(helper).digest('hex');
        if (match[1] !== digest) {
          const signature = signInstaller(this.credentials(access).installerPrivateKey, access.token, helper);
          if (
            (await this.connection(
              access,
              `installer-publish ${access.token} ${digest} ${Buffer.byteLength(helper)} ${signature}`,
              signal,
              Buffer.from(helper),
            )) !== 'OK\n'
          )
            throw new RuntimeUpdateError('incompatible');
          match = await inspect();
        }
        if (match?.[1] !== digest) throw new RuntimeUpdateError('incompatible');
      },
      stage: async (id, token, desired, signal) => {
        const bundle = await this.artifacts.acquire(desired.digest);
        try {
          await this.connection(
            await this.required(id),
            `stage ${token} ${desired.digest} ${desired.bytes} ${desired.imageId} ${desired.image}`,
            signal,
            bundle.path,
          );
        } catch (error) {
          throw error instanceof RuntimeUpdateError ? error : new RuntimeUpdateError('transfer');
        } finally {
          await bundle.cleanup();
        }
      },
      activate: async (id, token, artifact, signal) => {
        const heartbeat = this.heartbeats.get(id);
        // Managed SSH and the token-owned staged journal prove which container
        // is being replaced. A stalled runtime must not need MQTT to repair it.
        this.runtimeActivations.set(token, {
          imageId: artifact.imageId,
          startedAt: Date.now(),
          previousStreamId: heartbeat?.streamId,
        });
        this.verifyingControllers.add(id);
        await command(id, 'activate', token, signal);
      },
      verify: async (id, _token, imageId, since, signal) => {
        const controller = await this.controllers.findOneByOrFail({ id, trustState: 'claimed' });
        if (!controller.mqttServerId) throw new RuntimeUpdateError('offline');
        const prefix = (await this.wago.getSettings()).operationalPrefix;
        const activation = _token === null ? undefined : this.runtimeActivations.get(_token);
        const freshSince = Math.max(since, activation?.startedAt ?? since);
        for (let attempt = 0; attempt < 120; attempt++) {
          signal.throwIfAborted();
          const heartbeat = this.heartbeats.get(id);
          const state = this.readiness.observe(controller.mqttServerId, controller.hardwareId, prefix);
          if (
            heartbeat?.imageId === imageId &&
            (_token === null ||
              (activation?.imageId === imageId && heartbeat.streamId !== activation.previousStreamId)) &&
            heartbeat.timestamp > freshSince &&
            heartbeat.receivedAt > freshSince &&
            Date.now() - heartbeat.receivedAt < 90_000 &&
            state?.timestamp > freshSince &&
            Date.now() - state.timestamp < 90_000 &&
            state.streamId === heartbeat.streamId &&
            state.ready
          )
            return { imageId, observedAt: heartbeat.receivedAt, permanent: true, ready: true };
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new RuntimeUpdateError('readiness');
      },
      accept: async (id, token, signal) => {
        await command(id, 'accept', token, signal);
      },
      acknowledge: async (id, token, signal) => {
        try {
          await command(id, 'acknowledge', token, signal);
        } finally {
          this.runtimeActivations.delete(token);
          this.verifyingControllers.delete(id);
        }
      },
      recover: async (id, token, previous, signal) => {
        try {
          await command(id, 'recover', token, signal, previous);
        } finally {
          this.runtimeActivations.delete(token);
          this.verifyingControllers.delete(id);
        }
      },
    };
  }
}
