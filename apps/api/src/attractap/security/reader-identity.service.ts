import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Attractap, AttractapReaderIdentity } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, createPrivateKey, randomUUID, X509Certificate } from 'node:crypto';
import { AppConfigType } from '../../config/app.config';
import { VerifiedCardSessionService } from './verified-card-session.service';
import { ReaderSecurityCommandServer } from './reader-security-cli';
import { EncryptionService } from '../../encryption/encryption.service';
import { rewrapCardKeys } from './card-key-rotation';
import { verifyHardwareQualification } from '../firmware.service';
import { issueReaderCertificate, ReaderIssuerConfiguration, withReaderIssuer } from './reader-certificate-issuer';

/** Files are owned by the API account. Refuse links, shared directories and oversized input. */
export function readProtectedReaderFile(path: string, maximum = 65536): Buffer {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('Unsafe reader security path');
  const directory = lstatSync(dirname(path));
  if (!directory.isDirectory() || directory.uid !== process.getuid() || (directory.mode & 0o777) !== 0o700)
    throw new Error('Unsafe reader security directory');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > maximum)
      throw new Error('Unsafe reader security file');
    const bytes = readFileSync(fd);
    if (bytes.length > maximum) {
      bytes.fill(0);
      throw new Error('Reader security file exceeds limit');
    }
    return bytes;
  } finally {
    closeSync(fd);
  }
}

export interface ReaderSecurityConfiguration {
  installationId: string;
  serverCertificateFile: string;
  serverKeyFile: string;
  readerCaFiles: string[];
  readerCaOverlap?: { startedAt: number; endsAt: number };
  timeKeyFile: string;
  qualificationTrustFile?: string;
  issuer?: ReaderIssuerConfiguration;
}

export function publicKeyFingerprint(certificate: X509Certificate): string {
  return createHash('sha256')
    .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
}

@Injectable()
export class ReaderIdentityService implements OnModuleInit, OnModuleDestroy {
  private commandServer?: ReaderSecurityCommandServer;
  private readonly logger = new Logger(ReaderIdentityService.name);
  private readonly sessions = new Map<string, { identity: AttractapReaderIdentity; close: () => Promise<void> }>();
  private readonly legacySessions = new Map<object, { readerId: number; close: () => Promise<void> }>();
  private readonly changing = new Set<number>();
  private trustChanging = false;
  // Installed configuration is immutable until the protected install command or restart.
  private snapshot?: { directory: string; value: ReaderSecurityConfiguration; roots: Map<string, X509Certificate> };
  private readonly certificateCache = new Map<string, { certificate: X509Certificate; roots: Set<string> }>();

  constructor(
    @InjectRepository(AttractapReaderIdentity) private readonly identities: Repository<AttractapReaderIdentity>,
    private readonly config: ConfigService,
    private readonly proofs: VerifiedCardSessionService,
    private readonly encryption: EncryptionService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.directory) return;
    // Invalid protected configuration stops startup rather than enabling a
    // partially secured installation. Registry access is rechecked on every use.
    this.configuration();
    for (const identity of await this.identities.find()) {
      if (!this.active(identity)) continue;
      try {
        await this.validateCertificate(identity.certificatePem);
      } catch {
        // Invalid historical trust must not prevent another valid generation
        // from reconnecting. The rejected credential still cannot attach.
        this.logger.warn(
          `Reader credential unavailable: reader=${identity.readerId} generation=${identity.generation}`,
        );
      }
    }
    this.commandServer = new ReaderSecurityCommandServer(this);
    await this.commandServer.listen();
  }

  async onModuleDestroy(): Promise<void> {
    await this.commandServer?.close();
    await Promise.all([...this.sessions.values()].map((session) => session.close()));
    this.sessions.clear();
    await this.closeLegacySessions();
  }

  get directory(): string | undefined {
    return this.config.get<AppConfigType>('app')?.READER_SECURITY_DIRECTORY;
  }

  configuration(file?: string): ReaderSecurityConfiguration | undefined {
    if (!this.directory) return undefined;
    if (!file && this.snapshot?.directory === this.directory) {
      const value = this.snapshot.value;
      if (
        value.readerCaOverlap &&
        Date.now() >=
          Math.min(value.readerCaOverlap.endsAt, Date.parse(this.snapshot.roots.get(value.readerCaFiles[0]).validTo))
      ) {
        return { ...value, readerCaFiles: value.readerCaFiles.slice(1), readerCaOverlap: undefined };
      }
      return value;
    }
    const bytes = readProtectedReaderFile(file ?? join(this.directory, 'reader-security.json'));
    try {
      const value = JSON.parse(bytes.toString('utf8')) as ReaderSecurityConfiguration;
      if (
        !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.installationId) ||
        !Array.isArray(value.readerCaFiles) ||
        value.readerCaFiles.length < 1 ||
        value.readerCaFiles.length > 2 ||
        ![value.serverCertificateFile, value.serverKeyFile, value.timeKeyFile, ...value.readerCaFiles].every(
          (path) => typeof path === 'string' && path.startsWith('/'),
        )
      )
        throw new Error('Invalid reader security configuration');
      if (value.readerCaFiles.length === 2) {
        const overlap = value.readerCaOverlap;
        if (
          !overlap ||
          !Number.isSafeInteger(overlap.startedAt) ||
          !Number.isSafeInteger(overlap.endsAt) ||
          overlap.startedAt > Date.now() ||
          overlap.endsAt <= overlap.startedAt ||
          overlap.endsAt - overlap.startedAt > 86400_000
        )
          throw new Error('Invalid reader trust overlap');
        const old = new X509Certificate(readProtectedReaderFile(value.readerCaFiles[0]));
        if (Date.now() >= Math.min(overlap.endsAt, Date.parse(old.validTo))) {
          value.readerCaFiles = value.readerCaFiles.slice(1);
          delete value.readerCaOverlap;
        }
      } else if (value.readerCaOverlap) throw new Error('Unexpected reader trust overlap');
      if (value.issuer) withReaderIssuer(value.issuer, value.readerCaFiles, readProtectedReaderFile, () => undefined);
      if (!file) {
        const roots = new Map(
          value.readerCaFiles.map((path) => [path, new X509Certificate(readProtectedReaderFile(path))]),
        );
        Object.freeze(value.readerCaFiles);
        if (value.readerCaOverlap) Object.freeze(value.readerCaOverlap);
        if (value.issuer) Object.freeze(value.issuer);
        this.snapshot = { directory: this.directory, value: Object.freeze(value), roots };
      }
      return value;
    } finally {
      bytes.fill(0);
    }
  }

  private active(identity: AttractapReaderIdentity, now = Date.now()): boolean {
    return (
      !this.trustChanging &&
      !this.changing.has(identity.readerId) &&
      !identity.revokedAt &&
      (!identity.retiredAt || identity.retiredAt.getTime() > now) &&
      identity.validFrom.getTime() <= now &&
      identity.validUntil.getTime() > now &&
      identity.installationId === this.configuration()?.installationId
    );
  }

  connectionActive(identity: AttractapReaderIdentity): boolean {
    return this.active(identity);
  }

  status(
    readerId: number,
  ): { readerId: number; generation: number; certificateFingerprint: string; manifestDigest: string }[] {
    if (!Number.isSafeInteger(readerId) || readerId <= 0) throw new Error('Invalid reader id');
    return [...this.sessions.values()]
      .filter(({ identity }) => identity.readerId === readerId && this.active(identity))
      .map(({ identity }) => ({
        readerId,
        generation: identity.generation,
        certificateFingerprint: identity.certificateFingerprint,
        manifestDigest: identity.manifestDigest,
      }));
  }

  async findForTime(fingerprint: string): Promise<AttractapReaderIdentity | null> {
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) return null;
    const candidates = await this.identities.find({
      where: { publicKeyFingerprint: fingerprint },
      order: { generation: 'DESC' },
    });
    for (const identity of candidates) {
      if (!this.active(identity)) continue;
      try {
        return await this.validateCertificate(identity.certificatePem);
      } catch {
        // A retired, expired or untrusted generation must not shadow a valid one.
      }
    }
    return null;
  }

  async validateCertificate(pem: string): Promise<AttractapReaderIdentity> {
    let cached = this.certificateCache.get(pem);
    if (!cached) {
      cached = { certificate: new X509Certificate(pem), roots: new Set() };
      if (this.certificateCache.size >= 256) this.certificateCache.delete(this.certificateCache.keys().next().value);
      this.certificateCache.set(pem, cached);
    }
    const certificate = cached.certificate;
    const signature = (certificate as X509Certificate & { signatureAlgorithm?: string }).signatureAlgorithm;
    if (
      certificate.ca ||
      certificate.publicKey.asymmetricKeyType !== 'rsa' ||
      certificate.publicKey.asymmetricKeyDetails?.modulusLength !== 3072 ||
      !certificate.keyUsage?.includes('1.3.6.1.5.5.7.3.2') ||
      !['sha256WithRSAEncryption', 'sha384WithRSAEncryption', 'sha512WithRSAEncryption'].includes(signature)
    )
      throw new Error('Invalid reader credential');
    const fingerprint = certificate.fingerprint256.replace(/:/g, '').toLowerCase();
    const identity = await this.identities.findOneBy({ certificateFingerprint: fingerprint });
    if (
      !identity ||
      !this.active(identity) ||
      identity.publicKeyFingerprint !== publicKeyFingerprint(certificate) ||
      identity.validFrom.getTime() !== Date.parse(certificate.validFrom) ||
      identity.validUntil.getTime() !== Date.parse(certificate.validTo)
    )
      throw new Error('Reader credential is not active');
    const trusted = this.configuration()?.readerCaFiles.some((path) => {
      const root = this.snapshot.roots.get(path);
      if (!root?.ca || Date.parse(root.validFrom) > Date.now() || Date.parse(root.validTo) <= Date.now()) return false;
      if (cached.roots.has(root.fingerprint256)) return true;
      if (!certificate.checkIssued(root) || !certificate.verify(root.publicKey)) return false;
      cached.roots.add(root.fingerprint256);
      return true;
    });
    if (!trusted) throw new Error('Reader trust is not active');
    return identity;
  }

  async installConfiguration(file: string): Promise<void> {
    if (this.trustChanging || !this.directory) throw new Error('Reader trust mutation is unavailable');
    const candidate = this.configuration(file);
    const current = this.configuration();
    if (!candidate || candidate.installationId !== current?.installationId)
      throw new Error('Installation changes require protected reader replacement');
    for (const path of candidate.readerCaFiles) {
      const root = new X509Certificate(readProtectedReaderFile(path));
      if (!root.ca || !(Date.parse(root.validFrom) <= Date.now() && Date.parse(root.validTo) > Date.now()))
        throw new Error('Invalid reader trust');
    }
    const ringBytes = readProtectedReaderFile(candidate.timeKeyFile);
    try {
      const ring = JSON.parse(ringBytes.toString('utf8'));
      if (
        !Array.isArray(ring.keys) ||
        ring.keys.length < 1 ||
        ring.keys.length > 2 ||
        new Set(ring.keys.map((key) => key.id)).size !== ring.keys.length
      )
        throw new Error('Invalid time generations');
      for (const entry of ring.keys) {
        const key = createPrivateKey(entry.pem);
        if (
          !Number.isSafeInteger(entry.id) ||
          entry.id < 1 ||
          entry.id > 0xffffffff ||
          key.asymmetricKeyType !== 'rsa' ||
          key.asymmetricKeyDetails?.modulusLength !== 3072 ||
          !Number.isSafeInteger(entry.validFrom) ||
          !Number.isSafeInteger(entry.validUntil) ||
          entry.validUntil <= entry.validFrom ||
          typeof entry.retired !== 'boolean'
        )
          throw new Error('Invalid time key');
      }
      if (
        !ring.keys.some(
          (key) => key.id === ring.active && !key.retired && key.validFrom <= Date.now() && key.validUntil > Date.now(),
        )
      )
        throw new Error('No active time generation');
    } finally {
      ringBytes.fill(0);
    }
    const temporary = join(this.directory, `.reader-security-${randomUUID()}`);
    this.trustChanging = true;
    try {
      writeFileSync(temporary, JSON.stringify(candidate), { flag: 'wx', mode: 0o600 });
      renameSync(temporary, join(this.directory, 'reader-security.json'));
      this.snapshot = undefined;
      this.certificateCache.clear();
      this.configuration();
      await Promise.all(
        [...this.sessions.entries()].map(async ([generation, session]) => {
          await session.close();
          this.detach(generation);
        }),
      );
      await this.closeLegacySessions();
      this.logger.log('Reader trust configuration replaced; affected sessions closed');
    } finally {
      this.trustChanging = false;
      try {
        unlinkSync(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          this.logger.error('Reader configuration temporary-file cleanup failed');
      }
    }
  }

  async isLegacy(readerId: number): Promise<boolean> {
    // A reader with any secured history cannot downgrade, even after revocation.
    return !(await this.identities.existsBy({ readerId })) && !this.changing.has(readerId) && !this.trustChanging;
  }

  private async closeLegacySessions(): Promise<void> {
    await Promise.all(
      [...this.legacySessions.entries()].map(async ([generation, session]) => {
        await session.close();
        this.detachLegacy(generation);
      }),
    );
  }

  trackLegacy(generation: object, readerId: number, close: () => Promise<void>): void {
    if (!Number.isSafeInteger(readerId) || readerId <= 0 || this.changing.has(readerId) || this.trustChanging)
      throw new Error('Reader lifecycle changed');
    this.legacySessions.set(generation, { readerId, close });
  }

  detachLegacy(generation: object): void {
    this.legacySessions.delete(generation);
  }

  async attach(generation: string, identity: AttractapReaderIdentity, close: () => Promise<void>): Promise<void> {
    const current = await this.validateCertificate(identity.certificatePem);
    if (current.id !== identity.id) throw new Error('Reader credential changed');
    this.sessions.set(generation, { identity: current, close });
  }

  detach(generation: string): void {
    this.sessions.delete(generation);
    this.proofs.cancelConnection(generation);
  }

  async cancelReader(readerId: number): Promise<void> {
    this.proofs.cancelReader(readerId);
    await Promise.all(
      [...this.legacySessions.entries()]
        .filter(([, session]) => session.readerId === readerId)
        .map(async ([generation, session]) => {
          await session.close();
          this.detachLegacy(generation);
        }),
    );
    const sessions = [...this.sessions.entries()].filter(([, value]) => value.identity.readerId === readerId);
    await Promise.all(
      sessions.map(async ([generation, value]) => {
        await value.close();
        this.detach(generation);
      }),
    );
  }

  async revoke(readerId: number): Promise<void> {
    if (!Number.isSafeInteger(readerId) || readerId <= 0) throw new Error('Invalid reader id');
    // Reserve before the first await; a rejected command must not release another owner's marker.
    if (this.changing.has(readerId)) throw new Error('Reader lifecycle changed');
    this.changing.add(readerId);
    try {
      await this.identities.update({ readerId }, { revokedAt: new Date() });
      await this.cancelReader(readerId);
    } finally {
      this.changing.delete(readerId);
    }
  }

  async issue(options: { readerId: number; publicKeyFile: string; lifetimeSeconds?: number }): Promise<string> {
    try {
      const configuration = this.configuration();
      if (!configuration?.issuer) throw new Error('Reader certificate issuance is not configured');
      if (
        !Number.isSafeInteger(options.readerId) ||
        options.readerId <= 0 ||
        !(await this.identities.manager.existsBy(Attractap, { id: options.readerId }))
      )
        throw new Error('Invalid reader');
      return issueReaderCertificate({
        ...options,
        installationId: configuration.installationId,
        publicKey: readProtectedReaderFile(options.publicKeyFile, 4096),
        issuer: configuration.issuer,
        activeRoots: configuration.readerCaFiles,
        read: readProtectedReaderFile,
      });
    } catch {
      throw new Error('Reader certificate issuance denied');
    }
  }

  async rewrapCards(): Promise<{ changed: number }> {
    await Promise.all(
      [...this.sessions.entries()].map(async ([generation, session]) => {
        await session.close();
        this.detach(generation);
      }),
    );
    const changed = await rewrapCardKeys(this.identities.manager.connection, this.encryption);
    this.logger.log(`Card ciphertext maintenance completed: rows=${changed}`);
    return { changed };
  }

  /** API-owned registry mutation. Commands contain file paths, never secrets. */
  async enroll(options: {
    readerId: number;
    certificateFile: string;
    manifestFile: string;
    enrollmentClass: 'development' | 'production';
    overlapSeconds?: number;
    replaceReaderId?: number;
  }): Promise<{ generation: number; fingerprint: string }> {
    const ids = [...new Set([options.readerId, options.replaceReaderId ?? options.readerId])];
    const overlap = options.overlapSeconds ?? 0;
    if (
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0 || this.changing.has(id)) ||
      !Number.isSafeInteger(overlap) ||
      overlap < 0 ||
      overlap > 86400 ||
      !['development', 'production'].includes(options.enrollmentClass)
    )
      throw new Error('Invalid reader enrollment');
    const configuration = this.configuration();
    if (!configuration) throw new Error('Reader security unavailable');
    const pem = readProtectedReaderFile(options.certificateFile);
    const manifest = readProtectedReaderFile(options.manifestFile);
    try {
      const certificate = new X509Certificate(pem);
      const now = Date.now();
      const validFrom = new Date(certificate.validFrom);
      const validUntil = new Date(certificate.validTo);
      const signature = (certificate as X509Certificate & { signatureAlgorithm?: string }).signatureAlgorithm;
      if (
        certificate.ca ||
        certificate.publicKey.asymmetricKeyType !== 'rsa' ||
        certificate.publicKey.asymmetricKeyDetails?.modulusLength !== 3072 ||
        !certificate.keyUsage?.includes('1.3.6.1.5.5.7.3.2') ||
        !['sha256WithRSAEncryption', 'sha384WithRSAEncryption', 'sha512WithRSAEncryption'].includes(signature) ||
        !(validFrom.getTime() <= now && validUntil.getTime() > now)
      )
        throw new Error('Invalid reader credential');
      const trusted = configuration.readerCaFiles.some((path) => {
        const bytes = readProtectedReaderFile(path);
        try {
          const authority = new X509Certificate(bytes);
          return (
            authority.ca &&
            Date.parse(authority.validFrom) <= now &&
            Date.parse(authority.validTo) > now &&
            certificate.checkIssued(authority) &&
            certificate.verify(authority.publicKey)
          );
        } finally {
          bytes.fill(0);
        }
      });
      if (!trusted) throw new Error('Untrusted reader credential');
      const certificateFingerprint = certificate.fingerprint256.replace(/:/g, '').toLowerCase();
      const manifestDigest = createHash('sha256').update(manifest).digest('hex');
      if (options.enrollmentClass === 'production') {
        const bundle = JSON.parse(manifest.toString('utf8'));
        if (
          bundle.version !== 1 ||
          bundle.readerId !== options.readerId ||
          bundle.installationId !== configuration.installationId ||
          bundle.certificateFingerprint !== certificateFingerprint ||
          bundle.publicKeyFingerprint !== publicKeyFingerprint(certificate) ||
          bundle.inventory?.target !== 'esp32s3' ||
          bundle.inventory?.flashBytes !== 0x1000000 ||
          typeof bundle.qualificationFile !== 'string' ||
          !bundle.artifacts ||
          typeof bundle.artifacts !== 'object' ||
          !['application.bin', 'bootloader.bin', 'partition-table.bin', 'identity.bin', 'nvs-keys.bin'].every(
            (name) => name in bundle.artifacts,
          )
        )
          throw new Error('Production manifest is incomplete or mismatched');
        const artifacts: Record<string, string> = {};
        for (const [name, digest] of Object.entries(bundle.artifacts)) {
          if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))
            throw new Error('Invalid production artifact');
          const bytes = readProtectedReaderFile(join(dirname(options.manifestFile), name), 16 * 1024 * 1024);
          try {
            if (createHash('sha256').update(bytes).digest('hex') !== digest)
              throw new Error('Production artifact changed');
          } finally {
            bytes.fill(0);
          }
          artifacts[name] = digest;
        }
        artifacts['reader-manifest.json'] = manifestDigest;
        verifyHardwareQualification(
          bundle.qualificationFile,
          dirname(options.manifestFile),
          configuration.qualificationTrustFile,
          artifacts,
          bundle.inventoryDigest,
        );
      }
      ids.forEach((id) => this.changing.add(id));
      try {
        const result = await this.identities.manager.transaction(async (manager) => {
          if (!(await manager.existsBy(Attractap, { id: options.readerId }))) throw new Error('Reader does not exist');
          const repository = manager.getRepository(AttractapReaderIdentity);
          const owners = await repository.findBy({ publicKeyFingerprint: publicKeyFingerprint(certificate) });
          if (owners.some((identity) => identity.readerId !== options.readerId))
            throw new Error('Reader key belongs to another reader');
          const previous = await repository.findBy({ readerId: options.readerId });
          const generation = Math.max(0, ...previous.map((identity) => identity.generation)) + 1;
          const active = previous.filter(
            (identity) =>
              !identity.revokedAt &&
              identity.validUntil.getTime() > now &&
              (!identity.retiredAt || identity.retiredAt.getTime() > now),
          );
          if (overlap && active.length >= 2) throw new Error('At most two reader generations may overlap');
          for (const old of active) {
            old.retiredAt = new Date(
              Math.min(
                now + overlap * 1000,
                old.validUntil.getTime(),
                validUntil.getTime(),
                old.retiredAt?.getTime() ?? Infinity,
              ),
            );
            await repository.save(old);
          }
          if (options.replaceReaderId && options.replaceReaderId !== options.readerId)
            await repository.update({ readerId: options.replaceReaderId }, { revokedAt: new Date(now) });
          await repository.save(
            repository.create({
              readerId: options.readerId,
              generation,
              certificateFingerprint,
              publicKeyFingerprint: publicKeyFingerprint(certificate),
              certificatePem: certificate.toString(),
              installationId: configuration.installationId,
              validFrom,
              validUntil,
              revokedAt: null,
              retiredAt: null,
              enrollmentClass: options.enrollmentClass,
              manifestDigest,
            }),
          );
          return { generation, fingerprint: certificateFingerprint };
        });
        await Promise.all(ids.map((id) => this.cancelReader(id)));
        this.logger.log(`Reader credential enrolled: reader=${options.readerId} generation=${result.generation}`);
        return result;
      } finally {
        ids.forEach((id) => this.changing.delete(id));
      }
    } finally {
      pem.fill(0);
      manifest.fill(0);
    }
  }
}
