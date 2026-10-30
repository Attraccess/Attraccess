import { supportsOutputAction } from '../../../../channel-behavior';
import { RuntimeConfiguration } from '../configuration/configuration';
import { type MessageSlot, WriteAdmissionError } from '../types';

type OutputCommand = {
  id: string;
  expiresAt?: unknown;
  channelId: string;
  action: 'set' | 'pulse' | 'release';
  source?: 'manual';
  value?: boolean;
  expectedConfigurationRevision?: unknown;
};

type CommandFailure = { error: string; code: string };

/** Unparseable or unaddressable payloads cannot be acknowledged and are dropped. */
function parseCommand(payload: Buffer): OutputCommand | undefined {
  let command: OutputCommand;
  try {
    command = JSON.parse(payload.toString('utf8'));
  } catch {
    return undefined;
  }
  if (
    typeof command?.id !== 'string' ||
    !command.id ||
    !command.channelId ||
    !['set', 'pulse', 'release'].includes(command.action)
  )
    return undefined;
  return command;
}

function commandFormatFailure(command: OutputCommand): CommandFailure | undefined {
  if (
    (command.source !== undefined && command.source !== 'manual') ||
    (command.action === 'release' && command.source !== 'manual')
  )
    return { error: 'invalid command source', code: 'invalid_command' };
  if (command.action === 'set' && typeof command.value !== 'boolean')
    return { error: 'set commands require a boolean value', code: 'invalid_command' };
  return undefined;
}

function isUnexpired(expiresAt: unknown): expiresAt is string {
  return typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > Date.now();
}

function isConfigurationRevision(revision: unknown): revision is number {
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0;
}

/** Only admission rejections and a full channel queue are reported; anything else propagates. */
function interruptedCommandFailure(error: unknown): CommandFailure {
  if (error instanceof WriteAdmissionError) return { error: error.message, code: error.code };
  if (!(error instanceof Error) || error.message !== 'channel write queue is full') throw error;
  return { error: error.message, code: 'queue_full' };
}

export abstract class RuntimeCommands extends RuntimeConfiguration {
  async receiveCommand(payload: Buffer, slot?: MessageSlot): Promise<void> {
    const command = parseCommand(payload);
    if (!command) return;
    const formatFailure = commandFormatFailure(command);
    if (formatFailure) return this.acknowledge(command.id, 'rejected', formatFailure.error, formatFailure.code);
    const expiresAt = command.expiresAt;
    if (!isUnexpired(expiresAt)) return this.acknowledge(command.id, 'rejected', 'command has expired', 'expired');
    const expectedConfigurationRevision = command.expectedConfigurationRevision;
    if (!isConfigurationRevision(expectedConfigurationRevision))
      return this.acknowledge(command.id, 'rejected', 'command requires a configuration revision', 'invalid_command');
    const availabilityFailure = this.commandAvailabilityFailure();
    if (availabilityFailure)
      return this.acknowledge(command.id, 'rejected', availabilityFailure.error, availabilityFailure.code);
    this.pruneCommandExpiries();
    if (this.state.commandIds.includes(command.id) || this.state.commandExpiries?.[command.id])
      return this.acknowledge(command.id, 'duplicate');
    if (this.inFlightCommandIds.has(command.id)) return this.acknowledge(command.id, 'duplicate');
    this.inFlightCommandIds.add(command.id);
    try {
      const configurationFailure = this.acceptedConfigurationFailure(expectedConfigurationRevision);
      if (configurationFailure)
        return this.acknowledge(command.id, 'rejected', configurationFailure.error, configurationFailure.code);
      const channel = this.state.accepted?.snapshot.logicalChannels.find((item) => item.id === command.channelId);
      // Validation never lets a disabled channel act; refuse one defensively anyway.
      if (!channel || channel.enabled === false || !channel.capabilities.includes('output'))
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
      // The command is about to join its channel queue; one slow output must not hold a handling slot.
      slot?.release();
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
          !currentChannel?.capabilities.includes('output') ||
          currentChannel.enabled === false
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
      const failure = interruptedCommandFailure(error);
      await this.releaseCommand(command.id);
      await this.acknowledge(command.id, 'rejected', failure.error, failure.code);
    } finally {
      this.inFlightCommandIds.delete(command.id);
    }
  }

  protected commandAvailabilityFailure(): CommandFailure | undefined {
    if (this.configurationPending)
      return { error: 'configuration persistence is in progress', code: 'configuration_busy' };
    if (this.runtimeUpdateRequired || this.runtimeFailsafePending)
      return { error: 'Runtime update required; outputs are held in failsafe', code: 'runtime_update' };
    return undefined;
  }

  protected acceptedConfigurationFailure(expectedConfigurationRevision: number): CommandFailure | undefined {
    if (this.state.accepted?.revision !== expectedConfigurationRevision)
      return { error: 'controller configuration revision is stale', code: 'stale_revision' };
    if (this.state.accepted && this.options.device.validate?.(this.state.accepted.snapshot).length)
      return {
        error: 'stored configuration is unsupported by this hardware profile; publish a corrected configuration',
        code: 'unsupported_point',
      };
    return undefined;
  }
}
