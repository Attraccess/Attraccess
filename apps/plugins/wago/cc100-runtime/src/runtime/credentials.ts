import { RuntimeContext } from './context';
import { DiscoveryClaim } from '../runtime-protocol';

export abstract class RuntimeCredentials extends RuntimeContext {
  async receiveClaim(credentials: DiscoveryClaim): Promise<void> {
    this.state.credentials = credentials;
    await this.saveState();
  }

  /** An optional ACL upgrade must not prevent ordinary telemetry/command startup. */
  async retryCredentialRotationSubscription(): Promise<void> {
    if (!this.options.reconnectCredentials || this.credentialRotationSubscribed) return;
    try {
      await this.options.transport.subscribe(this.credentialRotationTopic(), (payload) =>
        this.receiveCredentialRotation(payload),
      );
      this.credentialRotationSubscribed = true;
    } catch {
      this.credentialRotationSubscribed = false;
    }
  }

  /** Persist before disconnecting; the acknowledgement is emitted only by the authenticated new connection. */
  receiveCredentialRotation(payload: Buffer): Promise<void> {
    const update = this.credentialUpdates.then(async () => {
      if (!this.loaded || !this.options.reconnectCredentials || !this.state.credentials || payload.length > 8192)
        return;
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(payload.toString('utf8'));
      } catch {
        return;
      }
      if (
        !input ||
        typeof input !== 'object' ||
        !Number.isSafeInteger(input.revision) ||
        (input.revision as number) < 1 ||
        typeof input.token !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(input.token) ||
        input.username !== this.state.credentials.username ||
        typeof input.password !== 'string' ||
        !input.password ||
        input.password.length > 4096
      )
        return;
      const expiry = this.credentialRotationExpiry(input);
      if (expiry === undefined) return;
      const previous = this.state.credentialRotation;
      if (
        previous &&
        ((input.revision as number) < previous.revision ||
          (input.revision === previous.revision &&
            (input.token !== previous.token || input.password !== this.state.credentials.password)))
      )
        return;
      const nextCredentials = { ...this.state.credentials, password: input.password };
      const nextRotation = { revision: input.revision as number, token: input.token };
      let saved = false;
      await this.queueStateUpdate(async () => {
        if (expiry <= Date.now()) return;
        this.state.credentials = nextCredentials;
        this.state.credentialRotation = nextRotation;
        await this.options.store.save(this.state);
        saved = true;
      });
      if (saved && this.state.credentials) await this.options.reconnectCredentials(this.state.credentials);
    });
    this.credentialUpdates = update.catch(() => undefined);
    return update;
  }

  protected credentialRotationExpiry(input: Record<string, unknown>): number | undefined {
    const expiry = typeof input.expiresAt === 'string' ? Date.parse(input.expiresAt) : NaN;
    if (
      !Number.isFinite(expiry) ||
      new Date(expiry).toISOString() !== input.expiresAt ||
      expiry <= Date.now() ||
      expiry - Date.now() > 30_000 ||
      !this.state.credentials?.credentialEpoch ||
      input.credentialEpoch !== this.state.credentials.credentialEpoch
    )
      return;
    return expiry;
  }

  /** Call only after MQTT CONNECT succeeds with these credentials, including process restart. */
  async acknowledgeCredentialRotation(authenticated: DiscoveryClaim): Promise<void> {
    const rotation = this.state.credentialRotation;
    if (
      !this.loaded ||
      !rotation ||
      authenticated.username !== this.state.credentials?.username ||
      authenticated.credentialEpoch !== this.state.credentials.credentialEpoch ||
      authenticated.password !== this.state.credentials.password
    )
      return;
    await this.options.transport.publish(
      `${this.credentialRotationTopic()}/ack`,
      { ...rotation, credentialEpoch: this.state.credentials.credentialEpoch, status: 'reconnected' },
      { retain: true },
    );
  }

  protected credentialRotationTopic(): string {
    return this.topic('credentials/rotate');
  }
}
