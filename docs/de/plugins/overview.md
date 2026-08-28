# Plugins

Das Plugin-System ermoeglicht es Ihnen, Attraccess um zusaetzliche Funktionen zu erweitern. Plugins koennen neue Seiten im Frontend, neue API-Endpunkte im Backend oder beides hinzufuegen.

## Was sind Plugins?

Plugins sind eigenstaendige Erweiterungen, die sich in Attraccess integrieren. Sie werden als Dateien ueber die Weboberflaeche hochgeladen und koennen jederzeit aktiviert oder deaktiviert werden.

Ein Plugin kann:

- Neue **Seiten und Komponenten** zum Attraccess-Frontend hinzufuegen
- Neue **API-Endpunkte** zum Backend hinzufuegen
- Sowohl Frontend- als auch Backend-Funktionalitaet kombinieren

## Plugin-Verwaltung

Plugins werden im Bereich **Plugins** der **Einstellungen** verwaltet. Von dort aus koennen Administratoren:

- Alle installierten Plugins einsehen
- Neue Plugins hochladen
- Plugins aktivieren oder deaktivieren
- Plugins entfernen

<!-- TODO: Screenshot der Plugin-Verwaltungsseite -->

> [!NOTE]
> Die Plugin-Verwaltung erfordert Administratorzugang. Regulaere Benutzer koennen keine Plugins installieren, aktivieren oder entfernen.

## Plugin-SDKs

Attraccess stellt SDKs fuer die Plugin-Entwicklung bereit:

| SDK | Verwendung |
|-----|-----------|
| `@attraccess/plugins-frontend-sdk` | Frontend-Erweiterungen erstellen (Seiten, Komponenten) |
| `@attraccess/plugins-backend-sdk` | Backend-Erweiterungen erstellen (API-Endpunkte) |

Weitere Informationen zur Plugin-Entwicklung finden Sie unter [Plugins entwickeln](plugins/developing-plugins.md).

## Umgebungsvariablen

Das Plugin-Verhalten kann ueber Umgebungsvariablen konfiguriert werden:

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `PLUGIN_DIR` | `/app/storage/plugins` | Verzeichnis, in dem Plugins gespeichert werden |
| `DISABLE_PLUGINS` | `false` | Das gesamte Plugin-System deaktivieren |

Siehe [Umgebungsvariablen](installation/environment-variables.md) fuer die vollstaendige Liste.

## Siehe auch

- [Plugins installieren](plugins/installing-plugins.md) -- Plugins hochladen und verwalten
- [Plugins entwickeln](plugins/developing-plugins.md) -- Eigene Plugins erstellen
- [Umgebungsvariablen](installation/environment-variables.md) -- Plugin-bezogene Einstellungen
