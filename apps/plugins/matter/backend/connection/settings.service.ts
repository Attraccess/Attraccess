import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SidecarClientConfig } from '../client/rest-client';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { CONNECTION_ROW_ID, MatterConnection } from './entity';
import { normalizeUrl, type SettingsInput } from './validation';

export type PublicSettings = {
  url: string | null;
  credentialConfigured: boolean;
  credentialUpdatedAt: string | null;
  caCertificate: string | null;
  updatedAt: string | null;
};

export class MissingCredentialError extends Error {}
export class CredentialUnreadableError extends Error {}

/** Reads and writes the one row of connection settings. The credential is encrypted at rest and never returned. */
@Injectable()
export class MatterSettingsService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  private get repository() {
    return this.context.getRepository(MatterConnection);
  }

  async publicView(): Promise<PublicSettings> {
    const row = await this.repository.findOneBy({ id: CONNECTION_ROW_ID });
    if (!row) {
      return {
        url: null,
        credentialConfigured: false,
        credentialUpdatedAt: null,
        caCertificate: null,
        updatedAt: null,
      };
    }
    return {
      url: row.url,
      credentialConfigured: true,
      credentialUpdatedAt: row.credentialUpdatedAt,
      caCertificate: row.caCertificate,
      updatedAt: row.updatedAt,
    };
  }

  /** The decrypted settings for the sidecar client, or null when nothing is configured. */
  async clientConfig(): Promise<SidecarClientConfig | null> {
    const row = await this.repository.findOneBy({ id: CONNECTION_ROW_ID });
    if (!row) return null;
    try {
      return {
        url: row.url,
        token: this.context.secrets.decrypt(row.encryptedCredential),
        caCertificate: row.caCertificate,
      };
    } catch {
      throw new CredentialUnreadableError('The stored credential cannot be decrypted. Enter it again.');
    }
  }

  async save(input: SettingsInput, userId: number | null): Promise<{ credentialChanged: boolean; caChanged: boolean }> {
    const existing = await this.repository.findOneBy({ id: CONNECTION_ROW_ID });
    if (!existing && input.credential === undefined) {
      throw new MissingCredentialError('credential: The credential is required for the first configuration.');
    }
    const now = new Date().toISOString();
    const url = normalizeUrl(input.url) as string;
    const caCertificate = input.caCertificate === undefined ? (existing?.caCertificate ?? null) : input.caCertificate;
    const credentialChanged = input.credential !== undefined;
    await this.repository.save({
      id: CONNECTION_ROW_ID,
      url,
      encryptedCredential: credentialChanged
        ? this.context.secrets.encrypt(input.credential as string)
        : (existing as MatterConnection).encryptedCredential,
      caCertificate,
      credentialUpdatedAt: credentialChanged || !existing ? now : existing.credentialUpdatedAt,
      updatedAt: now,
      updatedBy: userId,
    });
    return { credentialChanged, caChanged: caCertificate !== (existing?.caCertificate ?? null) };
  }

  async remove(): Promise<boolean> {
    const result = await this.repository.delete({ id: CONNECTION_ROW_ID });
    return (result.affected ?? 0) > 0;
  }

  /** Records a settings change. Details are flags only. A missing or failing audit sink never fails the request. */
  async audit(
    action: 'matter.connection_saved' | 'matter.connection_removed',
    principal: PluginAuditPrincipal,
    details: Record<string, string | boolean> = {},
  ): Promise<void> {
    try {
      await this.context.audit?.record({
        action,
        operationId: randomUUID(),
        principal,
        outcome: 'succeeded',
        subject: { type: 'matter.connection', id: CONNECTION_ROW_ID },
        details,
      });
    } catch {
      this.context.logger.warn?.('Recording the Matter connection change in the audit log failed.');
    }
  }
}
