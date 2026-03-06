# Plugins entwickeln

Attraccess stellt SDKs fuer die Entwicklung eigener Plugins bereit. Sie koennen Frontend-Erweiterungen, Backend-Erweiterungen oder beides erstellen.

## Plugin-SDKs

| SDK | Installationsbefehl | Verwendung |
|-----|---------------------|-----------|
| `@attraccess/plugins-frontend-sdk` | `npm install @attraccess/plugins-frontend-sdk` | Frontend-Seiten und -Komponenten |
| `@attraccess/plugins-backend-sdk` | `npm install @attraccess/plugins-backend-sdk` | Backend-API-Endpunkte |

## Frontend-Plugins

Das Frontend-SDK ermoeglicht es Ihrem Plugin, Routen und Komponenten innerhalb der Attraccess-Benutzeroberflaeche zu registrieren.

Ein Frontend-Plugin kann:

- **Routen registrieren** -- Neue Seiten hinzufuegen, die ueber die Seitenleiste oder direkte URL erreichbar sind
- **Komponenten registrieren** -- UI-Komponenten in bestehende Seiten einfuegen

### Erste Schritte mit Frontend-Plugins

1. Erstellen Sie ein neues Projekt und installieren Sie das Frontend-SDK
2. Verwenden Sie das SDK, um Ihre Routen und Komponenten zu registrieren
3. Erstellen und verpacken Sie Ihr Plugin
4. Laden Sie es ueber die [Plugins](plugins/installing-plugins.md)-Seite hoch

> [!TIP]
> Lesen Sie die SDK-Dokumentation, die mit `@attraccess/plugins-frontend-sdk` mitgeliefert wird, fuer eine detaillierte API-Referenz, Beispiele und Typdefinitionen.

## Backend-Plugins

Das Backend-SDK ermoeglicht es Ihrem Plugin, API-Endpunkte zu registrieren, die auf dem Attraccess-Server ausgefuehrt werden.

Ein Backend-Plugin kann:

- **API-Endpunkte registrieren** -- Neue REST-Endpunkte zur Attraccess-API hinzufuegen
- **Auf Anwendungsdienste zugreifen** -- Mit dem Attraccess-Backend interagieren

### Erste Schritte mit Backend-Plugins

1. Erstellen Sie ein neues Projekt und installieren Sie das Backend-SDK
2. Definieren Sie Ihre API-Endpunkte mit dem SDK
3. Erstellen und verpacken Sie Ihr Plugin
4. Laden Sie es ueber die [Plugins](plugins/installing-plugins.md)-Seite hoch

## Kombinierte Plugins

Sie koennen ein Plugin erstellen, das sowohl Frontend- als auch Backend-Funktionalitaet umfasst. Dies ist nuetzlich, wenn Ihre Erweiterung benutzerdefinierte API-Endpunkte zusammen mit einer Benutzeroberflaeche benoetigt.

> [!NOTE]
> Fuer eine allgemeine Einfuehrung in die Attraccess-Architektur und Entwicklungsumgebung siehe den [Entwicklerhandbuch](developer/overview.md).

## Siehe auch

- [Plugins Ueberblick](plugins/overview.md) -- Was sind Plugins?
- [Plugins installieren](plugins/installing-plugins.md) -- Plugins hochladen und verwalten
- [Entwicklerhandbuch](developer/overview.md) -- Attraccess-Architektur und -Entwicklung
- [API-Referenz](developer/api-reference.md) -- Attraccess-REST-API
