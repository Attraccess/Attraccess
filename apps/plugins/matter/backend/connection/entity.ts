// Row type of the single row of Matter sidecar connection settings. The table is declared in `../plugin-storage/tables.ts`.
import type { PluginStorageRow } from '@attraccess/plugins-backend-sdk';
import type { MATTER_TABLES } from '../plugin-storage/tables';

/** The settings are a singleton: there is exactly one row, with this ID. */
export const CONNECTION_ROW_ID = 1;

/**
 * The service token (`encryptedCredential`) is encrypted with `context.secrets` and never returned by the API;
 * `caCertificate` holds optional PEM trust anchors for a private CA.
 */
export type MatterConnection = PluginStorageRow<(typeof MATTER_TABLES)['connection']>;
