import { RuntimeCredentials } from './runtime-credentials';
import { CAPABILITIES, CREDENTIAL_EPOCH, DiscoveryClaim } from './runtime-protocol';
import { runtimeVersion } from '../manifest.json';

export abstract class RuntimeDiscovery extends RuntimeCredentials {
  async receiveDiscoveryClaim(payload: Buffer): Promise<DiscoveryClaim | undefined> {
    let claim: unknown;
    try {
      claim = JSON.parse(payload.toString('utf8'));
    } catch {
      return undefined;
    }
    if (!claim || typeof claim !== 'object') return undefined;
    const { username, password, configuration, acknowledgementToken, expiresAt, credentialEpoch } = claim as Record<
      string,
      unknown
    >;
    if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) return undefined;
    if (
      credentialEpoch !== undefined &&
      (typeof credentialEpoch !== 'string' || !CREDENTIAL_EPOCH.test(credentialEpoch))
    )
      return undefined;
    const expiry = expiresAt === undefined ? undefined : typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
    if (
      expiry !== undefined &&
      (!Number.isFinite(expiry) ||
        new Date(expiry).toISOString() !== expiresAt ||
        expiry <= Date.now() ||
        expiry - Date.now() > 60_000)
    )
      return undefined;
    const namespace =
      configuration && typeof configuration === 'object'
        ? (configuration as Record<string, unknown>).namespace
        : undefined;
    if (namespace !== undefined && (typeof namespace !== 'string' || !namespace)) return undefined;
    const credentials: DiscoveryClaim = {
      username,
      password,
      ...(typeof namespace === 'string' ? { prefix: namespace } : {}),
      ...(typeof credentialEpoch === 'string' ? { credentialEpoch } : {}),
    };
    this.state = await this.options.store.load();
    let saved = false;
    await this.queueStateUpdate(async () => {
      if (expiry !== undefined && expiry <= Date.now()) return;
      if (this.state.credentials?.credentialEpoch && !credentialEpoch) return;
      if (
        this.state.credentialRotation &&
        this.state.credentials?.credentialEpoch === credentialEpoch &&
        (this.state.credentials?.username !== username || this.state.credentials?.password !== password)
      )
        return;
      if (this.state.credentials?.credentialEpoch !== credentialEpoch) delete this.state.credentialRotation;
      this.state.credentials = credentials;
      await this.options.store.save(this.state);
      saved = true;
    });
    if (!saved) return undefined;
    if (typeof acknowledgementToken === 'string' && acknowledgementToken)
      await this.options.transport.publish(`${this.discoveryClaimTopic()}/ack`, { acknowledgementToken });
    return credentials;
  }

  public publishDiscoveryAnnouncement(sequence = Date.now()): Promise<void> {
    return this.options.transport.publish(
      this.discoveryTopic(),
      {
        hardwareId: this.options.hardwareId,
        pairingCode: this.options.pairingCode,
        enrollmentSecret: this.options.enrollmentSecret,
        protocolVersion: '1.0.0',
        runtimeVersion,
        // Discovery proves enrollment reachability, not the permanent credential subscription.
        capabilities: CAPABILITIES.filter((value) => value !== 'credential-rotation-v1'),
        sequence,
      },
      { retain: true },
    );
  }

  discoveryClaimTopic(): string {
    return `${this.discoveryTopic()}/claim`;
  }

  protected discoveryTopic(): string {
    return `${this.options.prefix.replace(/^\/+|\/+$/g, '')}/discovery/${this.options.hardwareId}`;
  }
}
