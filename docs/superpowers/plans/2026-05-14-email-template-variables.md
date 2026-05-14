# Email Template Variable Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show available Handlebars variables for the current email template type in the editor — as a clickable copy-to-clipboard chip list and as Monaco autocomplete suggestions.

**Architecture:** Modify the existing edit page (`apps/frontend/src/app/email-templates/edit/index.tsx`). Render `template.data.variables` as HeroUI `Chip` components above the subject input; clicking copies `{{name}}` to the clipboard via `navigator.clipboard.writeText` and shows a Sonner toast. Register a Monaco `CompletionItemProvider` for the `mjml` language inside the editor's `onMount` callback, sourcing variables from a `useRef` so updates do not re-register the provider. Guard registration with a module-level flag.

**Tech Stack:** React + TypeScript, `@monaco-editor/react` (Monaco), `@heroui/react` (Chip, Input, Modal, Card), Sonner toasts via existing `useToastMessage()` hook, project i18n via `@attraccess/plugins-frontend-ui` `useTranslations`.

**Testing posture:** Page has no existing unit tests and Monaco is hard to mock cleanly. Verification is performed by running typecheck + lint and using the dev server in a browser, per workspace guidance. Each task includes a manual validation step.

---

## File Structure

- Modify: `apps/frontend/src/app/email-templates/edit/index.tsx` — add chip section, copy handler, Monaco `onMount` with completion provider, module-level registration guard.
- Modify: `apps/frontend/src/app/email-templates/edit/en.json` — add `variables.*` keys.
- Modify: `apps/frontend/src/app/email-templates/edit/de.json` — add `variables.*` keys.

No new files. No backend changes. No new dependencies — `@heroui/react`, `sonner` toast wrapper, and `@monaco-editor/react` are already used in the project.

---

### Task 1: Add i18n keys for variable hints

**Files:**
- Modify: `apps/frontend/src/app/email-templates/edit/en.json`
- Modify: `apps/frontend/src/app/email-templates/edit/de.json`

- [ ] **Step 1: Edit `en.json` — add `variables` block before `actions`**

New content for `en.json` (full file):

```json
{
  "subtitle": "Modify the subject and body (MJML) content of the template.",
  "templateType": {
    "verify-email": "Email Verification",
    "reset-password": "Password Reset",
    "username-changed": "Username Changed",
    "password-changed": "Password Changed",
    "resource-usage-billing-transaction-summary": "Resource Usage Billing Transaction Summary",
    "user-invitation": "User Invitation",
    "project-invitation": "Project Invitation"
  },
  "form": {
    "subject": "Subject",
    "mjmlDocumentation": "MJML Documentation"
  },
  "sections": {
    "template": "Template",
    "preview": "Preview"
  },
  "preview": {
    "iframeTitle": "Body Preview",
    "loading": "Loading...",
    "errorPrefix": "Error loading preview.",
    "emptyPlaceholder": "Start editing the MJML body to see a preview."
  },
  "variables": {
    "title": "Available variables",
    "hint": "Click a variable to copy it. Insert anywhere as {{name}}.",
    "empty": "No variables for this template.",
    "copied": "Copied {name}",
    "completionDetail": "Template variable"
  },
  "actions": {
    "close": "Close",
    "cancel": "Cancel",
    "save": "Save Changes"
  }
}
```

- [ ] **Step 2: Edit `de.json` — same shape, German values**

New content for `de.json` (full file):

```json
{
  "subtitle": "Ändern Sie Betreff und Inhalt (MJML) der Vorlage.",
  "templateType": {
    "verify-email": "E-Mail Verifizierung",
    "reset-password": "Passwort Zurücksetzen",
    "username-changed": "Benutzername geändert",
    "password-changed": "Passwort geändert",
    "resource-usage-billing-transaction-summary": "Ressourcennutzung Kostenübersicht",
    "user-invitation": "Benutzereinladung",
    "project-invitation": "Projekteinladung"
  },
  "form": {
    "subject": "Betreff",
    "mjmlDocumentation": "MJML Dokumentation"
  },
  "sections": {
    "template": "Vorlage",
    "preview": "Vorschau"
  },
  "preview": {
    "iframeTitle": "Körper-Vorschau",
    "loading": "Laden...",
    "errorPrefix": "Fehler beim Laden der Vorschau.",
    "emptyPlaceholder": "Beginnen Sie mit dem Bearbeiten des MJML-Inhalts, um eine Vorschau zu sehen."
  },
  "variables": {
    "title": "Verfügbare Variablen",
    "hint": "Klicken Sie auf eine Variable, um sie zu kopieren. Fügen Sie sie als {{name}} ein.",
    "empty": "Keine Variablen für diese Vorlage.",
    "copied": "{name} kopiert",
    "completionDetail": "Template-Variable"
  },
  "actions": {
    "close": "Schließen",
    "cancel": "Abbrechen",
    "save": "Änderungen speichern"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/email-templates/edit/en.json apps/frontend/src/app/email-templates/edit/de.json
git commit -m "feat(att-44): add i18n keys for email template variable hints"
```

---

### Task 2: Render variable chip list with copy-to-clipboard

**Files:**
- Modify: `apps/frontend/src/app/email-templates/edit/index.tsx`

- [ ] **Step 1: Update imports**

Replace the existing HeroUI import block (lines 9-22 of `index.tsx`) so it also imports `Chip`:

```tsx
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Form,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Link,
} from '@heroui/react';
```

Add toast hook import below the existing `useTranslations` import (line 23):

```tsx
import { useToastMessage } from '../../../components/toastProvider';
```

- [ ] **Step 2: Add toast + variables array in component**

Inside `EditEmailTemplatePage`, immediately after the `template` query (line 43, before `useState` calls), add:

```tsx
  const toast = useToastMessage();
  const variables = useMemo(() => template.data?.variables ?? [], [template.data]);
```

- [ ] **Step 3: Add copy handler**

Below the `variables` `useMemo`, add:

```tsx
  const copyVariable = useCallback(
    (name: string) => {
      const token = `{{${name}}}`;
      navigator.clipboard.writeText(token).then(
        () => toast.success({ title: t('variables.copied', { name: token }) }),
        () => toast.error({ title: t('variables.copied', { name: token }) }),
      );
    },
    [t, toast],
  );
```

- [ ] **Step 4: Render chip list inside the `editor` memo**

Replace the existing `editor` memo (lines 103-118) with:

```tsx
  const variableList = (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t('variables.title')}</span>
      {variables.length === 0 ? (
        <span className="text-sm text-default-500">{t('variables.empty')}</span>
      ) : (
        <>
          <span className="text-xs text-default-500">{t('variables.hint')}</span>
          <div className="flex flex-row flex-wrap gap-2">
            {variables.map((name) => (
              <Chip
                key={name}
                variant="flat"
                color="primary"
                className="cursor-pointer"
                onClick={() => copyVariable(name)}
              >
                {name}
              </Chip>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const editor = useMemo(() => {
    return (
      <>
        {variableList}
        <Input label={t('form.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Editor
          theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
          defaultLanguage="mjml"
          defaultValue={body}
          onChange={(value) => setBody(value ?? '')}
        />
        <Link href="https://documentation.mjml.io/" isExternal showAnchorIcon>
          {t('form.mjmlDocumentation')}
        </Link>
      </>
    );
  }, [body, theme, subject, t, variableList]);
```

`variableList` is computed each render (cheap — N chips). It is included in `useMemo` deps so the modal copy and the inline copy stay in sync.

- [ ] **Step 5: Typecheck + lint**

Run:

```bash
pnpm exec nx run frontend:typecheck
pnpm exec nx run frontend:lint
```

Expected: both pass with 0 errors. Fix any TypeScript errors before continuing.

- [ ] **Step 6: Browser validation**

```bash
pnpm exec nx run frontend:serve
```

In a browser:
1. Log in, navigate to `/email-templates/verify-email/edit` (or any template that has variables).
2. Confirm the chip list renders above the Subject input with the expected variable names.
3. Click a chip. Toast says `Copied {{user.username}}` (or equivalent). Paste anywhere — verify the clipboard contains `{{user.username}}`.
4. Open the editor modal via the expand icon — chip list should also appear there.
5. Switch to a template type that has no variables (if any) — confirm the empty-state hint shows.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/email-templates/edit/index.tsx
git commit -m "feat(att-44): show email template variables as copy-to-clipboard chips"
```

---

### Task 3: Register Monaco autocomplete provider for `{{variable}}`

**Files:**
- Modify: `apps/frontend/src/app/email-templates/edit/index.tsx`

- [ ] **Step 1: Add a ref for the live variable list and a module-level registration guard**

At the top of `index.tsx`, below the `import Editor from '@monaco-editor/react';` line, change the Monaco import to also pull the types we need:

```tsx
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
```

Then update the `useCallback`/`useMemo`/`useRef`/`useState`/`useEffect` import on line 1:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

Below all imports, add a module-level guard and ref-backed variable list registration helper:

```tsx
let variableProviderRegistered = false;

function registerVariableProvider(monaco: Monaco, getVariables: () => string[], detailLabel: string) {
  if (variableProviderRegistered) {
    return;
  }
  variableProviderRegistered = true;
  monaco.languages.registerCompletionItemProvider('mjml', {
    triggerCharacters: ['{'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: getVariables().map((name) => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: `{{${name}}}`,
          detail: detailLabel,
          range,
        })),
      };
    },
  });
}
```

- [ ] **Step 2: Wire up provider inside the component**

Inside `EditEmailTemplatePage`, just below the existing `variables` `useMemo`, add:

```tsx
  const variablesRef = useRef<string[]>([]);
  useEffect(() => {
    variablesRef.current = variables;
  }, [variables]);

  const handleEditorMount = useCallback<OnMount>(
    (_editor, monaco) => {
      registerVariableProvider(monaco, () => variablesRef.current, t('variables.completionDetail'));
    },
    [t],
  );
```

- [ ] **Step 3: Pass the mount handler to the `Editor`**

Inside the `editor` memo, update the `<Editor />` JSX:

```tsx
        <Editor
          theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
          defaultLanguage="mjml"
          defaultValue={body}
          onChange={(value) => setBody(value ?? '')}
          onMount={handleEditorMount}
        />
```

Add `handleEditorMount` to the `useMemo` deps array:

```tsx
  }, [body, theme, subject, t, variableList, handleEditorMount]);
```

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm exec nx run frontend:typecheck
pnpm exec nx run frontend:lint
```

Expected: both pass. The most likely failure is a missing type re-export from `@monaco-editor/react` — if `Monaco` and `OnMount` don't exist, replace with `Parameters<typeof Editor>[0]['onMount']` for `OnMount` and `Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[1]` for `Monaco`, or import `monaco-editor` types directly (it is already a transitive dependency of `@monaco-editor/react`).

- [ ] **Step 5: Browser validation**

```bash
pnpm exec nx run frontend:serve
```

In a browser:
1. Navigate to `/email-templates/verify-email/edit`.
2. In the Monaco body, place the cursor on a blank line and type `{`. After the second `{`, the suggestion popup should show the variable names. Selecting one inserts `{{user.username}}` (etc.) at the cursor.
3. Trigger suggestions manually with `Ctrl/Cmd+Space` — same list appears.
4. Reload the page once and confirm no duplicate suggestions appear (guard works).
5. Switch to a different template type without reloading — confirm the suggestions reflect that type's variable list (ref update works).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/email-templates/edit/index.tsx
git commit -m "feat(att-44): add monaco autocomplete for email template variables"
```

---

### Task 4: Final verification and Linear screenshots

**Files:** none.

- [ ] **Step 1: Run affected precommit checks**

```bash
pnpm exec nx affected -t lint typecheck build --base=main
```

Expected: all green for the frontend project. If `build` fails, do NOT proceed — fix first.

- [ ] **Step 2: Take screenshots in the browser**

With the dev server running, take screenshots of:
- Desktop width: edit page showing chip list above subject, Monaco body, preview.
- Desktop width: Monaco suggestion popup open with variables visible.
- Mobile width (devtools at ~390px): chip list wrapping correctly.

Save the screenshots locally, then post them as comments on Linear issue ATT-44 using the agent-browser tooling per workspace guidance.

- [ ] **Step 3: Push branch and open/refresh PR**

```bash
git push -u origin att-44-show-available-template-variables-in-email-editor
gh pr create --fill || gh pr edit --title "ATT-44: show available template variables in email editor"
```

If a PR already exists, the `||` branch will update its title; otherwise `gh pr create --fill` opens one using the commit messages.
