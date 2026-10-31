import { CachedGrant } from './pairing-model';

const GRANT_TTL_MS = 5 * 60 * 1000;

/**
 * Certificates issued at pairing, by key fingerprint, kept until the reader picked one up in its
 * first (bootstrap) session or a few minutes passed. Only a cache: whoever hands one out still
 * checks that the key is the reader's active credential.
 */
export class BootstrapGrants {
  private readonly grants = new Map<string, CachedGrant>();

  public issue(fingerprint: string, readerId: number, certificatePem: string): void {
    this.forgetReader(readerId);
    this.grants.set(fingerprint, { readerId, certificatePem, expiresAt: Date.now() + GRANT_TTL_MS });
  }

  /** The unexpired grant for this key, if any. */
  public get(fingerprint: string): CachedGrant | undefined {
    const grant = this.grants.get(fingerprint);
    return grant && grant.expiresAt > Date.now() ? grant : undefined;
  }

  public forget(fingerprint: string): void {
    this.grants.delete(fingerprint);
  }

  public forgetReader(readerId: number): void {
    for (const [key, grant] of this.grants) if (grant.readerId === readerId) this.grants.delete(key);
  }
}
