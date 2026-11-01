# Reader UI example plugin

A backend-only plugin that shows what the reader UI contract looks like in practice:

- `readerUi` contributes a badge to the resource list row (`READER_UI`).
- `preStartHook` asks for a confirmation before a session starts (`ACCESS_HOOKS`). The same hook
  drives readers, the web UI and API clients. Readers without a screen follow the resource's no-screen policy.

There is no reader-specific code: the host validates, transliterates to Latin-1 and renders the data.

```bash
npm run build       # produces ./package
npm run pack-test   # packs it and loads it against the SDK build
```

See `docs/en/plugins/developing-plugins.md` for the full contract and its limits.
