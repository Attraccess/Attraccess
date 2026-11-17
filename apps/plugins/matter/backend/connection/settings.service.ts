import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SidecarClientConfig } from '../client/rest-client';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { matterStorage } from '../plugin-storage/access';
import { CONNECTION_ROW_ID, type MatterConnection } from './entity';
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

  private get storage() {
    return matterStorage(this.context);
  }

  async publicView(): Promise<PublicSettings> {
    const row = await this.storage.tables.connection.get(CONNECTION_ROW_ID);
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
    const row = await this.storage.tables.connection.get(CONNECTION_ROW_ID);
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

  /** Read and write in one host transaction, so a concurrent save cannot slip between them. */
  save(input: SettingsInput, userId: number | null): Promise<{ credentialChanged: boolean; caChanged: boolean }> {
    return this.storage.transaction(async (tables) => {
      const existing = await tables.connection.get(CONNECTION_ROW_ID);
      if (!existing && input.credential === undefined) {
        throw new MissingCredentialError('credential: The credential is required for the first configuration.');
      }
      const now = new Date().toISOString();
      const url = normalizeUrl(input.url) as string;
      const caCertificate = input.caCertificate === undefined ? (existing?.caCertificate ?? null) : input.caCertificate;
      // The stored credential is only ever sent to the endpoint it was entered for. Otherwise anyone allowed to save
      // the settings could point the URL (or the trusted CA) at their own server and capture the sidecar's token.
      if (
        existing &&
        input.credential === undefined &&
        (url !== existing.url || caCertificate !== existing.caCertificate)
      ) {
        throw new MissingCredentialError(
          'credential: Enter the credential again when changing the URL or the CA certificate.',
        );
      }
      const credentialChanged = input.credential !== undefined;
      await tables.connection.upsert(
        {
          id: CONNECTION_ROW_ID,
          url,
          encryptedCredential: credentialChanged
            ? this.context.secrets.encrypt(input.credential as string)
            : (existing as MatterConnection).encryptedCredential,
          caCertificate,
          credentialUpdatedAt: credentialChanged || !existing ? now : existing.credentialUpdatedAt,
          updatedAt: now,
          updatedBy: userId,
        },
        { conflictOn: ['id'] },
      );
      return { credentialChanged, caChanged: caCertificate !== (existing?.caCertificate ?? null) };
    });
  }

  remove(): Promise<boolean> {
    return this.storage.transaction(async (tables) => (await tables.connection.delete({ id: CONNECTION_ROW_ID })) > 0);
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
