# Developing Plugins

Attraccess provides SDKs for building custom plugins. You can create frontend extensions, backend extensions, or both.

## Plugin SDKs

| SDK | Install Command | Purpose |
|-----|----------------|---------|
| `@attraccess/plugins-frontend-sdk` | `npm install @attraccess/plugins-frontend-sdk` | Frontend pages and components |
| `@attraccess/plugins-backend-sdk` | `npm install @attraccess/plugins-backend-sdk` | Backend API endpoints |

## Frontend Plugins

The frontend SDK allows your plugin to register routes and components within the Attraccess user interface.

A frontend plugin can:

- **Register routes** -- Add new pages accessible via the sidebar or direct URL
- **Register components** -- Inject UI components into existing pages

### Getting Started with Frontend Plugins

1. Create a new project and install the frontend SDK
2. Use the SDK to register your routes and components
3. Build and package your plugin
4. Upload it through the [Plugins](plugins/installing-plugins.md) page

> [!TIP]
> Refer to the SDK documentation included with `@attraccess/plugins-frontend-sdk` for detailed API reference, examples and type definitions.

## Backend Plugins

The backend SDK allows your plugin to register API endpoints that run on the Attraccess server.

A backend plugin can:

- **Register API endpoints** -- Add new REST endpoints to the Attraccess API
- **Access application services** -- Interact with the Attraccess backend

### Getting Started with Backend Plugins

1. Create a new project and install the backend SDK
2. Define your API endpoints using the SDK
3. Build and package your plugin
4. Upload it through the [Plugins](plugins/installing-plugins.md) page

## Combined Plugins

You can create a plugin that includes both frontend and backend functionality. This is useful when your extension needs custom API endpoints together with a user interface.

> [!NOTE]
> For a general introduction to the Attraccess architecture and development setup, see the [Developer Guide](developer/overview.md).

## See Also

- [Plugins Overview](plugins/overview.md) -- What are plugins?
- [Installing Plugins](plugins/installing-plugins.md) -- Upload and manage plugins
- [Developer Guide](developer/overview.md) -- Attraccess architecture and development
- [API Reference](developer/api-reference.md) -- Attraccess REST API
