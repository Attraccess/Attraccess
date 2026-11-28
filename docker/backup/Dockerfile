# Backup sidecar: scheduled restic backups of the Attraccess database (pg_dump) and the volumes of the stack.
# See README.md. Used by docker-compose.balena.yml (`backup` service).
FROM alpine:3.23.8

# postgresql18-client matches the postgres:18 server image; restic ships the repository backends (s3, b2, sftp, rest, rclone via env).
RUN apk add --no-cache restic postgresql18-client tzdata ca-certificates

COPY lib.sh backup.sh restore.sh entrypoint.sh /usr/local/lib/attraccess-backup/
RUN chmod 0755 /usr/local/lib/attraccess-backup/*.sh && \
    ln -s /usr/local/lib/attraccess-backup/entrypoint.sh /usr/local/bin/attraccess-backup

# Scratch space for dumps, the restic cache, the lock and the last-success metric. Mount a volume here.
VOLUME ["/var/lib/backup"]
# Status of the scheduler (`status`: enabled/disabled), shared read-only with the attraccess service, which waits for
# it. World-readable so the volume created from it is too.
RUN mkdir -p /var/lib/backup-status && chmod 0755 /var/lib/backup-status
ENTRYPOINT ["/usr/local/lib/attraccess-backup/entrypoint.sh"]
CMD ["run"]
