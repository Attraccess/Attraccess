# Matter: Commissioning, Sharing and Removal

<!-- llms-description: Add an IP-reachable Matter device to the Attraccess fabric, share it with another ecosystem and remove it: codes, steps, attestation, multi-admin. -->

> [!NOTE]
> Only available when the **Matter** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

This page covers devices that are already on your network (Ethernet or Wi-Fi). Thread and Bluetooth commissioning are not part of it. It builds on the [administration page](plugins/matter/admin-ui.md), the [operator guide](plugins/matter/operator.md) and [Permissions](plugins/matter/permissions.md).

## Commissioning a device

Open **Devices → Matter → Commissioning**. The tab needs `matter.devices.commission`. It is a full page with four steps:

1. **Prepare the device.** Power it on, connect it to the network and, if it was set up before, put it into pairing mode.
2. **Enter or scan the code.** Use one of the input forms below.
3. **Progress.** Each protocol step is listed with its live state: discovering the device, secure pairing (PASE), reading the device, attestation, adding the Attraccess fabric, reconnecting (CASE) and reading the endpoints. **Cancel** stops the attempt.
4. **Name and finish.** Give the device a name and location and, if you like, names for its endpoints. You can skip this step; the device is already registered.

The device is created as **claimed** by the user who commissioned it. There is no separate claim step. A user with only `matter.devices.commission` can still name the device in step 4.

### Input forms

All forms lead to the same request:

- **Scan with the camera.** The browser decodes the QR code. Camera access needs a secure context: HTTPS or `localhost`. Otherwise use one of the other forms.
- **Upload an image** of the QR code. It is decoded in your browser and never uploaded.
- **Paste the QR payload** (`MT:…`).
- **Type the manual code**: 11 or 21 digits. Spaces and hyphens are ignored.
- **A sharing code** from another ecosystem (see [Multi-admin](#multi-admin)) goes into the same field as any manual code or QR payload.

Attraccess checks the code in the browser first (the manual code's check digit, the `MT:` prefix). An invalid code is rejected immediately, before any request. The server checks it again.

### Setup codes are never stored

Setup and sharing codes exist only in memory. They travel in the body of a request, never in a URL, and are never written to the database, the audit log, logs, events, the browser storage or error messages. The page clears the code when the session ends or you leave it.

### When something goes wrong

Each failure has its own screen with what to do next. Nothing is left half-registered.

| Failure                   | What it means                                  | What to do                                                                                                                                                       |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid code              | The code is malformed                          | Check the digits or scan again                                                                                                                                   |
| Device not found          | Nothing answered on the network                | Bring the device onto the same network, check that it is in pairing mode, try again                                                                              |
| Wrong passcode            | The device refused the pairing                 | Check the code; a used or expired code needs a new one                                                                                                           |
| Attestation failed        | The device could not be proven genuine         | See [Attestation](#attestation)                                                                                                                                  |
| Already commissioned      | The device is already in the Attraccess fabric | The screen links to the existing record: open it, repair it (detached), restore it (archived). If none matches, run a reconciliation or factory-reset the device |
| Fabric full               | The device cannot hold another fabric          | Remove a fabric from the device in its other controller                                                                                                          |
| Timeout, reconnect failed | The device did not finish in time              | Start again                                                                                                                                                      |
| Cancelled                 | You cancelled                                  | Start again                                                                                                                                                      |
| Interrupted               | See below                                      | Start again                                                                                                                                                      |

Only one commissioning, removal or share runs at a time. A second start answers **busy**. While the fabric is in `recovery_required` (see [Backup and Recovery](plugins/matter/backup-restore.md)) nothing can be commissioned.

### Interruption means restart

A commissioning attempt is never resumed. If the sidecar restarts, the plugin restarts, the network drops or the attempt times out, it ends as **interrupted** and is audited. The device rolls back a partial setup by itself. Start again and enter the code again. If the device was joined just before the interruption, it appears in the Devices tab as an **unclaimed** device after the next reconciliation.

### When the device is registered

A node is created only after the sidecar reports success **and** the plugin has read the node from the sidecar and written the node and its endpoints in one transaction. If the plugin cannot do that, the attempt ends as failed and the device shows up as an unclaimed device after the next reconciliation, never as a duplicate.

Every commissioning and every removal raises the fabric generation, so a [backup](plugins/matter/backup-restore.md) is taken automatically a short time later.

## Attestation

Attestation proves that a device is a genuine, certified product. Attraccess is **strict**: any error-level finding fails the attempt. That includes an untrusted manufacturer root (PAA), a broken certificate chain, signature or nonce, a revoked device, a test certificate and a Certification Declaration of type "test". If the trust store is unavailable and no seed exists, it fails as well. Warnings are allowed and recorded, by finding type only.

### Trust store

The sidecar ships with a snapshot of the production certificate roots of the CSA Distributed Compliance Ledger (DCL). It works offline from this seed. When the DCL is reachable, the sidecar refreshes the data (production entries only, test certificates are never accepted) and caches it in its storage. Set `MATTER_SIDECAR_DCL_REFRESH=false` to turn the refresh off. Revocation data is only as fresh as the last refresh or seed build. See the [operator guide](plugins/matter/operator.md#attestation-trust-store).

### Development override

Development devices usually carry test certificates and fail attestation. For this case an operator can enable `MATTER_SIDECAR_ALLOW_ATTESTATION_OVERRIDE=true` on the sidecar. It is off by default, and the sidecar logs a warning at start-up when it is on. **Keep it unset in production.**

With the flag on, a failed attestation screen offers an override. It needs:

- the sidecar flag,
- `matter.devices.commission` **and** `matter.devices.manage`,
- an explicit risk confirmation for each attempt.

A failed attempt always ends. The override starts a **new** attempt with the confirmation, so the code is entered again (the browser keeps it in memory for that). The device is then registered with attestation **unverified** and the device page notes that it was overridden. The override is audited as a dangerous action with the finding types.

## Multi-admin

A Matter device can belong to several fabrics at once, for example Attraccess and a phone ecosystem.

- **Inbound.** To add a device that another ecosystem (Apple Home, Google Home, SmartThings, Home Assistant, …) already controls, use that ecosystem's "share" or "add to another app" function. It shows a sharing code. Enter it like any other code; the device must still be in its sharing window (a few minutes).
- **Outbound.** On a device's page, **Share with another controller** opens a commissioning window (3 to 15 minutes, default 3) and shows a one-time manual code and QR code with a countdown. **Close window** ends it early. The code is shown once and is neither stored nor logged. Needs `matter.devices.commission`. Sharing is audited without the code.
- **Other administrators.** The device page lists the device's other fabrics read-only as **Managed outside Attraccess** (fabric index, vendor, label). Attraccess never attributes anything another fabric does to an Attraccess user.

## Removing a device

On a device's page, with `matter.devices.commission`:

| Action                                                                          | What happens                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Remove from fabric**                                                          | The sidecar asks the reachable device to remove **the Attraccess fabric only**, then forgets the node. Other ecosystems' fabrics stay untouched. If the device is unreachable or times out, nothing changes and the page offers Force remove. |
| **Force remove**                                                                | The sidecar forgets the node **without contacting the device**. The device may still hold Attraccess credentials: factory-reset it or remove it in its other controller.                                                                      |
| Record-only force remove (Matter administrator action, `matter.devices.manage`) | Retires only the Attraccess record, for records the sidecar no longer lists. See [Data Model](plugins/matter/data-model.md#actions).                                                                                                          |

Removal never resets the device. The node becomes `removed` with reason `removed_from_fabric` or `forced_from_fabric`, its endpoints are retired and its history (state, commands, audit) stays. A removed node cannot be claimed again. Commissioning the device again creates a new record.
