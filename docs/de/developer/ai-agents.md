# KI-Agenten (llms.txt & WebMCP)

<!-- llms-description: Erklärt den llms.txt-Index und die experimentellen WebMCP-Tools der Dokumentation, das Ausprobieren in Chrome und das Hinzufügen von Seiten. -->

Die Attraccess-Dokumentation lässt sich gut von KI-Agenten nutzen: ein `llms.txt`-Index für Crawler und Assistenten sowie WebMCP-Tools für Agenten im Browser.

> [!WARNING]
> WebMCP ist experimentell. Die Browser-Schnittstelle und die hier beschriebenen Tools können sich ohne Vorankündigung ändern.

## llms.txt

`https://docs.attraccess.org/llms.txt` folgt der [llms.txt](https://llmstxt.org/)-Konvention. Die Datei listet alle Dokumentationsseiten auf, zuerst Englisch, dann Deutsch, jeweils mit Link auf die Markdown-Rohdatei und einer einzeiligen Beschreibung. Ein Agent liest den Index und lädt dann nur die benötigten Seiten, zum Beispiel:

```text
https://docs.attraccess.org/de/getting-started/overview.md
```

Die Datei wird aus den beiden Seitenleisten (`docs/en/_sidebar.md` und `docs/de/_sidebar.md`) erzeugt und im Repository eingecheckt. Sie ist auch erreichbar, wenn die Dokumentation von Ihrer eigenen Attraccess-Instanz unter `/docs/` ausgeliefert wird; die Links darin zeigen aber immer auf `docs.attraccess.org`.

## WebMCP-Tools

In Browsern, die [WebMCP](https://webmachinelearning.github.io/webmcp/) unterstützen, registriert die Dokumentations-Website fünf Tools für den KI-Agenten des Browsers. In anderen Browsern passiert nichts.

| Tool           | Eingabe                                                                     | Wirkung                                                                                                                |
| -------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `list_pages`   | `language` (optional: `de` oder `en`, Standard: aktuell angezeigte Sprache) | Listet alle Seiten der Seitenleiste mit Titel, Abschnitt, Pfad und URL.                                                |
| `get_page`     | `path` (zum Beispiel `de/getting-started/overview.md`)                      | Liefert den Markdown-Quelltext einer Seite. Pfade außerhalb der Dokumentation werden abgelehnt.                        |
| `search_docs`  | `query`, `language` (optional), `limit` (optional, 1-20, Standard 10)       | Volltextsuche; alle Wörter müssen passen, Titeltreffer stehen vorn. Liefert Titel, Pfade und Textausschnitte.          |
| `navigate_to`  | `path`                                                                      | Öffnet eine Seite im Browser. Bei einer Seite in der anderen Sprache wechselt die Sprache und die Seite lädt neu.      |
| `set_language` | `language` (`de` oder `en`)                                                 | Wechselt die Sprache der Website. Ändert sich die Sprache, lädt die Seite neu und die Tools werden erneut registriert. |

`list_pages`, `get_page` und `search_docs` lesen nur. `navigate_to` und `set_language` ändern nur die Anzeige und die gespeicherte Sprachwahl im Browser.

## In Chrome ausprobieren

1. Verwenden Sie Chrome 149 oder neuer.
2. Öffnen Sie `chrome://flags/#enable-webmcp-testing`, aktivieren Sie das Flag und starten Sie Chrome neu.
3. Öffnen Sie die Dokumentation und prüfen Sie die Tools mit der Erweiterung „Model Context Tool Inspector“ oder im DevTools-Bereich **Application → WebMCP**.

Die Unterstützung über einen Chrome-Origin-Trial ist geplant, damit Besucher später das Flag nicht mehr brauchen.

## Dokumentationsseite hinzufügen oder umbenennen

Jede Seite, die in einer Seitenleiste verlinkt ist, braucht eine Beschreibung für `llms.txt`:

1. Schreiben Sie einen Satz (20-200 Zeichen, in der Sprache der Seite) als HTML-Kommentar direkt unter die erste Überschrift:

   ```markdown
   # Meine neue Seite

   <!-- llms-description: Erklärt, wie X funktioniert und welche Einstellungen Y beeinflusst. -->
   ```

2. Tragen Sie die Seite in die Seitenleiste der jeweiligen Sprache ein.
3. Führen Sie `node scripts/generate-llms-txt.mjs` aus und committen Sie die aktualisierte `docs/llms.txt`.

Die Targets `lint` und `test` führen `node scripts/generate-llms-txt.mjs --check` aus und schlagen mit den betroffenen Dateien fehl, wenn eine Beschreibung fehlt oder `llms.txt` veraltet ist.
