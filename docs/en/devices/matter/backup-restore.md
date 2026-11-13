# Matter: Backup and Recovery

<!-- llms-description: Matter fabric backup and recovery: what a backup contains, automatic and manual backups, the recovery key, restore and disaster recovery, degraded states and safety guarantees. -->

> **Keep your recovery key off the server.** The Matter fabric is the identity every commissioned device trusts. If you lose the fabric, every device must be factory-reset and commissioned again. Attraccess stores encrypted backups of the fabric, but they can only be opened with the **recovery key**, which is shown **exactly once**. If you lose both the key and the server, the fabric cannot be recovered.

This page describes how the Matter fabric is protected, how to back it up and how to restore it, including onto a fresh host. It builds on the [architecture](devices/matter/architecture.md) and the [operator guide](devices/matter/operator.md). All actions are in **Devices → Matter → Fabric & backup** and need the `system.plugins.manage` permission.

## What a Matter backup contains

A Matter backup is a single file (`.attraccess-matter-backup`) with two parts:

- **The sidecar's fabric storage:** the controller fabric (its root certificate and keys), the node ID allocator and the Matter message counters.
- **The plugin's Matter tables:** the device records, names, descriptions and locations, and the other `plugin_matter_*` data.

It does **not** contain:

- The rest of Attraccess (users, resources, settings, uploads). That is covered by the general [Attraccess backup](installation/backup-restore.md), which is separate.
- The service token and the CA certificate of the sidecar connection.
- The recovery key. It is never part of a backup.

> [!WARNING]
> A backup is a snapshot in time. Devices commissioned **after** the last backup are not in it. After a restore they still hold the old fabric information, so they must be **factory-reset and commissioned again**.

Matter message counters and the node ID allocator keep moving after a backup is taken. On restore, the sidecar advances both by a safe margin, so a restored fabric never reuses a counter or a node ID that was already used.

## Automatic and manual backups

Attraccess creates a backup automatically:

- after the fabric was created,
- after a restore,
- once a day,
- after every change to the fabric, and
- before a restore (so you can go back).

You can also click **Back up now** at any time. The status card shows the last successful backup, the last attempt (with the reason if it failed) and the time of the next run.

**Retention:** the newest **10** backups are kept, older ones are deleted. Backups are stored **encrypted in the plugin database**, so a normal [Attraccess volume backup](installation/backup-restore.md) already includes them. You can also download any stored backup from the list and keep a copy off the server. For disaster recovery you need such a copy, because the database that holds the stored backups is gone with the server.

## The recovery key

When you create the fabric (or start a new one), Attraccess generates a **256-bit recovery key**, shown as grouped upper-case letters and digits (for example `ABCD-EFGH-…`). Backups are encrypted with a key derived from it.

- The key is shown **exactly once**. You can copy it or download it as a text file. You must tick the acknowledgement checkbox before the dialog closes.
- **Store it off the server**, for example in a password manager and on paper in a safe place. It is never shown again and never appears in logs, the audit log or a backup.
- **If you lose both the key and the server, the fabric cannot be recovered.** Nobody, including the project, can decrypt a backup without the key.
- **Rotation.** **Rotate key** (after a confirmation) generates a new key, shows it once and encrypts all new backups with it. Existing backups keep the key they were made with: the header of each backup names its key by ID, so **keep old keys for as long as you may need old backups**.
- The server keeps the recovery key stored encrypted with a key derived from `AUTH_SESSION_SECRET`. Anyone who has the database **and** the `.env` file can therefore decrypt the stored backups. That is the same trust boundary as the rest of Attraccess (the same people can read the database and your secrets anyway), but it is the reason to protect both.
- **Uninstalling the Matter plugin drops the stored key and all stored backups** together with the other plugin data. Download a backup and keep the key before you uninstall.

## Restore

Use **Restore** in the Fabric & backup section. It opens a wizard:

1. **Choose a backup:** pick a stored backup or upload a `.attraccess-matter-backup` file.
2. **Enter the recovery key** the backup was made with. If you rotated keys, use the key named in the backup's header (shown by its ID).
3. **Validate.** Attraccess checks the file completely before anything changes: the file format, the integrity of both parts, the key, and that the backup matches this installation (see below). Errors are specific, for example wrong key, damaged or truncated file, or a different plugin release. Nothing is changed while validation fails.
4. **Preflight summary.** You see which fabric the backup contains, when it was made and what it replaces.
5. **Typed confirmation.** If the sidecar currently holds a **healthy** fabric that the restore would overwrite, you must type the fabric ID to confirm. When the sidecar has no usable fabric (see [Degraded states](#degraded-states-and-recovery)), no typed confirmation is needed.
6. **Result.** The wizard reports success, or that the restore was rolled back and your installation was left unchanged.

**Same release required.** The backup must come from the same Matter plugin release as the target: the plugin's last migration and the sidecar's storage schema must match **exactly**. Restore onto the same release (install the release recorded in the backup first), then upgrade afterwards.

### How a restore runs

A restore is a two-phase process so that neither side is left half-restored:

1. A pre-restore backup of the current state is taken (when a healthy fabric exists).
2. The sidecar **stages** the backup (validation only, no live change).
3. The sidecar **commits**: it swaps its storage and keeps the previous one as a rollback copy.
4. The plugin replaces its tables in one database transaction.
5. On success, the rollback copy is **finalized** (deleted). If the plugin step fails, the sidecar storage is **rolled back** to the previous one and the plugin keeps its old data. If the sidecar fails to verify the swap, it swaps back by itself and the restore fails with `restore_failed`.

Validation never changes anything. Before the commit, a cancelled restore just **aborts** the staged data.

### Disaster recovery onto a fresh host

1. Install a fresh Attraccess **and** start a sidecar with a **fresh, empty storage volume** (see `MATTER_SIDECAR_STORAGE_DIR` in the [operator guide](devices/matter/operator.md#configuration)).
2. Install the **same Matter plugin release** that made the backup and connect it to the sidecar.
3. Open **Devices → Matter**. The sidecar reports no fabric, so Attraccess offers **Restore**.
4. Upload your backup file, enter the recovery key, validate and restore.
5. Afterwards, factory-reset and commission again any device that was added after the backup was made.

## Degraded states and recovery

Attraccess compares what it recorded with what the sidecar reports (fabric ID, root certificate fingerprint, storage instance ID and a **fabric generation** that increases with every change). If they do not match, it enters a recovery state and **blocks actions that change the fabric** until an administrator decides.

| Situation                        | Typical cause                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Sidecar storage lost (no fabric) | The sidecar volume was wiped or replaced.                                                     |
| Different fabric                 | The sidecar points at another storage volume, or the fabric was created elsewhere.            |
| Generation behind                | The Attraccess volume was restored from an older backup, but the sidecar kept its own state.  |
| Generation ahead                 | The sidecar storage is older than Attraccess, or Attraccess was restored without the sidecar. |
| Sidecar `recovery_required`      | The sidecar found its own storage unusable and refuses to create a fabric on its own.         |

The recovery panel then offers three options:

- **Restore** from a backup (the wizard above). This is the right choice when you have a backup and key.
- **Accept the sidecar's fabric.** Only possible when the sidecar is healthy. Attraccess adopts the fabric the sidecar reports. Use this when you know the sidecar is correct, for example after restoring Attraccess without the sidecar. Device records that do not match are reconciled as usual.
- **Start a new fabric.** Only possible when the sidecar has no fabric. It creates a brand-new fabric with a new recovery key. **All previously commissioned devices must be factory-reset and commissioned again**, so this is a danger action with a confirmation.

Until you choose, Attraccess never picks one for you.

## Safety guarantees

- **Nothing happens automatically that could destroy a fabric.** Attraccess never creates, restores or overwrites a fabric on its own. The only automatic actions are creating backups.
- **Validation before any change.** A restore is fully checked first. A wrong key, a damaged file or an incompatible release changes nothing.
- **Rollback on both sides.** If the sidecar step or the plugin step fails, the previous state is put back on both sides.
- **No secrets in logs or the audit log.** The recovery key, fabric keys and backup contents are never logged.
- **Insecure transport is refused.** Backups and restores contain fabric secrets, so the sidecar refuses them with `insecure_transport` (HTTP 403) over a plain-HTTP connection to a remote sidecar. Use TLS, or run the sidecar on loopback.
- **Everything is audited.** Creating the fabric, backups, key rotation, restores and every recovery decision are written to the audit log, without secrets.

See also: [Attraccess backup and restore](installation/backup-restore.md), the [operator guide](devices/matter/operator.md) and the [data model](devices/matter/data-model.md).
