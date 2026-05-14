# ATT-44 — Show available template variables in email editor

## Context

Linear ticket: https://linear.app/attraccess/issue/ATT-44

The email template edit page (`apps/frontend/src/app/email-templates/edit/index.tsx`) currently lets the user edit a subject (`<Input>`) and an MJML body (`@monaco-editor/react`). The backend already returns the list of available Handlebars variables for each template type as `template.data.variables: string[]` via `GET /email-templates/:type`.

Today, the user has no way to discover which variables they can use. They must read code or other templates. This spec adds both a visible list and Monaco autocomplete.

## Goal

Let the user see which `{{variable}}` tokens are valid for the current template type, and let them insert one quickly.

## Non-goals

- No backend changes — variables already exposed.
- No editor library swap.
- No insert-at-cursor logic for the subject `<Input>` (clipboard covers both fields with one mechanism).
- No validation/linting of variables in template body.

## Design

### 1. Visible variable chip list

A new section is added to the Template card, between the section header and the subject input.

- Renders `template.data.variables` (string[]) as HeroUI `Chip` components.
- Each chip displays the bare variable name (e.g. `user.username`).
- Clicking a chip writes `{{variable}}` to the system clipboard via `navigator.clipboard.writeText` and shows a transient toast ("Copied {{var}}").
- If `variables` is empty, render a faint empty-state hint (`variables.empty` translation key).
- A short helper text above the chips explains usage (`variables.hint`).

Rationale for click-to-copy over click-to-insert: a single mechanism works for both the subject `<Input>` and the Monaco body editor without focus tracking or input-type branching.

### 2. Monaco autocomplete provider

- On `Editor` `onMount`, register a `CompletionItemProvider` against the `mjml` language using the `monaco` instance passed to the mount callback.
- Variables are kept in a `useRef` updated each render, so the provider closure reads the latest list without re-registering.
- Trigger characters: `{`. The provider also fires on standard text typing.
- Each completion item has:
  - `label`: variable name
  - `kind`: `monaco.languages.CompletionItemKind.Variable`
  - `insertText`: `{{${name}}}`
  - `detail`: localized "Template variable"
- Registration must happen only once per page lifetime (guard with a module-level boolean ref) — Monaco's language registry is global.

### 3. i18n

Add keys to both `en.json` and `de.json`:

- `variables.title` — section title ("Available variables" / "Verfügbare Variablen")
- `variables.hint` — short usage hint ("Click to copy. Insert anywhere as `{{name}}`.")
- `variables.empty` — empty-state ("No variables for this template.")
- `variables.copied` — toast text with `{name}` placeholder
- `variables.completionDetail` — autocomplete detail label ("Template variable")

## Files touched

- `apps/frontend/src/app/email-templates/edit/index.tsx` — chip section + Monaco `onMount` with completion provider + clipboard handler.
- `apps/frontend/src/app/email-templates/edit/en.json` — new `variables.*` keys.
- `apps/frontend/src/app/email-templates/edit/de.json` — same keys, German.

## Risks

- Monaco completion provider re-registration could create duplicate suggestions if the component remounts. Mitigated by module-level guard flag.
- `navigator.clipboard.writeText` requires secure context (HTTPS or localhost). Acceptable — admin UI is served over HTTPS in production.

## Validation

- Run `pnpm` workspace lint + typecheck for the frontend app.
- Start frontend dev server, navigate to an email template edit page, verify:
  - Chip list shows for each template type with non-empty `variables`.
  - Click on chip copies `{{name}}` and shows toast.
  - In Monaco body, typing `{{` triggers suggestions; selecting one inserts `{{name}}`.
  - Empty-state hint shows for any template type that has no variables.
- Screenshots posted to Linear ticket per workspace guidance.
