# Reader Security (Secure Boot keys)
<!-- llms-description: How to secure Attractap Touch V2 readers over the network so they only run firmware signed with your own keys, with key backup, restore and the protection's limits. -->

Attractap Touch V2 readers can be **secured**: afterwards they only accept firmware signed by _your_
installation, and their flash and settings storage are encrypted. This page covers the keys your
installation needs for that, how to secure a reader over the network, and what a secured reader does and
does not protect against.

> **Availability:** the **Secure this reader** button appears only for reader variants whose secure
> firmware has been verified on real hardware. Until then the button is hidden and readers stay as they
> are; the keys can already be created and backed up.

## Reader identity and the Secured status

A reader's identity is the P-256 key it creates itself and that your installation trusts once an admin
has [paired](attractap/pairing.md) it. On a reader running a secure build, flash encryption and NVS
encryption protect that key.

A secure reader reports its security settings (eFuses) each time it connects, and the **Pairing** tab of
the reader editor shows **Secured** or **Not secured** with the settings that do not match (see
[Secure readers](attractap/pairing.md#secure-readers)). **Secured** also needs the fingerprints of the reader's Secure Boot keys, which the server records while
it secures the reader (see [Secure a reader](#secure-a-reader)). A reader that runs a secure build without
that, for example a device-lab reader, shows **Not secured**.

The reader list and the reader editor show these chips:

| Chip                        | Meaning                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Secured**                 | The last security report matched the release secure profile and the Secure Boot keys this installation recorded.          |
| **Lab key (not secured)**   | The reader runs a device-lab build signed with the public lab keys. Anyone can sign firmware for it; it is never secured. |
| Conversion step (e.g. **Transferring**) | A **Secure this reader** run is in progress for this reader.                                                 |

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

## Secure a reader

Securing turns a paired reader running the regular (plain) firmware into a secured reader, over the
network, without opening it. The reader keeps its pairing and its settings.

### Before you start

The **Secure this reader** button is in the **Pairing** tab of the reader editor, in the security area. It
is disabled, with a tooltip naming the reason, unless all of these hold:

- You have the permission `system.settings.manage`.
- The keys are **Ready**: the recovery key check has passed (the server enforces this).
- The reader is paired and online.
- The reader's firmware supports securing (update it first if the tooltip says it does not).
- The reader runs a release build of a regular variant: not a development, demo, debug or lab build.
- No other reader is being secured right now. An installation secures one reader at a time.

Also make sure that:

- the reader has a reliable power supply for the whole run, and nobody unplugs it;
- you have a **signing key backup** and the **recovery key** with their passphrases, plus backups of the
  database and `AUTH_SESSION_SECRET` (see [Back up](#back-up)). Without them a secured reader may never be
  updated again.

### Steps

1. Click **Secure this reader**. A warning explains the risks: the two short periods in which a power
   loss can make the reader unusable, that the reader must stay powered, that it cannot be flashed from a
   browser or over USB afterwards, that it only accepts updates signed by this installation, and that
   moving it to another installation is not supported. It also reminds you to keep your key backups.
2. Type the reader's name to confirm.
3. The server asks the reader for a **preflight** report and shows the result as a list: chip, flash
   size, partition table, unused key blocks, Secure Boot and flash encryption still off, free memory,
   variant and firmware profile. Nothing is changed on the reader yet. If a check fails, the run cannot
   start.
4. Click **Start**. The progress view refreshes about every 2 seconds and shows the current step and the
   transfer percentage.

The run goes through these steps:

| Step                   | What happens                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Preflight**          | The reader reports its hardware and security settings; the server checks them.                                                                                          |
| **Transferring**       | The reader downloads the secure firmware and bootloader, signed by this installation, keeps a backup of its pairing and settings, and checks both signatures.            |
| **Keys burned**        | The server has recorded the fingerprints of the signing and recovery key. The reader writes them permanently into its eFuses and reports what it wrote back.             |
| **Bootloader written** | The reader makes the old firmware unbootable, writes the new bootloader, checks it and restarts.                                                                         |
| **Encrypting**         | The new bootloader turns on Secure Boot and encrypts the flash. The reader is offline during this step.                                                                 |
| **Migrating**          | The secure firmware encrypts the settings storage, restores the pairing and settings from the backup, checks them, deletes the backup and locks the eFuse read protection. |
| **Secured**            | The reader reconnects and its security report passes the check.                                                                                                         |

The server records the key fingerprints _before_ it tells the reader to write them, and it stores the
reader's read-back before it continues. If the reader reports different values, the run stops with
_Key mismatch_.

### Don't unplug: the two critical windows

There are two periods in which losing power can leave the reader unusable. The reader shows a full-screen
**Don't unplug** notice during both, and the progress view shows a banner:

1. **Writing the bootloader** (end of _Bootloader written_): about _N_ seconds (to be measured).
2. **Turning on Secure Boot and encrypting the flash** (_Encrypting_, and _Migrating_ right after it):
   about _N_ minutes (to be measured).

Outside these windows an interruption is harmless: the run pauses and continues when the reader is back.

### Cancel, failure and retry

- **Cancel** is possible until the keys are burned (_Preflight_ and _Transferring_). The reader deletes
  what it downloaded and keeps running its current firmware.
- **Going offline** before the bootloader is written only pauses the run. When the reader reconnects, it
  continues where it stopped, for example at the same transfer offset.
- **Failed** shows the reason, for example a failed preflight, a failed signature check, a refused or
  mismatching key write, or a failed security check after the conversion. **Retry** is offered when it is
  safe: if the run failed before the bootloader was written. After the keys are burned a retry checks the
  downloaded firmware again and continues from there.
- **Interrupted** means the reader has been offline for more than 15 minutes after the bootloader was
  written and is not secured yet. It may have lost power in a critical window. Bring it back online; if it
  reconnects, the run continues from what the reader reports. If it does not, it probably needs to be
  replaced.

### After securing

- The reader only runs firmware signed by this installation. Updates arrive over the network as usual;
  the server signs each update for this reader and never offers one with a lower security version than the
  reader already has.
- The reader can no longer be flashed from the browser flasher or over USB, and it has no USB console.
- If the server holds no key the reader trusts (for example after losing the database without a backup),
  the reader editor shows **No signing key for this reader** and the reader gets no more updates. Restore
  the signing key backup or the recovery file (see [Restore](#restore)).
- You can let only secured readers enroll and reset cards: choose **Only secured readers** under
  **Settings → RFID card enrollment** (see [RFID cards](attractap/rfid-cards.md#which-readers-may-enroll-and-reset-cards)).
- A secured reader belongs to this installation. Moving it, or the keys, to another installation is not
  supported. Removing its pairing does not undo securing; it can be paired again to the same installation.

## Setup over Bluetooth

Readers accept their PIN, Wi-Fi and server address over Bluetooth ([Attractap Setup](attractap/setup.md#set-up-over-bluetooth)),
and secured readers do too, as secured readers have no USB setup:

- Only while the reader is **not paired**: a paired reader never opens the Bluetooth setup.
- Only over an **encrypted** link (Bluetooth LE Secure Connections). Every setup window uses a new Bluetooth
  address and stores no pairing: a computer pairs anew for every window.
- With the **same PIN rules** as over USB: once a PIN is set, every change needs it.
- After **5 wrong PINs** the reader refuses every command that needs the PIN, also the right one, until someone
  at the device resets it: unplug it briefly, or, on a Touch, press **Bluetooth setup** once the window has closed.
  The reader's own restarts keep the count.
- A secured reader still has **no USB configurator**: its USB console stays off.

Because an unpaired reader opens the setup by itself for 10 minutes after it starts, anyone in Bluetooth range
during that time can configure it as long as no PIN is set, and nobody can without the PIN once it is set. On a
Touch that is no more than its on-screen settings already allow; a Lite or a secured reader, which needed a cable
or had no setup at all before, can now be configured from nearby. Set the PIN first. It never applies to a paired
reader. A reader that someone set up this way still cannot do anything
until an admin approves its pairing in Attraccess: approve only the reader you expect (compare its code or
colour pattern).

## Attacker model and limits

Securing a reader protects against an attacker who can open the case and work on the reader with ordinary
tools for up to about 7 days and a budget of about EUR 1,000: such an attacker should not be able to run
their own firmware on it, read its pairing key or settings from the flash, or make it pass as secured.

What it does not claim:

- No protection against fault injection (glitching), side-channel or invasive attacks on the chip. This
  includes Espressif advisory AR2026-005.
- The security report is the reader's own statement, read by its firmware. It is not remote attestation:
  a reader whose firmware was replaced by one of the attacks above could report anything.
- Key revocation and rotation for already-secured readers are not supported yet.
- A secured reader cannot be moved to another installation.
