# Installing Plugins

Plugins are installed by uploading them through the Attraccess web interface. This page explains how to upload, enable and manage plugins.

## Prerequisites

- You must have **administrator access** to manage plugins
- The plugin system must not be disabled (see [Environment Variables](installation/environment-variables.md))

## Uploading a Plugin

1. Navigate to **Plugins** in the sidebar
2. Click the **Upload Plugin** button
3. Select the plugin file from your computer
4. The plugin is uploaded and appears in the plugin list

<!-- TODO: Screenshot of upload plugin dialog -->

> [!NOTE]
> After uploading, the plugin may need to be enabled before it becomes active. See the next section.

## Enabling and Disabling Plugins

Plugins can be toggled on or off without removing them:

1. Navigate to **Plugins** in the sidebar
2. Find the plugin in the list
3. Toggle the **Enable/Disable** switch
4. The plugin becomes active or inactive immediately

<!-- TODO: Screenshot of plugin enable/disable toggle -->

> [!WARNING]
> Disabling a plugin removes its pages from the frontend and its API endpoints from the backend. Users will no longer be able to access features provided by the plugin until it is re-enabled.

## Removing a Plugin

1. Navigate to **Plugins** in the sidebar
2. Find the plugin in the list
3. Click the **Remove** or **Delete** button
4. Confirm the removal

> [!WARNING]
> Removing a plugin permanently deletes it from the system. You will need to re-upload the plugin file if you want to use it again.

## Troubleshooting

If a plugin does not work as expected:

- Check that the plugin is **enabled** in the plugin list
- Verify that the `DISABLE_PLUGINS` environment variable is not set to `true`
- Check the server logs for error messages related to the plugin
- Contact the plugin developer for support

## See Also

- [Plugins Overview](plugins/overview.md) -- What are plugins?
- [Developing Plugins](plugins/developing-plugins.md) -- Build your own plugins
- [Environment Variables](installation/environment-variables.md) -- Plugin-related settings
