/** OpenSSH kex_exchange_identification's DEBUG1 record. Only consume this after
 * the SAME SSH process has completed host-key verification and authentication.
 * https://github.com/openssh/openssh-portable/blob/V_10_0_P2/kex.c
 * Never retain/log diagnostic output. Duplicate, conflicting or absent evidence
 * is unknown, including a remote command attempting to inject another record.
 */
export class ManagementPeerVersion {
  private line = '';
  private overflow = false;
  private records = 0;
  private recognized = false;

  write(chunk: Buffer): void {
    for (const byte of chunk) {
      if (byte === 10) {
        if (this.line.startsWith('debug1: Remote protocol version ')) {
          this.records++;
          this.recognized =
            !this.overflow &&
            this.line.replace(/\r$/, '') ===
              'debug1: Remote protocol version 2.0, remote software version dropbear_2025.88';
        }
        this.line = '';
        this.overflow = false;
      } else if (this.line.length < 256) this.line += String.fromCharCode(byte);
      else this.overflow = true;
    }
  }

  result(): '2025.88' | 'unknown' {
    return this.records === 1 && this.recognized && !this.line.startsWith('debug1: Remote protocol version ')
      ? '2025.88'
      : 'unknown';
  }
}
