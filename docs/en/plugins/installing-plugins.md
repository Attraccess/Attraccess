# Installing Plugins

<!-- llms-description: How to upload, enable, disable and remove plugins in the web interface, with troubleshooting. -->

Plugins are installed by uploading them through the Attraccess web interface. This page explains how to upload, enable and manage plugins.

## Prerequisites

- You must have **administrator access** to manage plugins
- The plugin system must not be disabled (see [Environment Variables](installation/environment-variables.md))

## Marketplace dependencies

Open **Settings → Plugins → Install plugin → Browse marketplace** and select a plugin. Its details and install confirmation show required plugins, including transitive dependencies, resolved versions, permissions, and whether each plugin will be installed or reused. Confirm once to install the complete tree. Dependency conflicts or cycles prevent installation and explain which packages need attention.

Updates and downgrades cannot break the dependency graph. If a required plugin is removed, the confirmation lists its dependants: cancel to keep it, or explicitly approve removing those plugins together. Automatically installed dependencies remain normal plugins. Removing a provider does not automatically remove its dependencies; npm removal retains plugin data and secrets.

If a dependency fails to load, its dependants stay inactive. Open the failure details in **Settings → Plugins**, repair or retry the failed dependency, then restart.

## Release channels

Official plugins are published to npm under these dist-tags:

| Tag      | Moved by               | Contents                                                                                                                                    |
| -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `latest` | Attraccess releases    | The plugin version published with an Attraccess release. **The marketplace shows and installs this version.**                               |
| `next`   | Nightly builds of main | Builds from green, hardware-gated main builds, versioned like `0.2.0-nightly.1180.1` (the plugin version, then `-nightly.<run>.<attempt>`). |
| `alpha`  | Nobody (legacy)        | Frozen builds from before release channels existed.                                                                                         |

### Which channel a host uses

Every Attraccess host has a plugin channel, set by the `ATTRACCESS_PLUGIN_CHANNEL` environment variable (see [Environment Variables](installation/environment-variables.md#plugins)):

- **Release images** use `latest`. The marketplace shows and installs the `latest` version, and prereleases are never installed automatically.
- **Nightly images** (`nightly-<sha>`, `nightly-latest`) use `next`. Their marketplace shows, and an install without a chosen version installs, the higher of the `next` and `latest` versions of a plugin that the host can run. A plugin without a `next` build, or whose `next` build needs a newer host, stays on `latest`. A nightly build always comes from the same commit range as the image, so the plugins match the host.

The version you choose explicitly (**Manage version** or the API) always wins.

### Nightly hosts follow `next`

A plugin installed on a nightly host from the marketplace, or through the API without a version, records `next` as its requested version. Under the default update policy, [automatic updates](#automatic-updates) then move it to the newest compatible build of `next` (or of `latest`, if that is higher): from one nightly to the next, and from a nightly to the release. Only plugins that request `next` are moved to nightly builds. This rule applies only while the global update policy was never saved; a saved policy applies as it is.

On a release host the default policy never installs a prerelease.

### Switching a plugin to `next`

A plugin that was installed as `latest` stays on `latest`, also on a nightly host. To switch it, open **Settings → Plugins**, open the installed plugin's actions menu (**⋯**), choose **Manage version** and enter `next` (or a specific nightly version) as **Requested version or channel**. You can also remove the plugin and install it again from the marketplace; its data is kept.

Once a plugin has had a release, the marketplace of a release host offers only released versions. npm sets `latest` automatically on a package's first publish, so a plugin first published by a nightly has a nightly `latest` until its first release. The release treats a nightly `latest` as never released and publishes the plugin.

## Automatic updates

Attraccess keeps plugins installed from npm up to date. This applies to every host, release and nightly. Plugins uploaded as a ZIP file are not updated.

- **Checks:** the host asks the plugin's registry for new versions about once an hour, and again when the maintenance window opens. **Settings → Plugins** shows when an update is available. You can also check at once with **Check all now** on that page.
- **Maintenance window:** updates are installed only inside this window, by default from 03:00 to 05:00. The times are the server's local time, which is UTC in the official Docker images unless you set `TZ`.
- **What is installed:** with the default policy, the newest compatible patch or minor release. Nightly hosts also move plugins that request `next` to nightly builds, as described above.
- **Never installed automatically:** a new major version, a version that asks for more permissions, a deprecated version, a version that is not compatible with the host, and an update that would also need other plugins installed or changed. Install those yourself with **Manage version**.
- **Restart:** after installing the updates that are due, Attraccess restarts once to activate them. Plan the window for a time when a short interruption is acceptable.
- **Failures:** if an update cannot be installed, the installed version stays, the server log names the reason and Attraccess tries that version again after 24 hours at the earliest. A newer version is tried without this pause. If a new version is installed but fails to load after the restart, Attraccess does not go back to the previous version: **Settings → Plugins** shows the error, and you can choose another version with **Manage version**. A later update is still installed automatically.
- **Audit log:** each automatic installation, successful or not, and its activation after the restart are recorded in the audit log without a user.

### Turning automatic updates off

For one plugin, open **⋯ → Manage version**, set **Plugin automatic update policy** to **Off** and save the version policy. **Patch only** limits the plugin to patch releases.

The global policy has no page in the web interface yet. An administrator who may manage plugins changes it with `POST /api/plugins/update-policy`:

| Request body                                                         | Effect                                         |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `{"checksEnabled": false}`                                           | No update checks and no automatic installation |
| `{"mode": "off"}`                                                    | Updates are not installed automatically        |
| `{"maintenanceWindow": {"startMinute": 60, "durationMinutes": 120}}` | The window runs from 01:00 to 03:00            |

A plugin whose own setting is not **Inherit global policy** uses that setting instead of the global mode. Disabled checks (`checksEnabled: false`) apply to every plugin.

> [!WARNING]
> A requested version does not hold a plugin at that version under **Patch only** or **Patch and minor**: if you install an older version, the next maintenance window can update it again. To keep a plugin at its current version, set its automatic update policy to **Off**. The requested version or range limits automatic updates only with **Follow package policy**.

## Uploading a Plugin

1. Open **Settings** in the sidebar and select the **Plugins** section
2. Click the **Upload Plugin** button
3. Select the plugin file from your computer
4. The plugin is uploaded and appears in the plugin list

<!-- TODO: Screenshot of upload plugin dialog -->

> [!NOTE]
> After uploading, the plugin may need to be enabled before it becomes active. See the next section.

## Enabling and Disabling Plugins

Plugins can be toggled on or off without removing them:

1. Open **Settings** in the sidebar and select the **Plugins** section
2. Find the plugin in the list
3. Toggle the **Enable/Disable** switch
4. The plugin becomes active or inactive immediately

<!-- TODO: Screenshot of plugin enable/disable toggle -->

> [!WARNING]
> Disabling a plugin removes its pages from the frontend and its API endpoints from the backend. Users will no longer be able to access features provided by the plugin until it is re-enabled.

## License missing

Some plugins need a paid license module: the **WAGO** plugin needs the `wago` module and the **Reservations** plugin
needs the `reservations` module. The free community license for private users and non-profits (the key for non-profit
use) includes neither module.

If the license does not cover a plugin, **Settings → Plugins** shows it with the status **License missing** and names
what it needs, for example "Requires license module: wago". The plugin is not loaded: it has no menu entries, pages,
flow nodes or background activity, and Attraccess shows no error message for it. A plugin that requires it as a
dependency does not load either and shows the usual dependency error.

When you save a valid license key in **Settings → General** that changes which plugins may load, Attraccess restarts
automatically and the plugin loads (or stops loading). Removing the key works the same way. If the change affects no
plugin, there is no restart. A key that is invalid, expired or cannot be verified never triggers a restart, because
Attraccess would refuse to start with it: correct the key first. A license that expires while Attraccess runs takes
effect at the next start. If a valid license shows **License missing**, the license could not be checked at startup:
restart Attraccess.

## Removing a Plugin

1. Open **Settings** in the sidebar and select the **Plugins** section
2. Find the plugin in the list
3. Open the plugin's actions menu (**⋯**) and choose **Remove plugin**
4. Confirm the removal

What happens to the plugin's data depends on how it was installed. The confirmation dialog says which case applies.

| Installed                                 | Files and registrations | Tables and data                                                                                        |
| ----------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| From a registry (marketplace, npm)        | Removed                 | **Kept**, together with the plugin's secrets. Installing it again continues with the data.             |
| Uploaded as ZIP or placed in the folder   | Removed                 | **Deleted permanently.**                                                                               |
| Refused (for example a 1.x plugin on 2.0) | Removed, code never run | **Kept.** A 2.0 build of the plugin adopts them later, or you drop the tables in the database by hand. |

> [!WARNING]
> Removing an uploaded plugin deletes its data permanently. Create a [backup](installation/backup-restore.md) first if
> you might need it again, and re-upload the plugin file to use the plugin again.

## Upgrading to Attraccess 2.0

Attraccess 2.0 changed the plugin SDK: plugins have no database access any more and keep their own data in tables the
host manages (see [Plugin Storage](plugins/plugin-storage.md)). Plugins built for 1.x are not loaded: they stay in the
plugin list with an error that names the plugin, states the reason and links the
[migration guide](plugins/migrating-to-2.md). Typical reasons:

- the plugin targets the SDK 1.x (it declares no minimum host version of `2.0.0-0` or higher);
- it requests the removed `DATABASE_ACCESS` permission (2.0 plugins ask for `PLUGIN_STORAGE`);
- it still declares `persistence.backends` or a TypeORM migrations entry, or its bundle imports TypeORM or a database
  driver.

Every 1.x installation keeps its data in SQLite and moves it to PostgreSQL on the first start of 2.0. That move takes
only the core data: plugin data is not moved, so every plugin starts with empty storage and has to be set up again (see
[Plugin data is not moved](installation/updating.md#plugin-data-is-not-moved)). Install the 2.0 builds after the
upgrade, and delete the refused 1.x builds from the list. Deleting a refused plugin removes its files without running
its code.

## Troubleshooting

If a plugin does not work as expected:

- Check that the plugin is **enabled** in the plugin list
- Check that its status is not **License missing** (see [License missing](#license-missing))
- Verify that the `DISABLE_PLUGINS` environment variable is not set to `true`
- Check the server logs for error messages related to the plugin
- Contact the plugin developer for support

## See Also

- [Plugins Overview](plugins/overview.md) -- What are plugins?
- [Developing Plugins](plugins/developing-plugins.md) -- Build your own plugins
- [Environment Variables](installation/environment-variables.md) -- Plugin-related settings
