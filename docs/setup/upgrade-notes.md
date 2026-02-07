# Upgrade Notes

This page lists version-specific steps required when upgrading.

## v1.5.0 - settings stored in DB

**What changed**
System settings (URLs, license key, and SMTP configuration) are now stored in the database.
A one-time migration copies values from env vars into the DB **only if no settings exist yet**.

**Notes**
- After upgrading to v1.5.0 and verifying settings in the admin UI, you can remove
  the related env vars:
- `ATTRACCESS_FRONTEND_URL`
- `FRONTEND_URL`
- `ATTRACCESS_URL`
- `VITE_ATTRACCESS_URL`
- `ATTRACCESS_PUBLIC_INTERNET_URL`
- `LICENSE_KEY`
- `SMTP_SERVICE`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## v1.4.0 - appuser introduced

**What changed**
The runtime container now runs as an unprivileged user `appuser`.

**Symptoms**
- API logs show `SQLITE_READONLY` errors.
- Storage is not writable.

**Fix: update storage ownership**

If your storage is a **bind mount on the host**, `appuser` does not exist on the host.
Use numeric ownership based on the container's `appuser` IDs:

```
docker exec <attraccess container id> id -u appuser
docker exec <attraccess container id> id -g appuser
chown -R <uid>:<gid> /path/to/storage
```

If you want to run it **inside the container**, you must exec as root (no sudo in the image):

```
docker exec --user 0 -it <attraccess container id> sh
chown -R appuser:appuser /app/storage
```

For Docker Compose:

```
docker compose exec --user 0 <attraccess container id> sh
chown -R appuser:appuser /app/storage
```

**Notes**
- On the host, `chown appuser:appuser` fails unless you create that user.
- The `appuser` UID/GID can vary between images unless explicitly pinned.
- Some storage backends (NFS/SMB) may block ownership changes. Update ownership
  on the storage server or adjust mount options.

### Storage ownership auto-init (current images)

Newer images automatically set ownership of the storage directory at container startup. This applies to both fresh volumes and existing mounts, so you typically do not need to run a manual chown. If you still see permission issues (e.g. NFS/SMB), use the manual fix above.
