import { RuntimeCommands } from './commands';

export abstract class RuntimeCommandReservations extends RuntimeCommands {
  protected async releaseFailedWrite(id: string, channelId: string): Promise<{ error: string; code: string }> {
    if (this.outputs.isWriteUncertain(channelId))
      return { error: 'device write outcome is uncertain', code: 'device_write_uncertain' };
    await this.releaseCommand(id);
    return { error: 'device write failed', code: 'device_write_failed' };
  }

  protected async releaseCommand(id: string): Promise<void> {
    this.state.commandIds = this.state.commandIds.filter((commandId) => commandId !== id);
    if (this.state.commandExpiries) delete this.state.commandExpiries[id];
    await this.saveState();
  }

  protected pruneCommandExpiries(): void {
    const now = Date.now();
    const expired = new Set(
      Object.entries(this.state.commandExpiries ?? {})
        .filter(([, expiresAt]) => Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= now)
        .map(([id]) => id),
    );
    this.state.commandExpiries = Object.fromEntries(
      Object.entries(this.state.commandExpiries ?? {}).filter(([id]) => !expired.has(id)),
    );
    this.state.commandIds = this.state.commandIds.filter((id) => !expired.has(id));
  }
}
