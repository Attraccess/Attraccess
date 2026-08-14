# Plugins

The plugin system allows you to extend Attraccess with additional functionality. Plugins can add new pages to the frontend, new API endpoints to the backend, or both.

## What are Plugins?

Plugins are self-contained extensions that integrate into Attraccess. They are uploaded as files through the web interface and can be enabled or disabled at any time.

A plugin can:

- Add new **pages and components** to the Attraccess frontend
- Add new **API endpoints** to the backend
- Combine both frontend and backend functionality

## Plugin Management

Plugins are managed in the **Plugins** section of **Settings**. From there, administrators can:

- View all installed plugins
- Upload new plugins
- Enable or disable plugins
- Remove plugins

<!-- TODO: Screenshot of plugin management page -->

> [!NOTE]
> Plugin management requires administrator access. Regular users cannot install, enable or remove plugins.

## Plugin SDKs

Attraccess provides SDKs for plugin development:

| SDK | Purpose |
|-----|---------|
| `@attraccess/plugins-frontend-sdk` | Build frontend extensions (pages, components) |
| `@attraccess/plugins-backend-sdk` | Build backend extensions (API endpoints) |

For more information on developing plugins, see [Developing Plugins](plugins/developing-plugins.md).

## Environment Variables

Plugin behavior can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PLUGIN_DIR` | `/app/storage/plugins` | Directory where plugins are stored |
| `DISABLE_PLUGINS` | `false` | Disable the entire plugin system |

See [Environment Variables](installation/environment-variables.md) for the full list.

## See Also

- [Installing Plugins](plugins/installing-plugins.md) -- Upload and manage plugins
- [Developing Plugins](plugins/developing-plugins.md) -- Build your own plugins
- [Environment Variables](installation/environment-variables.md) -- Plugin-related settings
