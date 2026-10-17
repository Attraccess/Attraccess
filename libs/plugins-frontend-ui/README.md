# plugins-frontend-ui

Shared frontend components and internationalization for the core and plugins.

## Plugin translations

Use `useTranslations` with plugin-owned English and German catalogs. The hook
subscribes to the core language store, so already-mounted pages, forms and slot
contributions update when the user selects a language in Attraccess.

```tsx
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

const translations = { en, de };

export function DevicesPage() {
  const { t, language } = useTranslations(translations);
  return <h1>{t('devices.title')}</h1>;
}
```

Catalog strings support Handlebars interpolation (`{{name}}`) and plural
objects (`{ "one": "One device", "many": "{{count}} devices" }`). Missing German
keys fall back to English. Use the returned `language` for locale-dependent
date and number formatting. Translate labels and explanatory text; retain
user-entered names, identifiers and protocol values.

The host and plugin federation configurations must share
`@attraccess/plugins-frontend-ui`. The official plugin build helper configures
this as a host-owned singleton with no remote fallback. Bundling a private
copy would create a separate language store. Plugins should not call
`detectAndSetLanguage` or persist an independent language preference: the core
owns detection and selection.

## Running unit tests

Run `nx test plugins-frontend-ui` to execute the unit tests via [Vitest](https://vitest.dev/).
