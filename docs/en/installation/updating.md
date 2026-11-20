# Updating

<!-- llms-description: How to check for new Attraccess versions and update with Docker Compose, plain Docker or Portainer, pin a specific version, and upgrade to 2.0 through 1.11. -->

How to update Attraccess to the latest version.

## Check if a new version is available

If you have the **Manage System Configuration** permission, Attraccess shows a banner at the top of every page when a newer release is available on GitHub. The banner links to:

- The full release notes for the new version
- This updating guide

You can also check manually at any time by comparing your running version (shown at `GET /api/version`) against the [GitHub releases page](https://github.com/Attraccess/Attraccess/releases).

## Before Updating

> [!TIP]
> Create a [backup](installation/backup-restore.md) of your data before each update.

Check the [release notes](https://github.com/Attraccess/Attraccess/releases) for breaking changes before updating.

> [!WARNING]
> **Attractap readers pair again after the release that removes token sign-in (Attractap firmware 2.6.0).**
> Its first start deletes every reader record, together with reader names, resource links, per-reader
> settings and the card writer's reader choice. Every reader has to be paired again. Readers that still
> sign in with a token cannot update over the air; flash them to firmware 2.6.0 over USB with the web
> flasher first. See [After the upgrade: every reader pairs again](attractap/pairing.md#after-the-upgrade-every-reader-pairs-again).

## Upgrading to Attraccess 2.0

Attraccess 2.0 takes over the data of plugins (WAGO, Matter, Shelly, Reservations and others) only from the last 1.x
release, **Attraccess 1.11**. Update in two steps:

1. Create a [backup](installation/backup-restore.md).
2. Update to Attraccess 1.11 (pin the newest `v1.11.x` tag, see [Pinning a specific version](#pinning-a-specific-version))
   and start it **once**, so every plugin finishes its migrations. Check in **Settings → Plugins** that all plugins
   load.
3. Create another backup, then update to 2.0.

If you skip step 2, for example coming from 1.10, Attraccess 2.0 refuses each affected plugin with a message such as:
"Attraccess 2.0 adopts the data of plugin "wago" only from the last 1.x release (1.11). Restore the backup taken before
this upgrade, update to Attraccess 1.11 and start it once so the plugin's migrations finish, then update to 2.0."
Nothing is changed in that case: follow the message.

Plugins built for 1.x do not load on 2.0 at all; install their 2.0 builds (see
[Upgrading to Attraccess 2.0](plugins/installing-plugins.md#upgrading-to-attraccess-20) in the plugin guide).

## Docker Compose

```bash
cd /path/to/attraccess

# Pull the latest image
docker compose pull

# Restart the container with the new image
docker compose up -d
```

Attraccess runs database migrations automatically on startup. Within a major version no manual steps are required.
Upgrading from 1.x to 2.0 needs one extra step, see [Upgrading to Attraccess 2.0](#upgrading-to-attraccess-20).

## Plain Docker

```bash
# Stop and remove the running container (data volumes are preserved)
docker stop attraccess && docker rm attraccess

# Pull the latest image from Docker Hub or GHCR
docker pull attraccess/attraccess:latest
# or:
docker pull ghcr.io/attraccess/attraccess:latest

# Recreate the container with the same volumes/env you used before
docker run -d --name attraccess ... attraccess/attraccess:latest
```

## Portainer

1. Open Portainer
2. Navigate to **Stacks** → `attraccess`
3. Click **Pull and redeploy**
4. Confirm the action

## Pinning a specific version

By default the `latest` tag tracks the newest release. To pin to a specific version, replace `latest` with the desired semver tag (for example `v0.1.2`) in your `docker-compose.yml`:

```yaml
services:
  attraccess:
    image: attraccess/attraccess:v0.1.2
```

Then run `docker compose up -d` to apply.

## Troubleshooting

If problems occur after an update:

1. Check the logs:
   ```bash
   docker compose logs -f attraccess
   ```
2. Restore a [backup](installation/backup-restore.md) if needed
3. Report issues on [GitHub](https://github.com/Attraccess/Attraccess/issues)

## See Also

- [Backup & Restore](installation/backup-restore.md)
- [Common Issues](faq/common-issues.md)
