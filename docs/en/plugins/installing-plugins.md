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

## Restart to apply changes

Installing, updating, downgrading, uploading or removing a plugin saves the change to disk, but Attraccess keeps
running. The change takes effect after the next restart, so you can install or update several plugins first and
restart once.

While changes are pending, plugin administrators (users with the `system.plugins.manage` permission) see a
**Restart required** banner at the top of every page. It cannot be dismissed. Choose **Restart now** in the banner and
confirm: Attraccess is unavailable for a moment, open sessions and reader connections reconnect on their own, and the
page reloads when the server is back. The banner then disappears and the changed plugins are active.

- Until the restart, an installed or updated plugin is on disk but not loaded. An updated plugin keeps running in its
  old version, and its pages stay on that version too.
- A removed plugin keeps running in the background until the restart, but it is no longer listed and can no longer
  add readers or use Bluetooth. Removing a plugin reloads the page once, because its pages are gone.
- Two actions still restart Attraccess at once: **Retry** on a plugin that failed to load, and a license key change
  that changes which plugins may load (see [License missing](#license-missing)). Such a restart also applies pending
  changes.
- [Automatic updates](#automatic-updates), if a plugin manager turned them on, restart Attraccess themselves inside
  their update window. That restart also applies pending changes.
- With several API instances, each instance tracks its own pending changes, and **Restart now** restarts the instance
  that answers the request.

## Release channels

Official plugins are published to npm under these dist-tags:

| Tag      | Moved by               | Contents                                                                                                                                    |
| -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `latest` | Attraccess releases    | The plugin version published with an Attraccess release. **A release host's marketplace shows and installs this version.**                  |
| `next`   | Nightly builds of main | Builds from green, hardware-gated main builds, versioned like `0.2.0-nightly.1180.1` (the plugin version, then `-nightly.<run>.<attempt>`). |
| `alpha`  | Nobody (legacy)        | Frozen builds from before release channels existed.                                                                                         |

### Which channel a host uses

Every Attraccess host has a plugin channel, set by the `ATTRACCESS_PLUGIN_CHANNEL` environment variable (see [Environment Variables](installation/environment-variables.md#plugins)):

- **Release images** use `latest`. The marketplace shows and installs the `latest` version.
- **Nightly images** (`nightly-<sha>`, `nightly-latest`) use `next`. Their marketplace shows, and an install without a chosen version installs, the higher of the `next` and `latest` versions of a plugin that the host can run. A plugin without a `next` build, or whose `next` build needs a newer host, stays on `latest`. `next` points to the newest nightly build of a plugin, which can be newer than your image.

The version you choose explicitly (**Manage version** or the API) always wins.

### Nightly hosts and `next`

A plugin installed on a nightly host from the marketplace, or through the API without a version, records `next` as its requested version. The host then offers newer `next` builds (or `latest`, if that is higher) as updates: from one nightly to the next, and from a nightly to the release. **It installs none of them on its own** until a plugin manager turns [automatic updates](#automatic-updates) on. Plugins that request `latest` are offered releases only. A release host never offers a nightly build through `next`.

### The Manage version dialog

The **Manage version** dialog shows the current version, the available versions (versions that cannot be installed
say why; older ones of those are folded away behind **Show … older incompatible versions**), the changes and approvals of the version you select, and the package's **Update settings**. Saving the
update settings only changes which versions update checks offer; it installs nothing. **Update to …** or
**Downgrade to …** installs the selected version, which takes effect after a [restart](#restart-to-apply-changes).

### Switching a plugin to `next`

A plugin that was installed as `latest` stays on `latest`, also on a nightly host. To switch it, open **Settings → Plugins**, open the installed plugin's actions menu (**⋯**), choose **Manage version**, enter `next` (or a specific nightly version) as **Requested version or channel** under **Update settings** and click **Save update settings**. Then select the version under **Available versions**, click **Update to …** and [restart](#restart-to-apply-changes). **Update to …** alone does not save what you typed. You can also remove the plugin and install it again from the marketplace; its data is kept.

Once a plugin has had a release, the marketplace of a release host offers only released versions. npm sets `latest` automatically on a package's first publish, so a plugin first published by a nightly has a nightly `latest` until its first release. The release treats a nightly `latest` as never released and publishes the plugin.

## Automatic updates

Attraccess can install updates of plugins installed from npm on its own and restart to activate them. This is **off by default on every host**, release and nightly: until a plugin manager turns it on, Attraccess installs no update and restarts for none. Plugins uploaded as a ZIP file are not updated.

**Looking for updates is on by default** and installs nothing. About once an hour, and again when an update window opens, the host asks each plugin's registry for newer versions. **Settings → Plugins** announces the updates the update step and the safeguards below allow; newer versions outside them are listed only under **Manage version**. **Check all now** on that page checks at once.

### Turning automatic updates on

You need the permission to manage plugins (`system.plugins.manage`).

1. Open **Settings → Plugins**. The **Automatic updates** panel is at the top.
2. Switch on **Install updates automatically**.
3. Choose the **Largest update step**:
   - **Patch only**
   - **Patch and minor** (the preselected step; minor releases of `0.x` versions count as minor)
   - **Follow package policy**: updates within each plugin's requested version, range or channel
4. Choose at least one **weekday**, the **start time**, the **duration** (1 minute to 24 hours) and the **time zone**. The time zone is filled in from your browser until one has been saved.
5. Check the **next update window** shown below the fields, click **Turn on automatic updates** and confirm.

To turn them off again, switch **Install updates automatically** off and save. With **Check for plugin updates** off, nothing is looked up and nothing is installed.

### The update window

- Attraccess **installs updates and restarts only inside the window**, on the chosen weekdays. After installing the updates that are due, it restarts once, without waiting for the [Restart required](#restart-to-apply-changes) banner; that restart also applies changes made by hand that still wait for one. The restart interrupts use for a short time, so choose a time when that is acceptable.
- A window belongs to the weekday on which it starts and may run past midnight: a Monday window starting at 23:00 for two hours ends on Tuesday at 01:00.
- The start is a clock time in the chosen time zone, so daylight saving changes do not move it. A start time that the clock skips on that night moves forward by the skipped hour; one that occurs twice opens the window the first time. The duration is elapsed time. The server's own time zone (`TZ`) does not matter.
- Attraccess does not start an installation in the last two minutes of a window (in windows shorter than four minutes: in their second half). If an installation is still running when the window closes, or automatic updates are switched off in the meantime, Attraccess does not restart then. The **Restart required** banner stays until you choose **Restart now**, Attraccess restarts for another reason, or an update window opens while automatic updates are on.

### What is installed

- The newest version the update step allows. On a nightly host, plugins that request `next` also move to newer nightly builds with **Patch and minor** and **Follow package policy** (**Patch only** keeps them where they are, except for patch releases).
- **Never installed automatically:** a new major version, a version that asks for more permissions, a deprecated version, a version that is not compatible with the host, an update that would also need other plugins installed or changed, a version published by a different npm user than the installed one, and any version from a registry on another machine that does not use HTTPS. On a release host, prereleases are not installed either, unless `prerelease` was set to `true` through the [API](#api). Install those yourself with **Manage version**.
- **Failures:** if an update cannot be installed, the installed version stays, the server log names the reason and Attraccess tries that version again after 24 hours at the earliest. A newer version is tried without this pause. If a new version is installed but fails to load after the restart, Attraccess does not go back to the previous version: **Settings → Plugins** shows the error, and you can choose another version with **Manage version**. A later update is still installed automatically.
- **Audit log:** changes to these settings are recorded with the user who made them. Each automatic installation, successful or not, and its activation after the restart are recorded without a user (shown as **System or anonymous**).

### Settings for a single plugin

Under **⋯ → Manage version**, **Plugin automatic update policy** replaces the global update step for that plugin: **Off**, **Patch only**, **Patch and minor** or **Follow package policy**; **Inherit global policy** uses the global one. The global switch comes first: **while automatic updates are off, no plugin setting installs anything**. The weekdays and the window always apply.

> [!WARNING]
> A requested version does not hold a plugin at that version under **Patch only** or **Patch and minor**: if you install an older version, the next update window can update it again. To keep a plugin at its current version, set its automatic update policy to **Off**. The requested version or range limits automatic updates only with **Follow package policy**.

### After upgrading Attraccess

An update policy saved through the API by an earlier version does not count as turned on: after the upgrade, automatic updates are **off**. Whether the host looks for updates is kept, and the old daily window is kept as a schedule on every weekday in UTC. Plugin settings other than **Inherit global policy** and **Off** are reset to **Inherit global policy**. The server log says so once. A plugin manager turns automatic updates on in the panel.

### API

The panel uses `GET` and `POST /api/plugins/update-policy` (permission `system.plugins.manage`). `POST` changes the fields it contains:

```json
{
  "checksEnabled": true,
  "automaticUpdates": true,
  "mode": "minor",
  "schedule": { "weekdays": [1, 2, 3, 4, 5], "startMinute": 120, "durationMinutes": 120, "timeZone": "Europe/Berlin" },
  "prerelease": false
}
```

Weekdays are numbered from 1 (Monday) to 7 (Sunday), and `startMinute` is the minute of the day (120 is 02:00). Without a time zone the host uses UTC. Invalid values, and switching on without a weekday, are answered with `400`.

## Uploading a Plugin

1. Open **Settings** in the sidebar and select the **Plugins** section
2. Click the **Upload Plugin** button
3. Select the plugin file from your computer
4. The plugin is uploaded and appears in the plugin list. It becomes active after a
   [restart](#restart-to-apply-changes).

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
