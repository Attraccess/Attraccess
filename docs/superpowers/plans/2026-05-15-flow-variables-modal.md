# Flow Variables Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modal to the flow editor page (`/resources/:id/flows`) that lists, creates, updates, and deletes flow variables (`resource` and `global` scope) with typed value editing.

**Architecture:** Frontend-only feature wiring the existing React Query hooks (`useFlowVariablesServiceListFlowVariables`, `useFlowVariablesServiceUpsertFlowVariable`, `useFlowVariablesServiceDeleteFlowVariable`). Built as a self-contained sibling folder to existing modals (`logViewer/`, `nodePickerModal/`) using the render-prop trigger pattern. HeroUI components, i18n via `useTranslations`. No new unit tests (matches sibling modal pattern); verification via browser screenshots.

**Tech Stack:** React, TypeScript, HeroUI (`@heroui/react`), React Query, lucide-react icons, `@attraccess/react-query-client`, `@attraccess/plugins-frontend-ui` (`useTranslations`).

---

## File Structure

**Created:**
- `apps/frontend/src/app/resources/details/flows/variablesModal/en.json`
- `apps/frontend/src/app/resources/details/flows/variablesModal/de.json`
- `apps/frontend/src/app/resources/details/flows/variablesModal/editor.tsx` — typed value form (~150 LOC)
- `apps/frontend/src/app/resources/details/flows/variablesModal/index.tsx` — modal shell, tabs, table, render-prop trigger (~220 LOC)

**Modified:**
- `apps/frontend/src/app/resources/details/flows/en.json` — add `actions.variables`
- `apps/frontend/src/app/resources/details/flows/de.json` — add `actions.variables`
- `apps/frontend/src/app/resources/details/flows/index.tsx` — import `VariablesModal`, render in toolbar `Panel`

---

### Task 1: Create i18n stubs for the variables modal

**Files:**
- Create: `apps/frontend/src/app/resources/details/flows/variablesModal/en.json`
- Create: `apps/frontend/src/app/resources/details/flows/variablesModal/de.json`

- [ ] **Step 1: Create the English translations file**

Write `apps/frontend/src/app/resources/details/flows/variablesModal/en.json`:

```json
{
  "title": "Flow variables",
  "subtitle": "Inspect and edit variables read and written by your flow nodes.",
  "tabs": {
    "resource": "Resource",
    "global": "Global"
  },
  "table": {
    "key": "Key",
    "type": "Type",
    "value": "Value",
    "updated": "Updated",
    "actions": "Actions",
    "empty": "No variables yet."
  },
  "actions": {
    "add": "Add variable",
    "edit": "Edit",
    "delete": "Delete",
    "save": "Save",
    "cancel": "Cancel",
    "confirmDelete": "Delete this variable?",
    "confirmDeleteYes": "Delete",
    "confirmDeleteNo": "Cancel"
  },
  "editor": {
    "createTitle": "Add variable",
    "editTitle": "Edit variable: {{key}}",
    "scope": "Scope",
    "scopeResource": "Resource",
    "scopeGlobal": "Global",
    "key": "Key",
    "keyPlaceholder": "e.g. door_unlocked",
    "type": "Type",
    "types": {
      "string": "Text",
      "number": "Number",
      "boolean": "Boolean",
      "object": "Object",
      "array": "Array",
      "null": "Null"
    },
    "value": "Value",
    "valuePlaceholderString": "Some text…",
    "valuePlaceholderNumber": "42",
    "valuePlaceholderJson": "{\n  \"key\": \"value\"\n}",
    "errors": {
      "keyRequired": "Key is required.",
      "numberInvalid": "Value must be a number.",
      "jsonInvalid": "Value must be valid JSON.",
      "typeMismatchObject": "Value must be a JSON object.",
      "typeMismatchArray": "Value must be a JSON array."
    }
  },
  "toast": {
    "saved": {
      "title": "Variable saved"
    },
    "deleted": {
      "title": "Variable deleted"
    },
    "error": {
      "title": "Action failed"
    }
  }
}
```

- [ ] **Step 2: Create the German translations file**

Write `apps/frontend/src/app/resources/details/flows/variablesModal/de.json`:

```json
{
  "title": "Flow-Variablen",
  "subtitle": "Sieh dir Variablen an, die deine Flow-Nodes lesen und schreiben, oder bearbeite sie.",
  "tabs": {
    "resource": "Ressource",
    "global": "Global"
  },
  "table": {
    "key": "Schlüssel",
    "type": "Typ",
    "value": "Wert",
    "updated": "Aktualisiert",
    "actions": "Aktionen",
    "empty": "Noch keine Variablen."
  },
  "actions": {
    "add": "Variable hinzufügen",
    "edit": "Bearbeiten",
    "delete": "Löschen",
    "save": "Speichern",
    "cancel": "Abbrechen",
    "confirmDelete": "Variable wirklich löschen?",
    "confirmDeleteYes": "Löschen",
    "confirmDeleteNo": "Abbrechen"
  },
  "editor": {
    "createTitle": "Variable hinzufügen",
    "editTitle": "Variable bearbeiten: {{key}}",
    "scope": "Geltungsbereich",
    "scopeResource": "Ressource",
    "scopeGlobal": "Global",
    "key": "Schlüssel",
    "keyPlaceholder": "z. B. door_unlocked",
    "type": "Typ",
    "types": {
      "string": "Text",
      "number": "Zahl",
      "boolean": "Boolean",
      "object": "Objekt",
      "array": "Array",
      "null": "Null"
    },
    "value": "Wert",
    "valuePlaceholderString": "Ein Text…",
    "valuePlaceholderNumber": "42",
    "valuePlaceholderJson": "{\n  \"key\": \"value\"\n}",
    "errors": {
      "keyRequired": "Schlüssel ist erforderlich.",
      "numberInvalid": "Wert muss eine Zahl sein.",
      "jsonInvalid": "Wert muss gültiges JSON sein.",
      "typeMismatchObject": "Wert muss ein JSON-Objekt sein.",
      "typeMismatchArray": "Wert muss ein JSON-Array sein."
    }
  },
  "toast": {
    "saved": {
      "title": "Variable gespeichert"
    },
    "deleted": {
      "title": "Variable gelöscht"
    },
    "error": {
      "title": "Aktion fehlgeschlagen"
    }
  }
}
```

- [ ] **Step 3: No commit yet — bundle i18n with implementation in Task 5**

---

### Task 2: Add parent-folder i18n key for the toolbar button

**Files:**
- Modify: `apps/frontend/src/app/resources/details/flows/en.json`
- Modify: `apps/frontend/src/app/resources/details/flows/de.json`

- [ ] **Step 1: Add `actions.variables` in English**

Edit `apps/frontend/src/app/resources/details/flows/en.json`. Replace the `actions` block:

```json
  "actions": {
    "export": "Export",
    "import": "Import",
    "variables": "Variables"
  },
```

- [ ] **Step 2: Add `actions.variables` in German**

Edit `apps/frontend/src/app/resources/details/flows/de.json`. Replace the `actions` block:

```json
  "actions": {
    "export": "Exportieren",
    "import": "Importieren",
    "variables": "Variablen"
  },
```

- [ ] **Step 3: No commit yet — bundle with implementation in Task 5**

---

### Task 3: Build the variable editor form

**Files:**
- Create: `apps/frontend/src/app/resources/details/flows/variablesModal/editor.tsx`

- [ ] **Step 1: Write `editor.tsx`**

```tsx
// Typed editor for one flow variable supporting scope, key, type, value fields
// FEATURE: Flow Variables Modal — manual CRUD on resource/global variables

import { Button, Input, Select, SelectItem, Switch, Textarea } from '@heroui/react';
import { ResourceFlowVariableScope, ResourceFlowVariableValueType } from '@attraccess/react-query-client';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { useCallback, useMemo, useState } from 'react';

export type EditorMode = { mode: 'create' } | { mode: 'edit'; key: string; scope: ResourceFlowVariableScope };

export interface VariableFormValues {
  scope: ResourceFlowVariableScope;
  key: string;
  valueType: ResourceFlowVariableValueType;
  value: unknown;
}

interface Props {
  mode: EditorMode;
  initial?: VariableFormValues;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (values: VariableFormValues) => void;
  t: TFunction;
}

const ALL_TYPES: ResourceFlowVariableValueType[] = ['string', 'number', 'boolean', 'object', 'array', 'null'];

function defaultForType(type: ResourceFlowVariableValueType): unknown {
  if (type === 'string') return '';
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'array') return [];
  if (type === 'object') return {};
  return null;
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return '';
  }
}

export function VariableEditor(props: Props) {
  const { mode, initial, isSaving, onCancel, onSubmit, t } = props;
  const isEdit = mode.mode === 'edit';

  const [scope, setScope] = useState<ResourceFlowVariableScope>(
    initial?.scope ?? (isEdit ? mode.scope : ('resource' as ResourceFlowVariableScope)),
  );
  const [key, setKey] = useState(initial?.key ?? '');
  const [valueType, setValueType] = useState<ResourceFlowVariableValueType>(initial?.valueType ?? 'string');
  const [stringValue, setStringValue] = useState<string>(typeof initial?.value === 'string' ? initial.value : '');
  const [numberValue, setNumberValue] = useState<string>(
    typeof initial?.value === 'number' ? String(initial.value) : '',
  );
  const [boolValue, setBoolValue] = useState<boolean>(typeof initial?.value === 'boolean' ? initial.value : false);
  const [jsonValue, setJsonValue] = useState<string>(
    valueType === 'object' || valueType === 'array' ? stringifyJson(initial?.value) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const onChangeType = useCallback((next: ResourceFlowVariableValueType) => {
    setValueType(next);
    setError(null);
    const fallback = defaultForType(next);
    if (next === 'string') setStringValue(typeof fallback === 'string' ? fallback : '');
    if (next === 'number') setNumberValue('0');
    if (next === 'boolean') setBoolValue(false);
    if (next === 'object' || next === 'array') setJsonValue(stringifyJson(fallback));
  }, []);

  const title = useMemo(() => {
    return isEdit ? t('editor.editTitle', { key: mode.key }) : t('editor.createTitle');
  }, [isEdit, mode, t]);

  const handleSubmit = useCallback(() => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setError(t('editor.errors.keyRequired'));
      return;
    }

    let parsed: unknown;
    if (valueType === 'string') {
      parsed = stringValue;
    } else if (valueType === 'number') {
      const n = Number(numberValue);
      if (numberValue.trim() === '' || Number.isNaN(n) || !Number.isFinite(n)) {
        setError(t('editor.errors.numberInvalid'));
        return;
      }
      parsed = n;
    } else if (valueType === 'boolean') {
      parsed = boolValue;
    } else if (valueType === 'null') {
      parsed = null;
    } else {
      try {
        parsed = JSON.parse(jsonValue);
      } catch {
        setError(t('editor.errors.jsonInvalid'));
        return;
      }
      if (valueType === 'object' && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
        setError(t('editor.errors.typeMismatchObject'));
        return;
      }
      if (valueType === 'array' && !Array.isArray(parsed)) {
        setError(t('editor.errors.typeMismatchArray'));
        return;
      }
    }

    setError(null);
    onSubmit({ scope, key: trimmedKey, valueType, value: parsed });
  }, [key, valueType, stringValue, numberValue, boolValue, jsonValue, scope, onSubmit, t]);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{title}</h3>

      <Select
        label={t('editor.scope')}
        selectedKeys={[scope]}
        onChange={(e) => setScope(e.target.value as ResourceFlowVariableScope)}
        isDisabled={isEdit}
      >
        <SelectItem key="resource">{t('editor.scopeResource')}</SelectItem>
        <SelectItem key="global">{t('editor.scopeGlobal')}</SelectItem>
      </Select>

      <Input
        label={t('editor.key')}
        placeholder={t('editor.keyPlaceholder')}
        value={key}
        onValueChange={setKey}
        isDisabled={isEdit}
      />

      <Select
        label={t('editor.type')}
        selectedKeys={[valueType]}
        onChange={(e) => onChangeType(e.target.value as ResourceFlowVariableValueType)}
      >
        {ALL_TYPES.map((t2) => (
          <SelectItem key={t2}>{t(`editor.types.${t2}`)}</SelectItem>
        ))}
      </Select>

      {valueType === 'string' && (
        <Input
          label={t('editor.value')}
          placeholder={t('editor.valuePlaceholderString')}
          value={stringValue}
          onValueChange={setStringValue}
        />
      )}
      {valueType === 'number' && (
        <Input
          label={t('editor.value')}
          type="number"
          placeholder={t('editor.valuePlaceholderNumber')}
          value={numberValue}
          onValueChange={setNumberValue}
        />
      )}
      {valueType === 'boolean' && (
        <div className="flex items-center gap-3">
          <span>{t('editor.value')}</span>
          <Switch isSelected={boolValue} onValueChange={setBoolValue} />
        </div>
      )}
      {(valueType === 'object' || valueType === 'array') && (
        <Textarea
          label={t('editor.value')}
          minRows={6}
          placeholder={t('editor.valuePlaceholderJson')}
          value={jsonValue}
          onValueChange={setJsonValue}
          classNames={{ input: 'font-mono text-sm' }}
        />
      )}

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="flex flex-row justify-end gap-2">
        <Button variant="flat" onPress={onCancel} isDisabled={isSaving}>
          {t('actions.cancel')}
        </Button>
        <Button color="primary" onPress={handleSubmit} isLoading={isSaving}>
          {t('actions.save')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: No commit yet — bundle with implementation in Task 5**

---

### Task 4: Build the modal shell with tabs and table

**Files:**
- Create: `apps/frontend/src/app/resources/details/flows/variablesModal/index.tsx`

- [ ] **Step 1: Write `index.tsx`**

```tsx
// Flow variables modal with tabs (resource/global), table view, and inline typed editor
// FEATURE: Flow Variables Modal — manual CRUD on resource/global variables

import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tab,
  Tabs,
  Tooltip,
  useDisclosure,
} from '@heroui/react';
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  FlowVariableDto,
  ResourceFlowVariableScope,
  ResourceFlowVariableValueType,
  UseFlowVariablesServiceListFlowVariablesKeyFn,
  useFlowVariablesServiceDeleteFlowVariable,
  useFlowVariablesServiceListFlowVariables,
  useFlowVariablesServiceUpsertFlowVariable,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { EditorMode, VariableEditor, VariableFormValues } from './editor';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  children: (open: () => void) => React.ReactNode;
}

function previewValue(value: unknown): string {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    return (s ?? '').length > 80 ? (s ?? '').slice(0, 77) + '…' : (s ?? '');
  } catch {
    return String(value);
  }
}

function fullValue(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function VariablesModal(props: Props) {
  const { resourceId } = props;
  const { isOpen, onOpenChange, onOpen, onClose } = useDisclosure();
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const formatDateTime = useDateTimeFormatter({ showSeconds: false });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [activeScope, setActiveScope] = useState<ResourceFlowVariableScope>(
    'resource' as ResourceFlowVariableScope,
  );
  const [editor, setEditor] = useState<{ open: false } | { open: true; mode: EditorMode; initial?: VariableFormValues }>(
    { open: false },
  );

  const { data: variables } = useFlowVariablesServiceListFlowVariables(
    { resourceId },
    undefined,
    { enabled: isOpen },
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: UseFlowVariablesServiceListFlowVariablesKeyFn({ resourceId }),
    });
  }, [queryClient, resourceId]);

  const upsert = useFlowVariablesServiceUpsertFlowVariable({
    onSuccess: () => {
      invalidate();
      toast.success({ title: t('toast.saved.title') });
      setEditor({ open: false });
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const remove = useFlowVariablesServiceDeleteFlowVariable({
    onSuccess: () => {
      invalidate();
      toast.success({ title: t('toast.deleted.title') });
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const rows = useMemo<FlowVariableDto[]>(() => {
    const all = variables ?? [];
    return all.filter((row) => row.scope === activeScope);
  }, [variables, activeScope]);

  const handleAdd = useCallback(() => {
    setEditor({
      open: true,
      mode: { mode: 'create' },
      initial: {
        scope: activeScope,
        key: '',
        valueType: 'string' as ResourceFlowVariableValueType,
        value: '',
      },
    });
  }, [activeScope]);

  const handleEdit = useCallback((row: FlowVariableDto) => {
    setEditor({
      open: true,
      mode: { mode: 'edit', key: row.key, scope: row.scope },
      initial: {
        scope: row.scope,
        key: row.key,
        valueType: row.valueType,
        value: row.value,
      },
    });
  }, []);

  const handleSubmit = useCallback(
    (values: VariableFormValues) => {
      upsert.mutate({
        resourceId,
        scope: values.scope,
        key: values.key,
        requestBody: { value: values.value },
      });
    },
    [upsert, resourceId],
  );

  const handleDelete = useCallback(
    (row: FlowVariableDto) => {
      remove.mutate({ resourceId, scope: row.scope, key: row.key });
    },
    [remove, resourceId],
  );

  return (
    <>
      {props.children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span>{t('title')}</span>
            <span className="text-sm font-normal text-default-500">{t('subtitle')}</span>
          </ModalHeader>
          <ModalBody>
            {editor.open ? (
              <VariableEditor
                mode={editor.mode}
                initial={editor.initial}
                isSaving={upsert.isPending}
                onCancel={() => setEditor({ open: false })}
                onSubmit={handleSubmit}
                t={t}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <Tabs
                  selectedKey={activeScope}
                  onSelectionChange={(key) => setActiveScope(key as ResourceFlowVariableScope)}
                  aria-label={t('title')}
                >
                  <Tab key="resource" title={t('tabs.resource')} />
                  <Tab key="global" title={t('tabs.global')} />
                </Tabs>

                <div className="flex flex-row justify-end">
                  <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={handleAdd}>
                    {t('actions.add')}
                  </Button>
                </div>

                <Table
                  aria-label={t('title')}
                  removeWrapper
                  isStriped
                  classNames={{ table: 'min-h-[120px]' }}
                >
                  <TableHeader>
                    <TableColumn>{t('table.key')}</TableColumn>
                    <TableColumn>{t('table.type')}</TableColumn>
                    <TableColumn>{t('table.value')}</TableColumn>
                    <TableColumn>{t('table.updated')}</TableColumn>
                    <TableColumn align="end">{t('table.actions')}</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent={t('table.empty')} items={rows}>
                    {(row) => (
                      <TableRow key={`${row.scope}:${row.key}`}>
                        <TableCell className="font-mono">{row.key}</TableCell>
                        <TableCell>
                          <Chip size="sm" variant="flat">
                            {row.valueType}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <Tooltip content={<pre className="max-w-md whitespace-pre-wrap">{fullValue(row.value)}</pre>}>
                            <span className="font-mono text-sm">{previewValue(row.value)}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-sm text-default-500">{formatDateTime(row.updatedAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-row justify-end gap-1">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              aria-label={t('actions.edit')}
                              onPress={() => handleEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Popover placement="left">
                              <PopoverTrigger>
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  color="danger"
                                  aria-label={t('actions.delete')}
                                  isLoading={remove.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent>
                                <div className="flex flex-col gap-2 p-2">
                                  <p className="text-sm">{t('actions.confirmDelete')}</p>
                                  <div className="flex flex-row justify-end gap-2">
                                    <Button size="sm" variant="flat">
                                      {t('actions.confirmDeleteNo')}
                                    </Button>
                                    <Button size="sm" color="danger" onPress={() => handleDelete(row)}>
                                      {t('actions.confirmDeleteYes')}
                                    </Button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>
              {t('actions.cancel')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: No commit yet — bundle with implementation in Task 5**

---

### Task 5: Wire `VariablesModal` into the flow editor toolbar

**Files:**
- Modify: `apps/frontend/src/app/resources/details/flows/index.tsx`

- [ ] **Step 1: Add import for `VariablesModal` and `Braces` icon**

Open `apps/frontend/src/app/resources/details/flows/index.tsx`. Update the `lucide-react` import (line 21) to include `Braces`:

```tsx
import {
  CheckIcon,
  LayoutGridIcon,
  LogsIcon,
  PlusIcon,
  SaveIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Braces as BracesIcon,
} from 'lucide-react';
```

Add the modal import near the other `./` imports (after the `LogViewer` import on line 29):

```tsx
import { VariablesModal } from './variablesModal';
```

- [ ] **Step 2: Render the trigger button inside the toolbar Panel**

In the same file, locate the `<Panel position="top-right" ...>` block (around line 375). Add the variables button after the `LogViewer` block and before `<Button isIconOnly startContent={<LayoutGridIcon />} ...>`:

```tsx
            <VariablesModal resourceId={Number(resourceId)}>
              {(open) => (
                <Button
                  isIconOnly
                  startContent={<BracesIcon />}
                  onPress={open}
                  aria-label={t('actions.variables')}
                />
              )}
            </VariablesModal>
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm nx run frontend:typecheck
```

Expected: PASS (no TypeScript errors). If the project does not have a `typecheck` target, run `pnpm nx run frontend:lint` instead. If neither exists, run `pnpm tsc -p apps/frontend/tsconfig.json --noEmit`.

- [ ] **Step 4: Run lint**

```bash
pnpm nx run frontend:lint
```

Expected: PASS. Fix any reported issues (unused imports, missing keys, etc.) inline.

- [ ] **Step 5: Commit all the modal work as one feature commit**

```bash
git add \
  apps/frontend/src/app/resources/details/flows/variablesModal/en.json \
  apps/frontend/src/app/resources/details/flows/variablesModal/de.json \
  apps/frontend/src/app/resources/details/flows/variablesModal/editor.tsx \
  apps/frontend/src/app/resources/details/flows/variablesModal/index.tsx \
  apps/frontend/src/app/resources/details/flows/en.json \
  apps/frontend/src/app/resources/details/flows/de.json \
  apps/frontend/src/app/resources/details/flows/index.tsx
git commit -m "feat(flows): variables modal for manual CRUD on flow variables (ATT-278)"
```

---

### Task 6: Browser verification + screenshots

**Files:** none (manual verification).

- [ ] **Step 1: Start the dev environment**

Follow the steps in `project_dev_env.md` memory (or fall back to `pnpm nx serve api` + `pnpm nx serve frontend`). Confirm both servers come up cleanly.

- [ ] **Step 2: Sign in and open a resource flow editor**

Navigate to `http://localhost:<frontend-port>/resources/<id>/flows` for a resource the dev user can manage.

- [ ] **Step 3: Verify happy path**

Click the new `Braces` toolbar button (right side, between the Logs and Layout buttons). Confirm:

1. Modal opens with `Resource` + `Global` tabs.
2. Click `Add variable`. Set type to `string`, key `test_string`, value `hello`. Save. Toast appears; row shows in the table.
3. Edit `test_string` → type `number`, value `42`. Save. Row updates.
4. Add a `boolean` and an `object` variable (object value: `{"foo":"bar"}`). Each saves correctly.
5. Switch to `Global` tab. Add a `null` variable `global_flag`. Save.
6. Hover the truncated value in the table — tooltip shows full JSON.
7. Delete a row via the trash icon. Confirm popover appears; clicking `Delete` removes the row.

- [ ] **Step 4: Verify edge cases**

1. Try to save with empty key → inline error appears, no request fires.
2. Set type to `object`, paste invalid JSON → inline error.
3. Set type to `array`, paste `{"foo":1}` → inline `type mismatch` error.

- [ ] **Step 5: Capture screenshots**

Capture at minimum:

1. Closed flow editor with the new toolbar button visible.
2. Modal open on `Resource` tab with at least one row of each type.
3. Editor form open in `create` mode.
4. Editor form open in `edit` mode with a value loaded.
5. Delete confirmation popover open.
6. `Global` tab with at least one row.

- [ ] **Step 6: Post the screenshots back to the Linear ticket**

Use `linear_agent_give_feedback` (or attach via existing Linear flow) with a short caption per image describing the state shown. Required by agent_guidance.

- [ ] **Step 7: No commit needed for this task.**

---

## Self-Review

**Spec coverage:**
- Toolbar trigger → Task 5
- Modal w/ tabs + table → Task 4
- Typed editor (string/number/boolean/object/array/null) → Task 3
- Delete confirm popover → Task 4
- i18n (en/de) → Tasks 1, 2
- Wire-up + invalidation on mutation → Task 4
- Browser verification + screenshots → Task 6

No gaps.

**Placeholder scan:** no TBDs, every code step has full source, every command has expected output.

**Type consistency:** `EditorMode`, `VariableFormValues` defined in `editor.tsx`, imported by `index.tsx`. `ResourceFlowVariableScope` + `ResourceFlowVariableValueType` come from `@attraccess/react-query-client`. Function names (`handleAdd`, `handleEdit`, `handleSubmit`, `handleDelete`) consistent across tasks.
