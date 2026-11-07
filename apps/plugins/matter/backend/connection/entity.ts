// TypeORM entity for the single row of Matter sidecar connection settings.
//
// The schema is owned by the plugin migration (backend/migrations): the host runs with `synchronize: false`, so this
// entity only describes the existing `plugin_matter_connection` table. Every column declares an explicit `type`
// because the esbuild bundle does not emit decorator type metadata.
import { Column, Entity, PrimaryColumn } from '@attraccess/plugins-backend-sdk';

/** The settings are a singleton: there is exactly one row, with this ID. */
export const CONNECTION_ROW_ID = 1;

@Entity({ name: 'plugin_matter_connection' })
export class MatterConnection {
  @PrimaryColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'varchar' })
  url!: string;

  /** The service token, encrypted with `context.secrets`. Never returned by the API. */
  @Column({ type: 'text', name: 'encrypted_credential' })
  encryptedCredential!: string;

  /** Optional PEM trust anchors for a private CA. */
  @Column({ type: 'text', name: 'ca_certificate', nullable: true })
  caCertificate!: string | null;

  @Column({ type: 'varchar', name: 'credential_updated_at' })
  credentialUpdatedAt!: string;

  @Column({ type: 'varchar', name: 'updated_at' })
  updatedAt!: string;

  @Column({ type: 'integer', name: 'updated_by', nullable: true })
  updatedBy!: number | null;
}
