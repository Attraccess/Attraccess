# Matter
<!-- llms-description: Das Plugin Matter verbindet Attraccess mit einem separaten Matter-Sidecar, der die Matter-Fabric hält; Überblick, Voraussetzungen und Links zu den Anleitungen. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Matter** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Das Plugin **Matter** ist die Grundlage für die Unterstützung von Matter-Smart-Home-Geräten in Attraccess. Es verbindet
sich mit einem separaten **Matter-Sidecar**-Prozess, der als Einziger den Matter-Stack ausführt. Ein Administrator
erstellt und verwaltet in Attraccess die Matter-Fabric, ihre verschlüsselten Backups und die Wiederherstellung. Im
aktuellen Release steuert der Sidecar noch keine Geräte und listet auch keine auf, daher gibt es noch keine
Geräte-Oberfläche.

## Voraussetzungen

- Attraccess 1.11.0 oder neuer und das Plugin `matter`, installiert wie unter
  [Plugins installieren](plugins/installing-plugins.md) beschrieben. Es benötigt die Berechtigungen `DATABASE_ACCESS`
  und `MANAGE_SECRETS`.
- Der **Matter-Sidecar**, ein separater Node.js-Prozess oder Container (Node.js `>=24.22.1 <25`), den Sie selbst bauen,
  absichern und betreiben. Attraccess spricht ihn mit einem Service-Token an. Siehe die
  [Betriebsanleitung](plugins/matter/operator.md).
- Netzwerkzugriff vom Sidecar zu Ihren Matter-Geräten (mDNS und UDP), sobald eine Fabric existiert.

## Wo es erscheint

Eine Admin-Seite unter **Geräte → Matter** in der Seitenleiste mit den Verbindungseinstellungen zum Sidecar (URL,
Service-Token, optional CA-Zertifikat), der Fabric, ihren Backups und der Wiederherstellung.

## In diesem Bereich

- [Architektur](plugins/matter/architecture.md): Plugin plus Sidecar, Vertrag, Fehler und Ereignisse
- [Betriebsanleitung](plugins/matter/operator.md): Sidecar bauen und starten, Konfiguration, Attraccess verbinden
- [Datenmodell und Lebenszyklus](plugins/matter/data-model.md): Knoten, Endpunkte, Zustand und Lebenszyklus
- [Backup und Wiederherstellung](plugins/matter/backup-restore.md): verschlüsselte Fabric-Backups und Wiederherstellung
