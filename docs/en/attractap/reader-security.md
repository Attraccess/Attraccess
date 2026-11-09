# Reader Security (Secure Boot keys)
<!-- llms-description: How to secure Attractap Touch V2 readers so they only accept firmware signed with your own Secure Boot keys, including backup and restore. -->

Attractap Touch V2 readers can be **secured**: afterwards they only accept firmware signed by _your_
installation, their flash is encrypted and their server identity is locked to the chip. This page
covers the keys your installation needs for that. Securing a reader itself is not available yet; the
button appears in a later release once the procedure has been verified on real hardware.

Open **Settings → Reader security** (permission `system.settings.manage`).

## The two keys

| Key              | Purpose                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Signing key**  | Signs the firmware your readers accept. The server holds it, encrypted with a key derived from `AUTH_SESSION_SECRET`.                                                 |
| **Recovery key** | A spare that every secured reader also trusts. You download it once, keep it offline, and prove you have it. The server then deletes its own copy of the private key. |

Both are RSA-3072 keys. The page only ever shows their fingerprints.

## Set up

1. Click **Create keys**. The status becomes _Keys created, recovery check pending_.
2. Click **Download recovery key**, choose a passphrase of at least 12 characters (entered twice) and
   store the file and the passphrase safely. You can repeat the download until the check has passed.
3. Click **Check recovery key**, upload the file and enter the passphrase. If it matches, the server
   deletes its copy of the recovery private key and the status becomes **Ready**.

No reader can be secured before step 3 has passed. The server enforces this, not only the page.

## Back up

- **Download signing key backup** is available as soon as keys exist. It asks for a passphrase of at least
  12 characters (entered twice), just like the recovery key. Keep the file and its passphrase.
- Also back up `AUTH_SESSION_SECRET` (without it the stored keys cannot be decrypted), the database, and
  the recovery key file with its passphrase.
- Database backups taken before the recovery check still contain the recovery private key, encrypted
  with `AUTH_SESSION_SECRET`. Protect them like the recovery file.

> **Warning:** The server's signing key is lost when the database or `AUTH_SESSION_SECRET` is lost. If
> that happens and you also have neither a signing key backup nor the recovery key, secured readers can
> never be updated again.

The downloaded files are encrypted PKCS#8 PEM files. `openssl` reads them with the passphrase.
`espsecure` cannot read encrypted keys, so decrypt a temporary copy first, for example to sign an
emergency firmware image with the recovery key (esptool 5.x syntax; older versions use
`espsecure.py sign_data`):

```bash
umask 077                                    # the unencrypted copy is readable by you only
openssl pkey -in attraccess-recovery-key.pem -out /dev/shm/recovery-key-plain.pem   # asks for the passphrase
espsecure sign-data --version 2 --keyfile /dev/shm/recovery-key-plain.pem --output app-signed.bin app.bin
rm /dev/shm/recovery-key-plain.pem           # /dev/shm is in memory, so nothing reaches the disk
```

## Restore

**Restore** accepts a signing key backup or the recovery file, each with its passphrase, as downloaded
from this page (unencrypted key files and the public device-lab keys are rejected). It is only available
when this installation has no usable signing key (none, or one that can no longer be decrypted because
`AUTH_SESSION_SECRET` changed), or when no reader is secured with the current one. When keys exist, a
restore replaces the current signing key. If readers are secured with a key that can no longer be
decrypted, only a key those readers trust is accepted (the signing key backup or the recovery file).

After restoring from the **recovery file**, that key becomes the signing key (the readers trust it as
their second key) and a **fresh recovery key** is created. The status shows _Restored, recovery check
pending_ until the new recovery key has passed the check; no new reader can be secured before that.

Restoring a **signing key backup** replaces only the signing key; the recovery key and its status stay as
they are. On an installation without a usable recovery key, a fresh one is created that has to pass the
check. Restoring a key that already is the signing key is rejected, and so is the recovery file
restored as a signing key backup.

**Regenerate keys** replaces both keys, so recovery files and backups of the old keys stop being useful.
It is only possible while no reader has this installation's keys burned in.

## Limits

- Key revocation and rotation for already-secured readers are not supported yet.
- A secured reader cannot be moved to another installation.
- The protection targets an attacker with brief physical access. It makes no claims against glitching,
  side-channel or invasive attacks, and the chip's digital signature (DS) peripheral proves key use but is
  not remote attestation.
