# Reader UI example plugin

A backend-only plugin that shows what the reader UI contract looks like in practice:

- `readerUi` contributes a badge to the resource list row (`READER_UI`).
- `preStartHook` asks for a confirmation before a session starts (`ACCESS_HOOKS`). The same hook
  drives readers, the web UI and API clients. Readers that cannot show the step (Lite, older firmware,
  readers suspended after repeated crashes) follow the resource's no-screen policy.
- Both pick their texts by `ctx.language` (`en` or `de`), which the host sets per reader, card user
  or web user.

There is no reader-specific code: the host validates, transliterates to Latin-1 and renders the data.
Admins switch the widgets and the failure policy per resource under **Resource settings → Reader display**.

```bash
npm run build       # produces ./package
npm run pack-test   # packs it and loads it against the SDK build
```

See `docs/en/plugins/developing-plugins.md` for the full contract and its limits, and
`docs/en/attractap/reader-ui.md` for the admin settings.
