# Matter

<!-- llms-description: The Matter plugin connects Attraccess to a separate Matter sidecar that holds the Matter fabric; overview, prerequisites and links to the guides. -->

> [!NOTE]
> Only available when the **Matter** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

The **Matter** plugin is the foundation for Matter smart-home device support in Attraccess. It connects to a separate
**Matter sidecar** process, which is the only part that runs the Matter stack. An administrator creates and manages
the Matter fabric, its encrypted backups and recovery from Attraccess. In the current release the sidecar does not
control or list devices yet, so there is no device UI.

## Prerequisites

- Attraccess 2.0 or newer and the `matter` plugin, installed as described in
  [Installing Plugins](plugins/installing-plugins.md). It needs the `PLUGIN_STORAGE` and `MANAGE_SECRETS`
  permissions.
- Upgrading a 1.x (SQLite) installation does not move the plugin's data: the plugin starts empty on PostgreSQL and
  has to be set up again (see [Moving from SQLite to PostgreSQL](installation/updating.md#moving-from-sqlite-to-postgresql)).
- The **Matter sidecar**, a separate Node.js process or container (Node.js `>=26.13.0 <27`) that you build, secure
  and run yourself. Attraccess talks to it with a service token. See the [Operator Guide](plugins/matter/operator.md).
- Network access from the sidecar to your Matter devices (mDNS and UDP) once a fabric exists.

## Where it appears

An admin page under **Devices → Matter** in the sidebar, with tabs for devices, infrastructure (the sidecar connection
settings, the fabric, its backups and recovery), Thread network, commissioning, health and software updates.

## In this section

- [Architecture](plugins/matter/architecture.md): plugin plus sidecar, contract, errors and events
- [Administration Page](plugins/matter/admin-ui.md): the tabs under Devices → Matter, permissions, degraded states and the device lifecycle UI
- [Operator Guide](plugins/matter/operator.md): build and start the sidecar, configuration, connecting Attraccess
- [Data Model and Lifecycle](plugins/matter/data-model.md): nodes, endpoints, state and lifecycle
- [Backup and Recovery](plugins/matter/backup-restore.md): encrypted fabric backups and recovery
