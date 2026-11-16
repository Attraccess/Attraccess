# Plugins auf SDK 2.0 umstellen

<!-- llms-description: Was Plugin-Entwickler für Attraccess 2.0 ändern müssen: die Mindest-Host-Version, die deklarierten Datenbank-Engines und wie der Host ältere Plugins verweigert. -->

Attraccess 2.0 trennt Plugins von der Datenbank-Engine. Für Plugins, die für 1.x gebaut wurden, ist das eine
Breaking Change.

## Was der Host durchsetzt

- **Mindest-Host-Version.** `plugin.json` muss `attraccessVersion.min` von `2.0.0-0` oder höher deklarieren. Bei
  npm-Plugins zählt die niedrigste von `attraccess.host` in der `package.json` erlaubte Version. Ein Plugin darunter oder
  ohne Minimum wird beim Hochladen, Installieren oder Starten verweigert. Der Fehler nennt das Plugin und verlinkt diese
  Anleitung. Es wird nichts entpackt, installiert oder migriert, die Datenbank bleibt unberührt.
- **Deklarierte Engines.** Ein Plugin, das Daten speichert (Migrations-Eintrag oder Berechtigung `DATABASE_ACCESS`),
  muss die Engines nennen, die seine Persistenz unterstützt:

  ```json
  { "persistence": { "backends": ["sqlite"] } }
  ```

  Bei npm-Plugins steht dasselbe Objekt im `attraccess`-Block der `package.json`. Läuft der Host mit einer nicht
  genannten Engine, wird das Plugin nicht installiert, migriert oder gestartet, und es ändern sich keine Daten.

- **Berechtigungen bleiben.** `DATABASE_ACCESS` und die anderen Berechtigungen steuern weiterhin, was ein Plugin nutzen
  darf. Installations-, Start- und Deinstallations-Migrationen und die Schutzmechanismen der Plugin-Migrationshistorie
  funktionieren wie bisher.

## Checkliste

1. `attraccessVersion.min` auf `2.0.0-0` setzen (bei npm-Paketen `attraccess.host` auf `^2.0.0-0`).
2. Peer-Dependencies und `attraccess.sdk`-Bereiche für `@attraccess/plugins-backend-sdk`, `-frontend-sdk` und
   `-frontend-ui` auf `^2.0.0-0` anheben.
3. `persistence.backends` ergänzen, wenn das Plugin Daten speichert.
4. Plugin neu bauen und gegen einen 2.0-Host testen.

Die Beispiele unter `examples/` und die eingebauten Plugins (Shelly, WAGO, Matter, Reservations, RabbitMQ) zeigen das
2.0-Manifest.
