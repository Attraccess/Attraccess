# Shelly
<!-- llms-description: Das Plugin Shelly führt ein Register der Shelly-Geräte in Ihrem Netzwerk mit Suche, Geräteinformationen, Admin-Passwort-Verwaltung und Firmware-Updates. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Shelly** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Das Plugin **Shelly** führt ein Register der Shelly-Geräte in Ihrem Netzwerk; Sie verwalten die Geräte direkt in Attraccess.
Das Hinzufügen oder Entfernen eines Eintrags im Register verändert die Geräte selbst nicht.

## Voraussetzungen

- Attraccess 1.11.0 oder neuer und das Plugin `shelly`, installiert wie unter
  [Plugins installieren](plugins/installing-plugins.md) beschrieben. Es benötigt die Berechtigung `PLUGIN_STORAGE` für seine eigenen Tabellen.
- Shelly-Geräte, die der Attraccess-Server über das Netzwerk per IP-Adresse erreicht.
- Nutzer benötigen die Berechtigung **Ressourcen verwalten** (`resources.update`), um die Seite zu öffnen.
- Läuft Attraccess in einem Container, ist dessen Netzwerk nicht Ihr LAN. Geben Sie beim Suchen das Subnetz Ihrer Geräte
  an.

## Wo es erscheint

**Shelly** in der Seitenleiste öffnet die Seite **Shelly-Geräte**, eine Tabelle mit Gerät, Adresse, Modell,
Authentifizierungsstatus und Firmware.

## Was Sie tun können

- **Gerät hinzufügen:** Geben Sie die IP-Adresse des Geräts ein. Attraccess prüft `GET /shelly`, um Generation und
  Modell zu erkennen. Der Name ist optional.
- **Suchen:** Der Bereich **Geräte suchen** lauscht auf Geräte, die sich per mDNS melden, und prüft danach jede Adresse
  eines Subnetzes. Lassen Sie das Subnetz leer, um die eigenen Netze des Servers zu durchsuchen. Erlaubt sind nur
  private Bereiche bis höchstens /22. Alles Gefundene wird ins Register übernommen.
- **Geräteinformationen anzeigen:** Name, Generation, Zeitzone, Betriebszeit, Netzwerk und WLAN-Signal sowie der
  Ausgangszustand mit Leistung, Spannung und Stromstärke. Ein Gerät mit Authentifizierung fragt zuerst nach seinem Admin-Passwort.
- **Admin-Passwort festlegen:** Legen Sie das Admin-Passwort fest oder ändern Sie es; es schützt die lokale
  Weboberfläche und API des Geräts. Ist für das Gerät bereits die Authentifizierung aktiviert, geben Sie zusätzlich das
  aktuelle Passwort ein.
- **Firmware verwalten:** Prüfen Sie, ob im stabilen oder im Beta-Kanal Firmware-Aktualisierungen
  verfügbar sind, und installieren Sie sie. Das Gerät startet
  beim Update neu und ist kurz offline.
- **Gerät erneut prüfen** aktualisiert Generation, Modell und Authentifizierungsstatus, **Gerät löschen** entfernt es aus
  dem Register.

## Siehe auch

- [Plugins installieren](plugins/installing-plugins.md)
- [Plugins entwickeln](plugins/developing-plugins.md)
