import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Singleton row (id = 1) holding the installation identity: CA and server certificate. */
@Entity('attractap_installation')
export class AttractapInstallation {
  @PrimaryColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text' })
  installationId!: string;

  @Column({ type: 'text' })
  caCertificatePem!: string;

  /** CA private key, AES-256-GCM encrypted by EncryptionService. */
  @Column({ type: 'text' })
  caPrivateKeyEncrypted!: string;

  @Column({ type: 'text' })
  serverCertificatePem!: string;

  @Column({ type: 'text' })
  serverPrivateKeyEncrypted!: string;

  @Column({ type: 'datetime' })
  serverCertificateNotAfter!: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
