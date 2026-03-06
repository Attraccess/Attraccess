# Aktualisierung

So aktualisieren Sie Attraccess auf die neueste Version.

## Docker Compose

```bash
cd /pfad/zu/attraccess

# Neuestes Image herunterladen
docker compose pull

# Container mit neuem Image neustarten
docker compose up -d
```

Attraccess führt Datenbankmigrationen automatisch beim Start durch. Es sind keine manuellen Schritte nötig.

## Portainer

1. Öffnen Sie Portainer
2. Navigieren Sie zu **Stacks** → `attraccess`
3. Klicken Sie auf **Pull and redeploy**
4. Bestätigen Sie die Aktion

## Vor der Aktualisierung

> [!TIP]
> Erstellen Sie vor jeder Aktualisierung ein [Backup](installation/backup-restore.md) Ihrer Daten.

Überprüfen Sie die [Release-Notes](https://github.com/Attraccess/Attraccess/releases) auf wichtige Änderungen, bevor Sie aktualisieren.

## Fehlerbehebung

Falls nach einer Aktualisierung Probleme auftreten:

1. Prüfen Sie die Logs:
   ```bash
   docker compose logs -f attraccess
   ```
2. Stellen Sie bei Bedarf ein [Backup](installation/backup-restore.md) wieder her
3. Melden Sie Probleme auf [GitHub](https://github.com/Attraccess/Attraccess/issues)

## Siehe auch

- [Backup & Wiederherstellung](installation/backup-restore.md)
- [Häufige Probleme](faq/common-issues.md)
