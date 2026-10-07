import { User } from '@attraccess/database-entities';
import { pbkdf2Sync, randomBytes, subtle } from 'crypto';
import { AttractapCardStorageImplementation } from './attractap-card-storage';
export abstract class AttractapCardKeysImplementation extends AttractapCardStorageImplementation {
  public uint8ArrayToHexString(uint8Array: Uint8Array) {
    return Array.from(uint8Array)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generates a new key for the RFID card using PBKDF2 with salt and iterations for enhanced security.
   * The key derivation is based on:
   * - A unique random token per user (stored in user.nfcKeySeedToken)
   * - The key number
   * - The card UID
   * - A deterministic salt derived from the card UID and key number
   * - 100,000 iterations for PBKDF2
   * @param keyNo The key number to generate
   * @param cardUID The UID of the RFID card
   * @param userId The ID of the user who owns the card
   * @returns 16 bytes Uint8Array
   */
  public async generateNTAG424Key(data: { keyNo: number; cardUID: string; userId: number }) {
    const user = await this.userRepository.findOne({ where: { id: data.userId } });

    if (!user) {
      this.logger.error(`User with ID ${data.userId} not found`);
      throw new Error(`User with ID ${data.userId} not found`);
    }

    const seedToken = await this.resolveNfcKeySeedToken(user);

    // Create a secure seed using the user's unique token, key number, and card UID
    const seed = `${seedToken}:${data.keyNo}:${data.cardUID}`;

    // Create a deterministic salt from card UID and key number
    // This ensures the same card+key combination always produces the same salt
    const saltSeed = `${data.cardUID}:${data.keyNo}`;
    const saltBytes = new TextEncoder().encode(saltSeed);
    const salt = await subtle.digest('SHA-256', saltBytes);

    // Use PBKDF2 with 100,000 iterations for secure key derivation
    const iterations = 100000;
    const keyLength = 16; // 16 bytes = 128 bits

    const derivedKey = pbkdf2Sync(seed, new Uint8Array(salt), iterations, keyLength, 'sha256');

    // shrink to 16 bytes
    return new Uint8Array(derivedKey).slice(0, 16);
  }

  protected async resolveNfcKeySeedToken(user: User): Promise<string> {
    if (!user.nfcKeySeedToken) {
      const token = randomBytes(24).toString('base64url').slice(0, 32);
      user.nfcKeySeedToken = this.encryptionService.encrypt(token);
      await this.userRepository.save(user);
      return token;
    }
    return this.encryptionService.decryptIfEncrypted(user.nfcKeySeedToken) ?? user.nfcKeySeedToken;
  }
}
