import { supportsOutputAction } from '../../../channel-behavior';
import { RuntimeConfiguration } from './configuration';
import { WriteAdmissionError } from './types';

export abstract class RuntimeCommands extends RuntimeConfiguration {
  async receiveCommand(payload: Buffer): Promise<void> {
    let command: {
      id: string;
      expiresAt?: unknown;
      channelId: string;
      action: 'set' | 'pulse' | 'release';
      source?: 'manual';
      value?: boolean;
      expectedConfigurationRevision?: unknown;
    };
    try {
      command = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    if (
      typeof command?.id !== 'string' ||
      !command.id ||
      !command.channelId ||
      !['set', 'pulse', 'release'].includes(command.action)
    )
      return;
    if (
      (command.source !== undefined && command.source !== 'manual') ||
      (command.action === 'release' && command.source !== 'manual')
    )
      return this.acknowledge(command.id, 'rejected', 'invalid command source', 'invalid_command');
    if (command.action === 'set' && typeof command.value !== 'boolean')
      return this.acknowledge(command.id, 'rejected', 'set commands require a boolean value', 'invalid_command');
    const expiresAt = command.expiresAt;
    if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())
      return this.acknowledge(command.id, 'rejected', 'command has expired', 'expired');
    const expectedConfigurationRevision = command.expectedConfigurationRevision;
    if (
      typeof expectedConfigurationRevision !== 'number' ||
      !Number.isSafeInteger(expectedConfigurationRevision) ||
      expectedConfigurationRevision <= 0
    )
      return this.acknowledge(command.id, 'rejected', 'command requires a configuration revision', 'invalid_command');
    if (this.configurationPending)
      return this.acknowledge(command.id, 'rejected', 'configuration persistence is in progress', 'configuration_busy');
    if (this.runtimeUpdateRequired || this.runtimeFailsafePending)
      return this.acknowledge(
        command.id,
        'rejected',
        'Runtime update required; outputs are held in failsafe',
        'runtime_update',
      );
    this.pruneCommandExpiries();
    if (this.state.commandIds.includes(command.id) || this.state.commandExpiries?.[command.id])
      return this.acknowledge(command.id, 'duplicate');
    if (this.inFlightCommandIds.has(command.id)) return this.acknowledge(command.id, 'duplicate');
    this.inFlightCommandIds.add(command.id);
    try {
      if (this.state.accepted?.revision !== expectedConfigurationRevision)
        return this.acknowledge(command.id, 'rejected', 'controller configuration revision is stale', 'stale_revision');
      if (this.state.accepted && this.options.device.validate?.(this.state.accepted.snapshot).length)
        return this.acknowledge(
          command.id,
          'rejected',
          'stored configuration is unsupported by this hardware profile; publish a corrected configuration',
          'unsupported_point',
        );
      const channel = this.state.accepted?.snapshot.logicalChannels.find((item) => item.id === command.channelId);
      if (!channel || !channel.capabilities.includes('output'))
        return this.acknowledge(command.id, 'rejected', 'unknown output channel', 'unknown_channel');
      if (command.action !== 'release' && !supportsOutputAction(channel, command.action))
        return this.acknowledge(
          command.id,
          'rejected',
          'command does not match the configured output behavior',
          'unsupported_operation',
        );

      // Keep the reservation through an unexpected exit after the physical write.
      // Unknown legacy expiries cannot safely be evicted; known IDs are pruned at expiry.
      this.state.commandIds = [...this.state.commandIds, command.id];
      this.state.commandExpiries = { ...this.state.commandExpiries, [command.id]: expiresAt };
      await this.saveState();
      const failure = await this.outputs.runForCommand(channel.id, async () => {
        if (this.runtimeUpdateRequired || this.runtimeFailsafePending) {
          await this.releaseCommand(command.id);
          return { error: 'Runtime update required; outputs are held in failsafe', code: 'runtime_update' };
        }
        const currentChannel = this.state.accepted?.snapshot.logicalChannels.find(
          (item) => item.id === command.channelId,
        );
        if (
          this.state.accepted?.revision !== expectedConfigurationRevision ||
          !currentChannel?.capabilities.includes('output')
        ) {
          await this.releaseCommand(command.id);
          return { error: 'controller configuration revision is stale', code: 'stale_revision' };
        }
        if (Date.parse(expiresAt) <= Date.now()) {
          await this.releaseCommand(command.id);
          return { error: 'command has expired', code: 'expired' };
        }
        if (command.action === 'release') {
          this.state.manualOutputChannelIds = (this.state.manualOutputChannelIds ?? []).filter(
            (id) => id !== currentChannel.id,
          );
          await this.saveState();
          this.requestStatePublication();
          return undefined;
        }
        if (!supportsOutputAction(currentChannel, command.action)) {
          await this.releaseCommand(command.id);
          return { error: 'command does not match the configured output behavior', code: 'unsupported_operation' };
        }
        if (!(await this.outputs.isGuardSatisfied(currentChannel))) {
          await this.releaseCommand(command.id);
          return { error: 'operational guard is not satisfied', code: 'guard_rejected' };
        }
        const admit = Object.assign(
          () => {
            if (this.runtimeUpdateRequired || this.runtimeFailsafePending)
              throw new WriteAdmissionError('runtime_update');
            if (Date.parse(expiresAt) <= Date.now()) throw new WriteAdmissionError('expired');
          },
          { expiresAt: Date.parse(expiresAt) },
        );
        if (command.action === 'pulse') {
          const currentDuration = currentChannel.pulse?.durationMs;
          if (!currentDuration) return this.releaseFailedWrite(command.id, currentChannel.id);
          if (
            !(await this.outputs.writeWhileQueued(
              currentChannel,
              true,
              () => this.outputs.schedulePulse(currentChannel, currentDuration),
              undefined,
              admit,
              currentDuration,
              command.source === 'manual' ? 'manual' : 'flow',
            ))
          )
            return this.releaseFailedWrite(command.id, currentChannel.id);
        } else if (
          !(await this.outputs.writeWhileQueued(
            currentChannel,
            command.value,
            undefined,
            () => this.outputs.clearPulse(currentChannel.id),
            admit,
            undefined,
            command.source === 'manual' ? 'manual' : 'flow',
          ))
        )
          return this.releaseFailedWrite(command.id, currentChannel.id);
        return undefined;
      });
      // Release the physical channel/configuration barrier before waiting on MQTT.
      await this.acknowledge(command.id, failure ? 'rejected' : 'accepted', failure?.error, failure?.code);
    } catch (error) {
      if (error instanceof WriteAdmissionError) {
        await this.releaseCommand(command.id);
        await this.acknowledge(command.id, 'rejected', error.message, error.code);
        return;
      }
      if (!(error instanceof Error) || error.message !== 'channel write queue is full') throw error;
      await this.releaseCommand(command.id);
      await this.acknowledge(command.id, 'rejected', error.message, 'queue_full');
    } finally {
      this.inFlightCommandIds.delete(command.id);
    }
  }
}
