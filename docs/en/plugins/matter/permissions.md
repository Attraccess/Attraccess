# Matter: Permissions

<!-- llms-description: Matter and Thread permission keys, their default roles, which key each Matter operation needs, the direct-command confirmation rule, audit behaviour and upgrade notes. -->

> [!NOTE]
> Only available when the **Matter** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

The Matter plugin declares its own permission keys instead of using the broad `system.plugins.manage`. You find
them in the role editor and the API-token picker in the **Matter & Thread** group. How plugin permissions work in general,
including what happens while the plugin is uninstalled, is described in [Permissions](user-management/permissions.md#plugin-permissions).

## Permission keys

| Key                             | Allows                                                                                        | Default roles                       |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| `matter.devices.read`           | View the connection status, fabric and backup status, devices, their state and reconciliation | `administrator`, `resource-manager` |
| `matter.devices.manage`         | Change the connection settings, fabric, recovery key, backups, restore and device records     | `administrator`, `resource-manager` |
| `matter.devices.commission`     | Commission devices, share them with another fabric and remove them from the fabric            | `administrator`, `resource-manager` |
| `matter.devices.command-direct` | Send direct test commands to a device, outside of flows                                       | `administrator`, `resource-manager` |
| `thread.network.read`           | View the Thread network status and non-secret dataset metadata                                | `administrator`, `resource-manager` |
| `thread.network.manage`         | Set the Thread dataset, manage border routers and export the dataset secret                   | `administrator`, `resource-manager` |

The default roles receive the keys once, when the plugin is first loaded on a host. **System Administrator**
(`system-admin`) receives none of them. **Administrator** always holds all of them. Custom roles receive them only
when you add them.

The **Devices → Matter** page and its sidebar entry are shown to users holding `matter.devices.read` or
`thread.network.read`. A user with only `matter.devices.read` sees the status views but no settings form and no
fabric, recovery-key, backup or restore controls; those need `matter.devices.manage`. Grant `matter.devices.manage`
together with `matter.devices.read`: the page shows the manage controls only to users who hold both.

`matter.devices.manage` amounts to full control of the fabric: it can rotate the recovery key, download the encrypted
backups and restore them. Grant it only to people you would also trust with direct commands. Changing the connection
URL or the CA certificate requires entering the service token again, so the stored token is never sent to a new
endpoint.

## Which key each operation needs

Every route answers `403` without its key, before it reads the database or calls the sidecar, and the response
contains no inventory, state, credentials, recovery keys, backup content, setup payloads or Thread secrets. API
tokens work when both the token and its owner hold the key.

### Available now

| Operation                                                                                                                      | Key                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `GET connection/status`, `GET fabric`, `GET backups` (metadata)                                                                | `matter.devices.read`   |
| `GET nodes`, `GET nodes/:id`, `GET endpoints/:id/state`, `GET reconciliation`                                                  | `matter.devices.read`   |
| `GET connection` (the settings form with URL and CA; the service token is never returned)                                      | `matter.devices.manage` |
| `PUT connection`, `DELETE connection`                                                                                          | `matter.devices.manage` |
| `POST fabric/create`, recovery key generate, acknowledge and rotate, `POST recovery/accept-sidecar`, `POST recovery/start-new` | `matter.devices.manage` |
| `POST backups`, `GET backups/:id/download`                                                                                     | `matter.devices.manage` |
| `POST restore/validate`, `POST restore/confirm`, `POST restore/:id/cancel`                                                     | `matter.devices.manage` |
| `PATCH nodes/:id`, claim, relink, repair, archive, restore, force-remove, `PATCH endpoints/:id`, `POST reconciliation`         | `matter.devices.manage` |

All paths are under `/api/matter/`. The recovery key and backup download also work with an API token that carries
`matter.devices.manage`.

### Planned operations

These operations do not exist yet. Their keys are fixed now, so you can prepare your roles.

| Operation                                                                   | Key                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Start commissioning and read its status, share a device, remove from fabric | `matter.devices.commission`                                 |
| Override a failed attestation during commissioning                          | `matter.devices.commission` **and** `matter.devices.manage` |
| Direct test commands                                                        | `matter.devices.command-direct`                             |
| OTA update status                                                           | `matter.devices.read`                                       |
| Approve and apply an OTA update                                             | `matter.devices.manage`                                     |
| Thread status and dataset metadata (non-secret)                             | `thread.network.read`                                       |
| Set the Thread dataset, manage border routers (OTBR)                        | `thread.network.manage`                                     |
| Export the Thread dataset secret                                            | `thread.network.manage`, web session only (no API tokens)   |
| Development overrides                                                       | `matter.devices.manage`                                     |
| Live updates of device inventory and state                                  | `matter.devices.read`                                       |
| Live updates of the Thread network                                          | `thread.network.read`                                       |

Commands that a [flow](flows/overview.md) sends to a Matter device need no Matter key: they follow the
normal flow and resource permissions. Sending the same command directly needs `matter.devices.command-direct`.

### Confirmation for direct commands

Direct commands that **unlock**, **unbolt** or **power on** a device will ask the user to confirm before they are
sent. This rule applies as soon as direct commands are available.

## Audit

Matter actions are recorded in the [audit log](settings/audit-log.md) with the actor, the affected node,
endpoint or fabric, the action, its result and a correlation ID shared by related entries. Entries never contain the
service token, recovery keys, backup content, setup codes or Thread datasets. Backup downloads and cancelled restores
are recorded too.

- Actions that Attraccess runs on its own, such as automatic reconciliation, show **System or anonymous** as the
  actor.
- State changes that devices report by themselves are not audited and have no actor.
- Denied attempts (`403`) are not recorded.

## Upgrade notes

Before this release, all Matter features needed `system.plugins.manage`. After the upgrade:

- **Administrator** and **Resource Manager** have full Matter and Thread access.
- Users who reached Matter only through **System Administrator**, or through a custom role with
  `system.plugins.manage`, **lose access** to the Matter page and its API.

To restore access, create or edit a custom role, add the Matter keys these users need (for example
`matter.devices.read` and `matter.devices.manage`) and assign it to them. For an API token that used
`system.plugins.manage` for Matter, create a new token with the new keys in your account settings and revoke the old
one; the account settings do not change the keys of an existing token.
