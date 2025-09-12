# Plugins

## Overview

The Attraccess plugin system enables developers to extend the platform's capabilities without modifying the core codebase. This modular approach allows for customized functionality while maintaining a stable foundation.

Plugins in Attraccess consist of three main components:

1. **Plugin Manifest (`plugin.json`)** - A descriptor file defining the plugin and its entry points
2. **Frontend Module** - A React-based component that extends the UI (optional)
3. **Backend Module** - A NestJS dynamic module that extends the API (optional)

## Plugin Structure

### Development Structure

During development, a typical plugin has the following structure:

```
plugin-name/
├── plugin.json           # Plugin manifest
├── frontend/             # Frontend code (optional)
│   ├── src/
│   │   ├── index.ts
│   │   └── plugin.tsx    # Main plugin implementation
│   ├── package.json
│   └── vite.config.ts    # Module federation configuration
└── backend/              # Backend code (optional)
    ├── src/
    │   └── plugin.module.ts  # NestJS module
    └── package.json
```

### Compiled Structure

After compilation, the plugin structure that gets loaded by Attraccess looks like this:

```
plugin-name/
├── plugin.json                # Plugin manifest
├── backend/                   # Compiled backend code
│   └── src/
│       ├── attractap.module.js   # Compiled NestJS module
│       └── other compiled files  # Controllers, services, etc.
└── frontend/                  # Compiled frontend code
    └── assets/
        ├── remoteEntry.js     # Module Federation entry point
        ├── index.js           # Main bundle
        └── other assets       # CSS, images, etc.
```

The compiled version is what gets loaded by the Attraccess plugin system at runtime.

## Plugin Manifest

The `plugin.json` file is required for all plugins and defines the plugin's metadata and entry points. Here's an example:

```json
{
  "name": "PluginName",
  "main": {
    "backend": "backend/src/plugin.module.js",
    "frontend": {
      "directory": "frontend",
      "entryPoint": "assets/remoteEntry.js"
    }
  },
  "version": "0.0.16",
  "description": "Description of the plugin",
  "attraccessVersion": {
    "min": "0.0.0",
    "max": "2.0.0",
    "exact": null
  }
}
```

### Manifest Fields

| Field                      | Description                             |
| -------------------------- | --------------------------------------- |
| `name`                     | The name of the plugin (must be unique) |
| `main.backend`             | Path to the backend module entry point  |
| `main.frontend.directory`  | Directory containing the frontend code  |
| `main.frontend.entryPoint` | Path to the frontend entry point        |
| `version`                  | Plugin version                          |
| `description`              | Plugin description                      |
| `attraccessVersion`        | Compatibility with Attraccess versions  |

### The `attraccessVersion` Field

The `attraccessVersion` field helps ensure compatibility between your plugin and the Attraccess platform:

- `min`: Specifies the minimum Attraccess version your plugin is compatible with
- `max`: Specifies the maximum Attraccess version your plugin is compatible with
- `exact`: If set, specifies that your plugin only works with this exact Attraccess version

You can specify any combination of these properties. For example:

- `{ "min": "1.0.0" }` - Compatible with version 1.0.0 and higher
- `{ "min": "1.0.0", "max": "2.0.0" }` - Compatible with versions between 1.0.0 and 2.0.0
- `{ "exact": "1.5.0" }` - Only compatible with version 1.5.0

When Attraccess loads a plugin, it compares its own version with the plugin's compatibility settings and will only load the plugin if the versions match. This prevents loading plugins that might cause errors due to incompatible APIs or features.

Version checking follows semantic versioning rules (major.minor.patch):

- Breaking changes increase the major version
- New features without breaking changes increase the minor version
- Bug fixes increase the patch version

## Frontend Plugin Development

The frontend part of a plugin extends the Attraccess UI using [React](https://reactjs.org/) and the [react-pluggable](https://github.com/adarshpastakia/react-pluggable) library. It is compiled as a [Module Federation](https://webpack.js.org/concepts/module-federation/) package to enable dynamic loading.

### Creating a Frontend Plugin

1. Create a class that implements the `AttraccessFrontendPlugin` interface:

```tsx
import { PluginStore } from 'react-pluggable';
import {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';

export default class MyPlugin implements AttraccessFrontendPlugin {
  public pluginStore!: PluginStore;
  public readonly name = 'MyPlugin';
  public readonly version = 'v1.0.0';

  getPluginName(): string {
    return `${this.name}@${this.version}`;
  }

  getDependencies(): string[] {
    return [];
  }

  init(pluginStore: PluginStore): void {
    this.pluginStore = pluginStore;
  }

  onApiEndpointChange(endpoint: string): void {
    // Handle API endpoint changes
  }

  onApiAuthStateChange(authData: null | AttraccessFrontendPluginAuthData): void {
    // Handle authentication state changes
  }

  activate(): void {
    // Register routes with the plugin system
    this.pluginStore.addFunction(`${this.getPluginName()}.GET_ROUTES`, () => {
      return [
        {
          path: '/my-plugin',
          element: <MyPluginComponent />,
          authRequired: true,
          sidebar: {
            label: 'My Plugin',
            icon: <SomeIcon />,
          },
        },
      ] as RouteConfig[];
    });
  }
}
```

### Understanding the `GET_ROUTES` Function

The `GET_ROUTES` function is a critical part of the plugin integration with Attraccess. When you register this function:

1. The Attraccess core application automatically discovers your plugin's routes
2. These routes are integrated into the main application's routing system
3. Your plugin's UI components are rendered at the specified paths
4. If you include a `sidebar` configuration, your plugin gets an entry in the navigation menu

The function should return an array of `RouteConfig` objects with these properties:

| Property        | Description                                             |
| --------------- | ------------------------------------------------------- |
| `path`          | The URL path where your plugin's UI will be rendered    |
| `element`       | The React component to render at this path              |
| `authRequired`  | Whether authentication is required to access this route |
| `sidebar`       | Configuration for the sidebar menu item (optional)      |
| `sidebar.label` | The text displayed in the sidebar                       |
| `sidebar.icon`  | The icon component for the sidebar item                 |

The Attraccess router system is built on [React Router](https://reactrouter.com/), so your routes will be integrated into the application's routing hierarchy. This means you can:

- Access URL parameters with React Router's hooks
- Create nested routes within your plugin
- Use route navigation features provided by React Router

### Module Federation Configuration

Frontend plugins use [Module Federation](https://webpack.js.org/concepts/module-federation/) to enable dynamic loading. Configure this in your `vite.config.ts`:

```ts
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  // ... other config
  plugins: [
    federation({
      name: 'your-plugin-name',
      filename: 'remoteEntry.js',
      exposes: {
        './plugin': './src/my.plugin',
      },
      shared: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-pluggable',
        '@heroui/react',
        'i18next-browser-languagedetector',
        '@tanstack/react-query',
        '@attraccess/react-query-client',
        '@attraccess/plugins-frontend-ui',
      ],
    }),
    // ... other plugins
  ],
  // ... build configuration
});
```

### Shared Dependencies

The `shared` array in the Module Federation configuration is crucial. It specifies which dependencies should be shared between the host application (Attraccess) and your plugin. This is important for:

1. **Preventing Duplicate Modules**: Without shared dependencies, React and other libraries would be loaded multiple times, causing conflicts and increased bundle size
2. **Shared Context**: Components like contexts need to be from the same instance to work properly
3. **Consistent Versions**: Ensures all components use the same version of libraries

The following dependencies must be shared for proper integration with Attraccess:

```js
[
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-pluggable',
  '@heroui/react',
  'i18next-browser-languagedetector',
  '@tanstack/react-query',
  '@attraccess/react-query-client',
  '@attraccess/plugins-frontend-ui',
];
```

#### Understanding Each Shared Dependency

1. **react** - Core React library for building user interfaces
   - Purpose: Foundation for all React components
   - [Documentation](https://reactjs.org/docs/getting-started.html)

2. **react-dom** - React package for DOM manipulation and rendering
   - Purpose: Renders React components to the DOM
   - [Documentation](https://reactjs.org/docs/react-dom.html)

3. **react/jsx-runtime** - JSX transformer for React
   - Purpose: Enables JSX syntax in React applications
   - Part of the React package, automatically used by build tools

4. **react-pluggable** - Plugin framework for React applications
   - Purpose: Core plugin architecture that enables plugin functionality
   - [Documentation](https://github.com/adarshpastakia/react-pluggable)

5. **@heroui/react** - UI component library of Attraccess
   - Purpose: Provides UI components and styling for the application
   - [Documentation](https://www.heroui.com/)

6. **i18next-browser-languagedetector** - Language detection for i18next
   - Purpose: Automatically detects the user's browser language
   - [Documentation](https://github.com/i18next/i18next-browser-languageDetector)

7. **@tanstack/react-query** - Data fetching and caching library
   - Purpose: Manages API requests, caching, and state
   - [Documentation](https://tanstack.com/query/latest)

8. **@attraccess/react-query-client** - Attraccess-specific React Query client
   - Purpose: Pre-configured React Query client for Attraccess API endpoints
   - Internal library specific to Attraccess

9. **@attraccess/plugins-frontend-ui** - Attraccess UI components for plugins
   - Purpose: Shared UI components to maintain consistent look and feel
   - Internal library specific to Attraccess

If you don't properly share these dependencies:

- Context providers from the main application won't be available to your plugin
- Authentication state may not be properly shared
- UI components may have inconsistent styling
- Multiple instances of libraries will be loaded, increasing bundle size and causing performance issues

## Backend Plugin Development

The backend part of a plugin extends the Attraccess API using [NestJS](https://nestjs.com/) dynamic modules.

### Creating a Backend Plugin

1. Create a NestJS module that exports the module class:

```ts
import { Module } from '@nestjs/common';
import { MyPluginController } from './my-plugin.controller';
import { MyPluginService } from './my-plugin.service';

@Module({
  imports: [
    // Import necessary modules
  ],
  providers: [MyPluginService],
  controllers: [MyPluginController],
})
export default class MyPluginModule {}
```

The module must be exported as the default export. This allows the Attraccess plugin system to dynamically load it.

2. Implement your controllers, services, and other components as needed:

```ts
import { Controller, Get } from '@nestjs/common';
import { MyPluginService } from './my-plugin.service';

@Controller('my-plugin')
export class MyPluginController {
  constructor(private readonly service: MyPluginService) {}

  @Get()
  getData() {
    return this.service.getData();
  }
}
```

## Plugin Lifecycle

### Loading

The Attraccess plugin system loads plugins in this sequence:

1. The system scans the plugins directory for `plugin.json` files
2. For each valid plugin, it:
   - Loads the backend module (if present)
   - Loads the frontend module (if present) using Module Federation
   - Initializes the plugin and adds it to the plugin registry

### Initialization

When a plugin is loaded:

1. The backend module is dynamically imported and added to the NestJS application
2. The frontend plugin is instantiated and its `init` method is called with the plugin store
3. The plugin's `activate` method is called, allowing it to register functionality

## Example: Attractap Plugin

The Attractap plugin is a complete example that demonstrates how to implement both frontend and backend functionality:

- Frontend: Provides a UI for managing Attractap readers
- Backend: Implements APIs for communicating with Attractap reader devices

You can examine the Attractap plugin code in `/libs/plugin-attractap` as a reference for creating your own plugins.

## Best Practices

1. **Separation of Concerns**: Keep frontend and backend code clearly separated
2. **Versioning**: Properly version your plugins to manage compatibility
3. **Dependencies**: Declare all external dependencies in your package.json
4. **Error Handling**: Handle errors gracefully to prevent affecting the core application
5. **Cleanup**: Properly clean up resources in the activate method

## Reference Links

- [React](https://reactjs.org/) - JavaScript library for building user interfaces
- [NestJS](https://nestjs.com/) - Framework for building efficient and scalable server-side applications
- [Module Federation](https://webpack.js.org/concepts/module-federation/) - Advanced feature of Webpack for sharing code between JavaScript applications
- [react-pluggable](https://github.com/adarshpastakia/react-pluggable) - Plugin framework for React applications
- [TypeORM](https://typeorm.io/) - ORM for TypeScript and JavaScript
- [@tanstack/react-query](https://tanstack.com/query/latest) - Hooks for fetching, caching and updating asynchronous data in React
- [Vite](https://vitejs.dev/) - Frontend build tool that significantly improves the frontend development experience
- [@originjs/vite-plugin-federation](https://github.com/originjs/vite-plugin-federation) - Module Federation plugin for Vite
