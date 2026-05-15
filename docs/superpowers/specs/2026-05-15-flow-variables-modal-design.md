# Flow Variables Modal — Design (ATT-278)

## Purpose

Give users a UI on the flow editor page to manually create, update, delete, and view current values of flow variables for the active resource (both `resource` and `global` scope).

Backend CRUD already exists:

- `GET /resources/:resourceId/flow-variables` → returns both `global` and `resource` rows.
- `PUT /resources/:resourceId/flow-variables/:scope/:key` → upsert.
- `DELETE /resources/:resourceId/flow-variables/:scope/:key` → delete.

React Query hooks generated:

- `useFlowVariablesServiceListFlowVariables`
- `useFlowVariablesServiceUpsertFlowVariable`
- `useFlowVariablesServiceDeleteFlowVariable`

This work is frontend-only: add a modal, wire to existing hooks, invalidate the list on mutations.

## UX

### Toolbar entry point

Add a new icon button to the top-right `Panel` in `apps/frontend/src/app/resources/details/flows/index.tsx`, placed alongside the existing Logs/Layout buttons. Icon: `Braces` from `lucide-react`. Render-prop pattern matching `LogViewer` and `NodePickerModal`.

### Modal

- HeroUI `Modal`, size `2xl`, scroll behavior `inside`.
- Header: "Flow Variables".
- Tabs (HeroUI `Tabs`): `Resource` | `Global`. Switching scope only filters the list and is preselected when adding a new variable.
- Body: variable list (see Table) plus an "Add variable" button.
- Footer: close.

### Table (variable list)

Columns:

| Key | Type | Value | Updated | Actions |

- `Key` — monospace.
- `Type` — chip with the `valueType` value.
- `Value` — truncated single-line JSON preview, max 80 chars, ellipsised; tooltip on hover with full value (pre-wrapped).
- `Updated` — relative time (`formatDistanceToNow`-style if available in repo; else `toLocaleString`).
- `Actions` — edit (pencil) + delete (trash). Delete uses inline confirm popover (HeroUI `Popover` with confirm/cancel) — no native `confirm()` per CLAUDE-style guidance.

Empty state: small centered message and call to action button.

### Editor form (inline, replaces table when editing/creating)

Header: "Add variable" or "Edit variable: <key>".

Fields:

- **Scope** select (`resource` | `global`) — disabled when editing (scope+key identify a row).
- **Key** input — disabled when editing. Required, trim, min length 1.
- **Type** select: `string | number | boolean | object | array | null`. Changing type resets value to a sensible default for that type.
- **Value** — switches by type:
  - `string` → HeroUI `Input`.
  - `number` → HeroUI `Input` `type="number"`, parsed to `number` on submit; reject `NaN`.
  - `boolean` → HeroUI `Switch`.
  - `null` → no input; value is fixed to `null`.
  - `object` / `array` → HeroUI `Textarea` with JSON. `JSON.parse` on submit; on failure show inline error and block submit. Validate that result type matches selected type (`Array.isArray` for `array`, `typeof === 'object' && !Array.isArray` for `object`).

Buttons: `Save` (primary), `Cancel` (secondary). Save calls upsert; on success invalidates list query and returns to table view.

## Data flow

1. List query keyed by resourceId. On mount load variables.
2. Upsert mutation: `PUT` with `{ scope, key, requestBody: { value } }` (server infers `valueType`). On success `queryClient.invalidateQueries({ queryKey: UseFlowVariablesServiceListFlowVariablesKeyFn({ resourceId }) })`.
3. Delete mutation: same invalidation.
4. Errors surfaced via existing `useToastMessage().apiError` pattern (see `index.tsx`).

## File layout

```
apps/frontend/src/app/resources/details/flows/variablesModal/
  index.tsx     // modal + tabs + table + render-prop trigger
  editor.tsx    // typed value editor (form fields by type)
  en.json       // English i18n
  de.json       // German i18n
```

`index.tsx` wires both via `useTranslations` (matching local pattern in this folder).

## Wire-up in flow editor

In `apps/frontend/src/app/resources/details/flows/index.tsx`, import `VariablesModal` and add inside the toolbar `Panel` next to existing buttons:

```tsx
<VariablesModal resourceId={Number(resourceId)}>
  {(open) => <Button isIconOnly startContent={<BracesIcon />} onPress={open} aria-label={t('actions.variables')} />}
</VariablesModal>
```

Add `actions.variables` translation key to `en.json` + `de.json` in the parent flow folder.

## Validation rules

- Key: required, non-empty after trim. No max length enforced client-side (backend column is `varchar`); rely on server.
- Number: must parse to finite number; reject empty + `NaN`.
- Object/array: must be valid JSON and match selected type.
- Scope: must be one of the enum values.

## Out of scope

- Bulk import/export of variables.
- Variable usage inspection (which nodes reference this variable).
- History / audit log of value changes.
- Search/filter within the table.
- Permissions UI — backend already enforces `canManageResources`.

## Testing approach

- Frontend: rely on manual browser verification via screenshots (per workspace guidance). No new unit tests required for this UI given existing repo patterns for similar modals (`LogViewer`, `NodePickerModal`) have no tests.
- Backend: already covered by existing controller + service specs.

## Open questions

None. Proceed to implementation plan.
