# Erscheinungsbild

Attraccess kann an das Erscheinungsbild Ihrer Organisation angepasst werden.

## Anwendungs-URL

Die URL Ihrer Attraccess-Installation wird in E-Mails und Weiterleitungen verwendet. Sie können sie unter **Einstellungen** → **Anwendung** ändern.

## Logo und Name

Das Attraccess-Logo und der Name werden in der Seitenleiste und auf der Anmeldeseite angezeigt. In der aktuellen Version werden das Standard-Logo und der Name "Attraccess" verwendet.

![Attraccess-Anmeldung im weißen Design mit wasserblauen Akzenten](../_media/brand-login-desktop.png)

## Farbmodus

Im hellen Modus verwendet Attraccess weiße Hauptflächen mit Akzenten in RAL 5021 Wasserblau (`#256D7B`). Im dunklen Modus sorgen dunkle Oberflächen und hellere petrolfarbene Akzente für gute Lesbarkeit. Flache Oberflächen, klare Rahmen und dezente Eckenradien von 4–6 px halten den Fokus auf der Aufgabe. Farben für Erfolg, Warnungen und Fehler behalten in beiden Modi ihre Bedeutung.

Die Standarddarstellung ist hell, unabhängig vom Farbmodus Ihres Betriebssystems. Über den Farbmodus-Schalter auf der Anmeldeseite, in der Seitenleiste oder in der mobilen Kopfzeile können Sie optional zum dunklen Modus wechseln. Ihre Auswahl wird in diesem Browser für diese Attraccess-Installation gespeichert, sofern lokaler Speicher verfügbar ist.

Attraccess Companion startet ebenfalls standardmäßig im hellen Modus. Im Einrichtungsassistenten finden Sie den Farbmodus-Schalter bei jedem Schritt oben rechts; der Assistent speichert seine eigene Auswahl lokal. Diese Einstellung ist von der Web-App getrennt und wird nicht zwischen Apps oder Geräten synchronisiert. Jedes neu erstellte Companion-Kioskfenster startet mit einer neuen Sitzung im hellen Modus und übernimmt nicht die Auswahl des Assistenten.

Diese Dokumentation bietet einen eigenen optionalen Schalter für den dunklen Modus und speichert Ihre Auswahl separat.

![Ressourcenübersicht mit Beispieldaten](../_media/brand-resources-desktop.png)

Das gleiche Design passt sich kleineren Bildschirmen an.

![Ressourcendetails im dunklen Modus](../_media/dark-resource-details.png)

Die Markenbilder werden mit `node scripts/generate-brand-assets.mjs` aus dem ursprünglichen Maskottchen und der Vektor-Wortmarke erzeugt. Mit `--check` prüft das Skript Logos, Symbolgrößen, Transparenz und maskierbare Bereiche, ohne Dateien zu ändern.

Logos und App-Symbole behalten die ursprünglichen Farben, Schattierungen und Flicken des Maskottchens bei; nur das rosafarbene Schlüsselloch wird zu RAL 5021 Wasserblau. App-Symbole haben einen weißen Hintergrund. Die Favicon-Größen 16 und 32 px verwenden für gute Erkennbarkeit eine weiße Schlüsselloch-Silhouette auf Wasserblau, das Benachrichtigungssymbol eine weiße Silhouette auf transparentem Hintergrund.

## E-Mail-Layout

Das Standard-E-Mail-Layout verwendet einen weißen Hintergrund und petrolfarbene Links und Schaltflächen. Ein Update von Attraccess stellt das ursprüngliche, unveränderte Standardlayout automatisch auf das neue Erscheinungsbild um. Individuell angepasste Layouts bleiben erhalten.

Um ein angepasstes Layout optional durch das neue Standardlayout zu ersetzen, öffnen Sie den globalen Layout-Editor unter **Einstellungen** → **E-Mail** → **Layout** und wählen Sie **Standard wiederherstellen**. Dadurch wird das gespeicherte globale Layout ersetzt. Sichern Sie vorher alle Anpassungen, die Sie behalten möchten. Die Inhalte der einzelnen E-Mail-Vorlagen werden weder bei der automatischen Layout-Aktualisierung noch beim Zurücksetzen des Layouts geändert.

## Siehe auch

- [Ersteinrichtung](setup/first-time-setup.md)
- [Systemeinstellungen](settings/overview.md)
- [E-Mail-Vorlagen](setup/email-templates.md)
