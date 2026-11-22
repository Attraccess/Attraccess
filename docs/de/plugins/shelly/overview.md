# Shelly

<!-- llms-description: Das Plugin Shelly führt ein Register der Shelly-Geräte in Ihrem Netzwerk mit Suche, Einrichtung neuer Geräte über Bluetooth, Geräteinformationen, Admin-Passwort-Verwaltung und Firmware-Updates. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **Shelly** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Das Plugin **Shelly** führt ein Register der Shelly-Geräte in Ihrem Netzwerk; Sie verwalten die Geräte direkt in Attraccess.
Das Hinzufügen oder Entfernen eines Eintrags im Register verändert die Geräte selbst nicht.

## Voraussetzungen

- Attraccess 2.0 oder neuer und das Plugin `shelly`, installiert wie unter
  [Plugins installieren](plugins/installing-plugins.md) beschrieben. Es benötigt die Berechtigung `PLUGIN_STORAGE` für seine eigenen Tabellen.
- Das Upgrade einer 1.x-Installation (SQLite) übernimmt die Daten des Plugins nicht: Das Plugin startet auf
  PostgreSQL leer und muss neu eingerichtet werden (siehe
  [Umzug von SQLite auf PostgreSQL](installation/updating.md#umzug-von-sqlite-auf-postgresql)).
- Shelly-Geräte, die der Attraccess-Server über das Netzwerk per IP-Adresse erreicht. Ein neues Gerät, das noch nicht im
  Netzwerk ist, lässt sich über Bluetooth einrichten (siehe unten); es muss danach aber per IP-Adresse erreichbar sein.
- Nutzer benötigen die Berechtigung **Ressourcen verwalten** (`resources.update`), um die Seite zu öffnen.
- Läuft Attraccess in einem Container, ist dessen Netzwerk nicht Ihr LAN. Geben Sie beim Suchen das Subnetz Ihrer Geräte
  an.

## Wo es erscheint

**Shelly** in der Seitenleiste öffnet die Seite **Shelly-Geräte**, eine Tabelle mit Gerät, Adresse, Modell,
Authentifizierungsstatus und Firmware.

## Was Sie tun können

- **Über Bluetooth einrichten:** Nehmen Sie ein zurückgesetztes Gerät aus Ihrem Browser heraus in Ihr WLAN auf, siehe
  [Neues Gerät über Bluetooth einrichten](#neues-gerät-über-bluetooth-einrichten).
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

## Neues Gerät über Bluetooth einrichten

Ein zurückgesetzter Shelly ist nicht in Ihrem Netzwerk, daher erreicht Attraccess ihn nicht per IP-Adresse.
**Über Bluetooth einrichten** verbindet sich aus Ihrem Browser mit dem Gerät, vergibt ein Admin-Passwort, trägt Ihr
WLAN ein und fügt das Gerät dem Register hinzu.

**Voraussetzungen**

- Chrome oder Edge auf einem Desktop- oder Android-Gerät. Firefox und Safari unterstützen Web Bluetooth nicht.
- Attraccess wird über HTTPS oder auf `localhost` geöffnet. Browser erlauben Bluetooth nur auf sicheren Seiten.
- Ein Shelly der Generation Gen2, Gen3 oder Gen4 in Bluetooth-Reichweite. Gen1-Geräte lassen sich nicht über
  Bluetooth einrichten. Bei manchen Gen2-Firmwares muss zuerst **RPC über Bluetooth** in der Weboberfläche des Geräts
  aktiviert werden.
- Ein 2,4-GHz-WLAN. Shelly-Geräte können keinem 5-GHz-Netzwerk beitreten.

**Ablauf**

1. Öffnen Sie die Seite **Shelly-Geräte**, wählen Sie **Über Bluetooth einrichten** und dann **Gerät auswählen**.
   Wählen Sie den Shelly in der Liste des Browsers aus (sein Name beginnt mit `Shelly`). Attraccess zeigt Modell,
   Generation, ID und Firmware an.
2. Wählen Sie Ihr WLAN aus der Liste, die das Gerät gefunden hat. Bei einem versteckten Netzwerk oder wenn die Suche
   fehlschlägt, wählen Sie **Anderes Netzwerk** und geben den Namen ein. Geben Sie das WLAN-Passwort ein; lassen Sie es
   bei einem offenen Netzwerk leer.
3. Geben Sie das **neue Admin-Passwort** zweimal ein. Es ist erforderlich: Es wird vor dem WLAN auf dem Gerät gesetzt,
   damit das Gerät nie ungeschützt in Ihrem Netzwerk ist. Der Benutzername ist `admin`. Hat das Gerät bereits ein
   Admin-Passwort, geben Sie stattdessen dessen aktuelles Passwort ein.
4. Ändern Sie optional den Namen. Standard ist der Bluetooth-Name des Geräts.
5. Entscheiden Sie über **Bluetooth am Gerät nach der Einrichtung ausschalten**, standardmäßig aktiviert. Lassen Sie
   es aktiviert, außer Sie nutzen das Gerät als BLU- oder BTHome-Gateway. Solange Bluetooth an ist, kann jeder in der
   Nähe versuchen, sich zu verbinden.
6. Wählen Sie **Einrichtung starten**. Attraccess setzt das Admin-Passwort, konfiguriert das WLAN, wartet bis zu 60
   Sekunden auf eine IP-Adresse, fügt das Gerät dem Register hinzu und schaltet danach auf Wunsch Bluetooth aus. Lassen
   Sie den Bereich geöffnet, bis alles abgeschlossen ist.

**Gut zu wissen**

- WLAN- und Admin-Passwort gehen aus Ihrem Browser direkt über Bluetooth an das Gerät. Sie werden nicht an den
  Attraccess-Server gesendet, nicht gespeichert und nicht protokolliert.
- Muss das Gerät neu starten, um die WLAN-Einstellungen zu übernehmen, startet es neu und wird noch nicht hinzugefügt.
  Fügen Sie es mit **Suchen** oder **Gerät hinzufügen** hinzu, sobald es online ist. Bluetooth bleibt in diesem Fall an.
- Ist ein Gerät mit dieser IP-Adresse bereits im Register, wird nichts hinzugefügt. Bluetooth wird trotzdem
  ausgeschaltet, wenn Sie das gewünscht haben.
- Bricht die Bluetooth-Verbindung ab, starten Sie neu. Ein Gerät, das bereits Ihrem WLAN beigetreten ist, fügen Sie
  mit **Suchen** hinzu.
- Lehnt das Gerät das Ausschalten von Bluetooth ab, bleibt es eingerichtet und registriert. Schalten Sie Bluetooth in
  der Weboberfläche des Geräts aus.

## Siehe auch

- [Plugins installieren](plugins/installing-plugins.md)
- [Plugins entwickeln](plugins/developing-plugins.md)
