import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AttractapInstallationRecord } from '@attraccess/application-models';
import { Mutex } from 'async-mutex';
import { randomUUID } from 'crypto';
import { EncryptionService } from '../../encryption/encryption.service';
import { ATTRACTAP_INSTALLATION_STORE, type AttractapInstallationStore } from './installation-store.port';
import {
  INSTALLATION_URI_PREFIX,
  READER_CERT_VALIDITY_MS,
  READER_URI_PREFIX,
  SERVER_CERT_VALIDITY_MS,
  createCaCertificate,
  exportPrivateKeyPem,
  generateKeyPair,
  importPrivateKeyPem,
  issueLeaf,
  x509,
} from './pki';

const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;

export interface ServerTlsMaterial {
  /** Leaf followed by the CA certificate. */
  certificateChainPem: string;
  privateKeyPem: string;
}

export interface IssuedReaderCertificate {
  pem: string;
  serial: string;
  notAfter: Date;
}

interface LoadedIdentity {
  installationId: string;
  caCert: x509.X509Certificate;
  caCertPem: string;
  serverCertPem: string;
  serverKeyPem: string;
  serverNotAfter: Date;
}

/**
 * The per-installation identity: a CA and a server leaf certificate. The CA key is stored in
 * the database encrypted with the same secret that protects other stored secrets.
 */
@Injectable()
export class InstallationIdentityService {
  private readonly logger = new Logger(InstallationIdentityService.name);
  private readonly mutex = new Mutex();
  private loaded: LoadedIdentity | null = null;

  public constructor(
    @Inject(ATTRACTAP_INSTALLATION_STORE)
    private readonly store: AttractapInstallationStore,
    private readonly encryption: EncryptionService,
  ) {}

  public async getInstallationId(): Promise<string> {
    return (await this.load()).installationId;
  }

  public async getCaCertificatePem(): Promise<string> {
    return (await this.load()).caCertPem;
  }

  /** SPKI DER of the CA public key: this is what readers pin during pairing. */
  public async getCaPublicKeySpki(): Promise<Buffer> {
    return Buffer.from((await this.load()).caCert.publicKey.rawData);
  }

  public async getServerTlsMaterial(): Promise<ServerTlsMaterial> {
    const identity = await this.load();
    return {
      certificateChainPem: `${identity.serverCertPem.trim()}\n${identity.caCertPem}`,
      privateKeyPem: identity.serverKeyPem,
    };
  }

  public async issueReaderCertificate(
    readerId: number,
    subjectPublicKeySpki: Buffer,
  ): Promise<IssuedReaderCertificate> {
    const identity = await this.load();
    const caKey = await this.loadCaKey();
    const cert = await issueLeaf({
      caCert: identity.caCert,
      caKey,
      subjectPublicKey: subjectPublicKeySpki,
      commonName: `Attractap reader ${readerId}`,
      uri: `${READER_URI_PREFIX}${readerId}`,
      usage: 'client',
      validityMs: READER_CERT_VALIDITY_MS,
    });
    return { pem: cert.toString('pem'), serial: cert.serialNumber, notAfter: cert.notAfter };
  }

  private async loadCaKey(): Promise<CryptoKey> {
    const row = await this.store.find();
    if (!row) throw new Error('The attractap installation identity does not exist yet');
    return await importPrivateKeyPem(this.encryption.decrypt(row.caPrivateKeyEncrypted));
  }

  private async load(): Promise<LoadedIdentity> {
    if (this.loaded && this.loaded.serverNotAfter.getTime() - Date.now() > RENEW_BEFORE_MS) return this.loaded;

    return await this.mutex.runExclusive(async () => {
      if (this.loaded && this.loaded.serverNotAfter.getTime() - Date.now() > RENEW_BEFORE_MS) return this.loaded;

      let row = await this.store.find();
      if (!row) {
        row = await this.createInstallation();
      } else if (row.serverCertificateNotAfter.getTime() - Date.now() <= RENEW_BEFORE_MS) {
        row = await this.renewServerCertificate(row);
      }

      this.loaded = {
        installationId: row.installationId,
        caCert: new x509.X509Certificate(row.caCertificatePem),
        caCertPem: row.caCertificatePem,
        serverCertPem: row.serverCertificatePem,
        serverKeyPem: this.encryption.decrypt(row.serverPrivateKeyEncrypted),
        serverNotAfter: row.serverCertificateNotAfter,
      };
      return this.loaded;
    });
  }

  private async issueServerLeaf(installationId: string, caCert: x509.X509Certificate, caKey: CryptoKey) {
    const keys = await generateKeyPair();
    const cert = await issueLeaf({
      caCert,
      caKey,
      subjectPublicKey: keys.publicKey,
      commonName: 'Attraccess server',
      uri: `${INSTALLATION_URI_PREFIX}${installationId}`,
      usage: 'server',
      validityMs: SERVER_CERT_VALIDITY_MS,
    });
    return { cert, keyPem: await exportPrivateKeyPem(keys.privateKey) };
  }

  private async createInstallation(): Promise<AttractapInstallationRecord> {
    const installationId = randomUUID();
    const ca = await createCaCertificate(installationId);
    const server = await this.issueServerLeaf(installationId, ca.cert, ca.keys.privateKey);
    this.logger.log(`Created attractap installation identity ${installationId}`);
    return await this.store.save({
      installationId,
      caCertificatePem: ca.cert.toString('pem'),
      caPrivateKeyEncrypted: this.encryption.encrypt(await exportPrivateKeyPem(ca.keys.privateKey)),
      serverCertificatePem: server.cert.toString('pem'),
      serverPrivateKeyEncrypted: this.encryption.encrypt(server.keyPem),
      serverCertificateNotAfter: server.cert.notAfter,
    });
  }

  private async renewServerCertificate(row: AttractapInstallationRecord): Promise<AttractapInstallationRecord> {
    const caCert = new x509.X509Certificate(row.caCertificatePem);
    const caKey = await importPrivateKeyPem(this.encryption.decrypt(row.caPrivateKeyEncrypted));
    const server = await this.issueServerLeaf(row.installationId, caCert, caKey);
    this.logger.log('Renewed attractap server certificate');
    return await this.store.save({
      ...row,
      serverCertificatePem: server.cert.toString('pem'),
      serverPrivateKeyEncrypted: this.encryption.encrypt(server.keyPem),
      serverCertificateNotAfter: server.cert.notAfter,
    });
  }
}
