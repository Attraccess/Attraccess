import { RuntimeModbusOutputPolling } from './runtime-modbus-output-polling';

export abstract class RuntimeStatePublication extends RuntimeModbusOutputPolling {
  protected async readAndPublishState(force: boolean): Promise<void> {
    const accepted = this.state.accepted;
    for (const [id, sample] of this.modbusOutputSamples)
      if (sample.revision !== accepted?.revision) this.modbusOutputSamples.delete(id);
    const inputs: Record<string, boolean> = Object.create(null);
    const outputs: Record<string, boolean> = Object.create(null);
    const commandedOutputs: Record<string, boolean> = Object.create(null);
    const errors = accepted ? [...(this.options.device.validate?.(accepted.snapshot) ?? [])] : [];
    const supported = errors.length === 0;
    try {
      await this.options.device.checkAvailability?.();
    } catch (error) {
      errors.push({
        path: 'hardware',
        code: 'hardware_unavailable',
        message: `Check firmware profile, DIN/DOUT mounts and runtime UID permissions: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    if (accepted && supported && !this.runtimeUpdateRequired && !this.runtimeFailsafePending) {
      for (const channel of accepted.snapshot.logicalChannels) {
        const output = channel.capabilities.includes('output');
        if (!output && !channel.capabilities.includes('input')) continue;
        if (output && typeof this.state.outputs[channel.id] === 'boolean')
          commandedOutputs[channel.id] = this.state.outputs[channel.id];
        const point = accepted.snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
        if (!point) continue;
        if (point.modbus) {
          const sample = this.modbusOutputSamples.get(channel.id);
          const device = accepted.snapshot.modbus?.devices.find((item) => item.id === point.modbus?.deviceId);
          const maxAge = (device?.pollIntervalMs ?? 5000) * 2;
          if (sample?.revision === accepted.revision) {
            if (sample.error) errors.push({ path: channel.id, code: 'modbus_read_failed', message: sample.error });
            else if (
              Date.now() - sample.acquiredAt <= maxAge &&
              sample.commanded === this.state.outputs[channel.id] &&
              typeof sample.value === 'boolean'
            )
              outputs[channel.id] = sample.value;
          }
          continue;
        }
        try {
          const value = await this.options.device.read(point);
          if (typeof value !== 'boolean') throw new Error('digital state requires a boolean value');
          (output ? outputs : inputs)[channel.id] = !output && channel.invert ? !value : value;
        } catch (error) {
          errors.push({
            path: channel.id,
            code: point.modbus ? 'modbus_read_failed' : 'digital_read_failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    // A read started on an old configuration must never populate the new revision.
    if (accepted !== this.state.accepted) return;
    const payload = {
      connected: this.connected,
      revision: accepted?.revision ?? null,
      contentHash: accepted?.contentHash ?? null,
      inputs,
      outputs,
      commandedOutputs,
      manualOutputChannelIds: (this.state.manualOutputChannelIds ?? []).filter((id) =>
        accepted?.snapshot.logicalChannels.some(
          (channel) => channel.id === id && channel.capabilities.includes('output'),
        ),
      ),
      readiness: {
        ...(this.runtimeUpdateRequired || this.runtimeFailsafePending ? { runtimeUpdate: true } : {}),
        configurationAccepted: Boolean(accepted),
        hardwareAvailable: !errors.some((error) => error.code !== 'modbus_read_failed'),
        // A peripheral bus fault remains a channel diagnostic, not a failure
        // of the controller/runtime proof used for commissioning and updates.
        ready:
          !this.runtimeUpdateRequired &&
          !this.runtimeFailsafePending &&
          Boolean(accepted) &&
          !errors.some((error) => error.code !== 'modbus_read_failed') &&
          this.connected,
        errors,
      },
    };
    this.options.onReadiness?.({ connected: this.connected, ...payload.readiness });
    const signature = JSON.stringify(payload);
    if (!force && signature === this.lastPublishedState) return;
    for (const error of errors) {
      if (error.code === 'digital_read_failed' || error.code === 'modbus_read_failed')
        void this.publishFault(error.path, { code: error.code, message: error.message }).catch(() => undefined);
    }
    await this.publishOperational('state', payload, { retain: true }, () => accepted === this.state.accepted);
    if (accepted === this.state.accepted) this.lastPublishedState = signature;
  }

  protected requestStatePublication(): void {
    if (this.statePublication) {
      this.stateRefreshRequested = true;
      this.forceStateRefresh = true;
      return;
    }
    void this.publishState().catch(() => undefined);
  }

  protected publishState(force = true): Promise<void> {
    this.stateRefreshRequested = true;
    this.forceStateRefresh ||= force;
    if (!this.statePublication) {
      this.statePublication = Promise.resolve()
        .then(async () => {
          while (this.stateRefreshRequested) {
            const refreshForced = this.forceStateRefresh;
            this.stateRefreshRequested = false;
            this.forceStateRefresh = false;
            await this.readAndPublishState(refreshForced);
          }
        })
        .finally(() => {
          this.statePublication = undefined;
          if (this.stateRefreshRequested) this.requestStatePublication();
        });
    }
    return this.statePublication;
  }
}
