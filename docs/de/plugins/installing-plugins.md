# Plugins installieren

Plugins werden durch Hochladen ueber die Attraccess-Weboberflaeche installiert. Diese Seite erklaert, wie Sie Plugins hochladen, aktivieren und verwalten.

## Voraussetzungen

- Sie benoetigen **Administratorzugang** zur Plugin-Verwaltung
- Das Plugin-System darf nicht deaktiviert sein (siehe [Umgebungsvariablen](installation/environment-variables.md))

## Plugin hochladen

1. Oeffnen Sie **Einstellungen** in der Seitenleiste und waehlen Sie den Bereich **Plugins**
2. Klicken Sie auf die Schaltflaeche **Plugin hochladen**
3. Waehlen Sie die Plugin-Datei von Ihrem Computer aus
4. Das Plugin wird hochgeladen und erscheint in der Plugin-Liste

<!-- TODO: Screenshot des Plugin-Upload-Dialogs -->

> [!NOTE]
> Nach dem Hochladen muss das Plugin moeglicherweise erst aktiviert werden, bevor es aktiv wird. Siehe naechsten Abschnitt.

## Plugins aktivieren und deaktivieren

Plugins koennen ein- oder ausgeschaltet werden, ohne sie zu entfernen:

1. Oeffnen Sie **Einstellungen** in der Seitenleiste und waehlen Sie den Bereich **Plugins**
2. Finden Sie das Plugin in der Liste
3. Schalten Sie den **Aktivieren/Deaktivieren**-Schalter um
4. Das Plugin wird sofort aktiv oder inaktiv

<!-- TODO: Screenshot des Plugin-Aktivieren/Deaktivieren-Schalters -->

> [!WARNING]
> Das Deaktivieren eines Plugins entfernt dessen Seiten aus dem Frontend und dessen API-Endpunkte aus dem Backend. Benutzer koennen auf die vom Plugin bereitgestellten Funktionen nicht mehr zugreifen, bis es wieder aktiviert wird.

## Plugin entfernen

1. Oeffnen Sie **Einstellungen** in der Seitenleiste und waehlen Sie den Bereich **Plugins**
2. Finden Sie das Plugin in der Liste
3. Klicken Sie auf die Schaltflaeche **Entfernen** oder **Loeschen**
4. Bestaetigen Sie die Entfernung

> [!WARNING]
> Das Entfernen eines Plugins loescht es dauerhaft aus dem System. Sie muessen die Plugin-Datei erneut hochladen, wenn Sie es wieder verwenden moechten.

## Fehlerbehebung

Wenn ein Plugin nicht wie erwartet funktioniert:

- Pruefen Sie, ob das Plugin in der Plugin-Liste **aktiviert** ist
- Stellen Sie sicher, dass die Umgebungsvariable `DISABLE_PLUGINS` nicht auf `true` gesetzt ist
- Pruefen Sie die Server-Logs auf Fehlermeldungen im Zusammenhang mit dem Plugin
- Kontaktieren Sie den Plugin-Entwickler fuer Unterstuetzung

## Siehe auch

- [Plugins Ueberblick](plugins/overview.md) -- Was sind Plugins?
- [Plugins entwickeln](plugins/developing-plugins.md) -- Eigene Plugins erstellen
- [Umgebungsvariablen](installation/environment-variables.md) -- Plugin-bezogene Einstellungen
