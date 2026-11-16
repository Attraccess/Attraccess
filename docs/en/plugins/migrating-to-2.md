# Migrating Plugins to SDK 2.0

<!-- llms-description: What plugin developers must change for Attraccess 2.0: the minimum host version, the declared database engines and how the host refuses older plugins. -->

Attraccess 2.0 separates plugins from the database engine. This is a breaking change for plugins built for 1.x.

## What the host enforces

- **Minimum host version.** `plugin.json` must declare `attraccessVersion.min` of `2.0.0-0` or higher. For npm plugins
  the lowest version allowed by `attraccess.host` in `package.json` counts. A plugin below that, or without a minimum,
  is refused when it is uploaded, installed or started. The error names the plugin and links this guide. Nothing is
  extracted, installed or migrated, and the database is not touched.
- **Declared engines.** A plugin that stores data (it has a migrations entry or the `DATABASE_ACCESS` permission) must
  declare the engines its persistence supports:

  ```json
  { "persistence": { "backends": ["sqlite"] } }
  ```

  For npm plugins the same object goes into the `attraccess` block of `package.json`. If the host runs an engine that
  is not listed, the plugin is not installed, migrated or started, and no data changes.

- **Permissions are unchanged.** `DATABASE_ACCESS` and the other permissions still gate what a plugin may use. Install,
  start and uninstall migrations and the plugin migration history safeguards work as before.

## Checklist

1. Set `attraccessVersion.min` to `2.0.0-0` (and `attraccess.host` to `^2.0.0-0` for npm packages).
2. Raise the peer dependency and `attraccess.sdk` ranges on `@attraccess/plugins-backend-sdk`, `-frontend-sdk` and
   `-frontend-ui` to `^2.0.0-0`.
3. Add `persistence.backends` if the plugin stores data.
4. Rebuild and test the plugin against a 2.0 host.

The examples under `examples/` and the built-in plugins (Shelly, WAGO, Matter, Reservations, RabbitMQ) show the 2.0
manifest.
