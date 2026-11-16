# Matter
<!-- llms-description: The Matter plugin connects Attraccess to a separate Matter sidecar that holds the Matter fabric; overview, prerequisites and links to the guides. -->

> [!NOTE]
> Only available when the **Matter** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

The **Matter** plugin is the foundation for Matter smart-home device support in Attraccess. It connects to a separate
**Matter sidecar** process, which is the only part that runs the Matter stack. An administrator creates and manages
the Matter fabric, its encrypted backups and recovery from Attraccess. In the current release the sidecar does not
control or list devices yet, so there is no device UI.

## Prerequisites

- Attraccess 1.11.0 or newer and the `matter` plugin, installed as described in
  [Installing Plugins](plugins/installing-plugins.md). It needs the `DATABASE_ACCESS` and `MANAGE_SECRETS`
  permissions.
- The **Matter sidecar**, a separate Node.js process or container (Node.js `>=24.22.1 <25`) that you build, secure
  and run yourself. Attraccess talks to it with a service token. See the [Operator Guide](plugins/matter/operator.md).
- Network access from the sidecar to your Matter devices (mDNS and UDP) once a fabric exists.

## Where it appears

An admin page under **Devices → Matter** in the sidebar, with the sidecar connection settings (URL, service token,
optional CA certificate), the fabric, its backups and recovery.

## In this section

- [Architecture](plugins/matter/architecture.md): plugin plus sidecar, contract, errors and events
- [Operator Guide](plugins/matter/operator.md): build and start the sidecar, configuration, connecting Attraccess
- [Data Model and Lifecycle](plugins/matter/data-model.md): nodes, endpoints, state and lifecycle
- [Backup and Recovery](plugins/matter/backup-restore.md): encrypted fabric backups and recovery
