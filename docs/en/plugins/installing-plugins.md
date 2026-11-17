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

To try a nightly, open **Settings → Plugins**, choose **Manage version** on the installed plugin and enter `next` (or a specific nightly version) as **Requested version or channel**. Nightly versions are prereleases, so they are never installed automatically.

Once a plugin has had a release, the marketplace offers only released versions. Until then:

- The WAGO, Shelly and RabbitMQ `latest` versions stay at a nightly build (`0.1.0-nightly.925.2`, for hosts `^1.9.0`) until Attraccess 1.11.0 publishes them as stable versions. Current plugin code requires Attraccess 1.11 or newer, so `0.1.0-nightly.925.2` stays the version for older hosts.
- npm sets `latest` automatically on a package's first publish. A plugin first published by a nightly (like Matter) therefore has a nightly `latest` until its first release. The release treats a nightly `latest` as never released and publishes the plugin.

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
3. Click the **Remove** or **Delete** button
4. Confirm the removal

> [!WARNING]
> Removing a plugin permanently deletes it from the system. You will need to re-upload the plugin file if you want to use it again.

## Upgrading to Attraccess 2.0

Attraccess 2.0 changed the plugin SDK. Plugins built for 1.x are not loaded: they stay in the plugin list with an error
that names the plugin and links the [migration guide](plugins/migrating-to-2.md), and their data is left untouched.
Before or right after upgrading, install the 2.0 build of each plugin (upload or marketplace), or delete the old plugin
from the list. Deleting a refused plugin removes its files without running its code.

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
