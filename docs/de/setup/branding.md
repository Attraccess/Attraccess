# Erscheinungsbild

Attraccess kann an das Erscheinungsbild Ihrer Organisation angepasst werden.

## Anwendungs-URL

Die URL Ihrer Attraccess-Installation wird in E-Mails und Weiterleitungen verwendet. Sie können sie unter **Einstellungen** → **Anwendung** ändern.

## Logo und Name

Das Attraccess-Logo und der Name werden in der Seitenleiste und auf der Anmeldeseite angezeigt. In der aktuellen Version werden das Standard-Logo und der Name "Attraccess" verwendet.

![Attraccess-Anmeldung im weißen Design mit wasserblauen Akzenten](../_media/brand-login-desktop.png)

## Farbmodus

Attraccess verwendet weiße Hauptflächen mit Akzenten in RAL 5021 Wasserblau (`#256D7B`). Flache Oberflächen, klare Rahmen und dezente Eckenradien von 4–6 px halten den Fokus auf der Aufgabe. Farben für Erfolg, Warnungen und Fehler behalten ihre Bedeutung.

Die Standarddarstellung ist hell, unabhängig vom Farbmodus Ihres Betriebssystems. Attraccess Companion verwendet ebenfalls das helle Design. Diese Dokumentation bietet einen optionalen Schalter für den dunklen Modus und merkt sich Ihre ausdrückliche Auswahl.

![Ressourcenübersicht mit Beispieldaten](../_media/brand-resources-desktop.png)

Das gleiche Design passt sich kleineren Bildschirmen an.

Die Markenbilder werden mit `node scripts/generate-brand-assets.mjs` aus dem ursprünglichen Maskottchen und der Vektor-Wortmarke erzeugt. Mit `--check` prüft das Skript Logos, Symbolgrößen, Transparenz und maskierbare Bereiche, ohne Dateien zu ändern.

## E-Mail-Layout

Das Standard-E-Mail-Layout verwendet einen weißen Hintergrund und petrolfarbene Links und Schaltflächen. Ein Update von Attraccess stellt das ursprüngliche, unveränderte Standardlayout automatisch auf das neue Erscheinungsbild um. Individuell angepasste Layouts bleiben erhalten.

Um ein angepasstes Layout optional durch das neue Standardlayout zu ersetzen, öffnen Sie den globalen Layout-Editor unter **Einstellungen** → **E-Mail** → **Layout** und wählen Sie **Standard wiederherstellen**. Dadurch wird das gespeicherte globale Layout ersetzt. Sichern Sie vorher alle Anpassungen, die Sie behalten möchten. Die Inhalte der einzelnen E-Mail-Vorlagen werden weder bei der automatischen Layout-Aktualisierung noch beim Zurücksetzen des Layouts geändert.

## Siehe auch

- [Ersteinrichtung](setup/first-time-setup.md)
- [Systemeinstellungen](settings/overview.md)
- [E-Mail-Vorlagen](setup/email-templates.md)
