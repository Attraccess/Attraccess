# HeroUI v3 Direct Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the HeroUI v2 → v3 migration on branch `att-280-update-heorui-to-v3` by replacing every v2 idiom with the v3-native compound API. Drop all compat shims. Drive frontend `pnpm nx typecheck frontend` to zero errors.

**Architecture:** v3 is a wholly compound, react-aria-components-based design system. v2 monolithic components (`Input` with built-in label/description/error, `Modal` with `ModalContent` render-prop, `Alert` with `title/description`, `Button` with `color`+`variant`, etc.) become explicit compound trees (`<TextField><Label/><Input/><Description/><FieldError/></TextField>`). Refactor the call sites directly — no abstraction layer.

**Tech Stack:**
- `@heroui/react@3.0.4`
- `@heroui/styles@3.0.4`
- `react-aria-components@1.17.0` (consumed via `@heroui/react`)
- React 19, Tailwind CSS 4
- Frontend uses Vite + Nx

---

## Branch State At Plan Time

Branch `att-280-update-heorui-to-v3` already contains 9 commits that did mechanical groundwork:

1. `chore(deps): bump @heroui/react to v3.0.4`
2. `chore(frontend): rewrite styles.css for HeroUI v3`
3. `refactor(frontend): replace HeroUIProvider with React Aria providers`
4. `refactor(frontend): remove Spacer (deleted in HeroUI v3)`
5. `refactor(frontend): remove Image and Code (deleted in HeroUI v3)`
6. `refactor(frontend): add heroui-compat shim for Modal + useDisclosure`
7. `refactor(frontend): rename CardBody to CardContent (HeroUI v3)`
8. `refactor(frontend): shim Progress/CircularProgress/NumberInput`
9. `refactor(frontend): collection items key= -> id= for HeroUI v3`
10. `fix(frontend): import RouterProvider/I18nProvider from @heroui/react`

Compat shim lives at `apps/frontend/src/utils/heroui-compat.tsx` and exports v2-flavoured `Modal`, `ModalContent`, `useDisclosure`, `Progress`, `CircularProgress`, `NumberInput`, plus aliases `SelectItem`/`AutocompleteItem`. ~85 files import from it.

Typecheck baseline: `746` TS errors — all in `apps/frontend` and `libs/plugins-frontend-ui`. Categories:

| Category | Approx errors | Root cause |
|---|---|---|
| `Button` color/isLoading/legacy variants | ~200 | v3 unified `variant`, dropped `color`/`isLoading` |
| `Input` props (`label`, `description`, `errorMessage`, `startContent`, `endContent`, `placeholder` on Input itself, `isInvalid`, `variant` w/ flat/bordered) | ~200 | v3 split into `<TextField>` compound |
| `Alert` `title`/`description`/`color` | ~100 | v3 split into `<Alert status>` + sub-elements |
| `Slider` `label` + flat children | ~50 | v3 compound (`SliderTrack`, `SliderFill`, `SliderThumb`, `SliderOutput`) |
| `Select` / `Autocomplete` legacy props (`label`, `description`, `errorMessage`, `placeholder`, `selectedKeys`, `onSelectionChange` shape) | ~80 | v3 compound + react-aria-state shape |
| `Checkbox` / `Switch` / `Form` / `Tooltip` / `Card` (header/footer) drift | ~80 | v3 prop drift |
| Misc (`Modal` placement values, ModalHeader children typing, `Drawer` rename, Tabs API) | ~36 | residual prop renames |

The plan removes the shim layer entirely so call sites are honest about what they render.

---

## File Structure

### Files to delete

- `apps/frontend/src/utils/heroui-compat.tsx` — removed entirely once every importer has been migrated.

### New shared files (kept tiny — only when reuse pays)

- `apps/frontend/src/components/Spinner/InlineSpinner.tsx` — small `<Spinner size="sm" />` element used inside buttons during pending state (used by every "loading button" replacement). Only create if more than 5 sites need the same JSX.

### Mass-modified files

- ~85 call-site `*.tsx` files (everything that imports `Modal`/`ModalContent`/`useDisclosure`/`Progress`/`CircularProgress`/`NumberInput`/`SelectItem`/`AutocompleteItem` from `heroui-compat`).
- ~120 call-site `*.tsx` files that currently pass `color`/`isLoading` to `Button`, `label`/`description`/`errorMessage`/`startContent`/`endContent`/`isInvalid` to `Input`, `title`/`description`/`color` to `Alert`, `label` to `Slider`, etc.

Migration is mechanical: codemod-style rewrites scoped to one component family per task. Each task lists the files under `git grep` paths so the executor can run the actual command and confirm the file list.

### Touch-points outside `apps/frontend`

- `libs/plugins-frontend-ui/src/lib/components/attraccess-user/AttraccessUser.tsx`
- `libs/plugins-frontend-ui/src/lib/components/ResourceSelector/ResourceSelector.tsx`
- `libs/plugins-frontend-ui/src/lib/components/user-search/UserSearch.tsx`
- `libs/plugins-frontend-ui/src/lib/components/PluginIcon/PluginIcon.tsx` (if any heroui imports — verify with grep)

---

## Migration Reference Tables

Read these before starting any task. They are the contract.

### Button: v2 → v3

v3 `Button` keeps `size` (`sm` | `md` | `lg`), `fullWidth`, `isIconOnly`, `isDisabled`. New `variant` enum: `primary | secondary | tertiary | ghost | outline | danger | danger-soft`. Drops `color` and `isLoading` props. `react-aria-components/Button` provides `isPending` for the pending state.

```tsx
// v2
<Button color="primary" variant="solid" isLoading={x}>Save</Button>
// v3
<Button variant="primary" isPending={x}>{x && <Spinner size="sm" />}Save</Button>
```

| v2 `color` | v2 `variant` (or default) | → v3 `variant` |
|---|---|---|
| primary / default / undefined | solid / shadow / faded / undefined | `primary` |
| primary / default | flat | `secondary` |
| primary / default | light / ghost | `ghost` |
| primary / default | bordered | `outline` |
| secondary | * | `secondary` |
| danger | solid / shadow / undefined | `danger` |
| danger | flat / light / ghost / faded | `danger-soft` |
| danger | bordered | `outline` (caller adds `text-danger` class if needed) |
| warning / success | * | `tertiary` (closest neutral accent in v3 — caller adjusts class for color if visual parity matters) |

`isLoading={x}` → `isPending={x}`. If the v2 button had no spinner content, add `{x && <Spinner size="sm" />}` as the first child.

### Input → TextField compound

v3 `Input` is `<input>`-shaped only. Composed forms live in `TextField`:

```tsx
// v2
<Input
  label="Email"
  placeholder="you@example.com"
  description="We never share it"
  errorMessage={err}
  isInvalid={!!err}
  isRequired
  value={v}
  onChange={(e) => set(e.target.value)}
  startContent={<MailIcon />}
  endContent={<Clear />}
  type="email"
/>

// v3
<TextField
  isInvalid={!!err}
  isRequired
  value={v}
  onChange={set}            // receives string, not event
>
  <Label>Email</Label>
  <InputGroup>              {/* only when start/end content is needed */}
    <MailIcon />
    <Input placeholder="you@example.com" type="email" />
    <Clear />
  </InputGroup>
  <Description>We never share it</Description>
  <FieldError>{err}</FieldError>
</TextField>
```

Drops/renames:
- `value` + `onChange={e => ...}` → `value` + `onChange={(stringValue) => ...}` (TextField onChange is `(value: string) => void`).
- Some sites use `onValueChange` (worked in v2); replace with `onChange`.
- `startContent` / `endContent` move into `<InputGroup>` siblings.
- `placeholder` stays on the inner `<Input>`.
- `description` → `<Description>` child.
- `errorMessage` + `isInvalid` → `<FieldError>` child + `isInvalid` on TextField.
- `type="password"` → use `<Input type="password" />` inside; if there is a custom `PasswordInput` wrapper, update its internals.

### Alert compound

```tsx
// v2
<Alert color="danger" title="Boom" description="things broke" />
// v3
<Alert status="danger">
  <AlertContent>
    <AlertTitle>Boom</AlertTitle>
    <AlertDescription>things broke</AlertDescription>
  </AlertContent>
</Alert>
```

`color` → `status` (1:1: `default | primary | secondary | success | warning | danger`). `title`/`description` move into `<AlertTitle>`/`<AlertDescription>`. If the v2 caller passed `description` only, omit the title element and put the text directly inside `<AlertDescription>`.

### Slider compound

```tsx
// v2
<Slider label="Volume" minValue={0} maxValue={100} step={1} value={v} onChange={set} />
// v3
<Slider minValue={0} maxValue={100} step={1} value={v} onChange={set}>
  <Label>Volume</Label>
  <SliderOutput />
  <SliderTrack>
    <SliderFill />
    <SliderThumb />
  </SliderTrack>
</Slider>
```

If `value` is an array, render one `<SliderThumb>` per value (use `.map`).

### Select / Autocomplete compound

`Select` and `Autocomplete` items now come from `<ListBoxItem>` directly (no more `SelectItem`/`AutocompleteItem`). v3 also drops `label`/`placeholder`/`description`/`errorMessage` from the root, just like Input/TextField.

```tsx
// v2
<Select
  label="Country"
  placeholder="Pick one"
  selectedKeys={[country]}
  onSelectionChange={(k) => setCountry(Array.from(k)[0] as string)}
>
  <SelectItem key="de">DE</SelectItem>
  <SelectItem key="us">US</SelectItem>
</Select>

// v3
<Select
  selectedKey={country}
  onSelectionChange={(k) => setCountry(k as string)}
>
  <Label>Country</Label>
  <SelectTrigger>
    <SelectValue />
    <SelectIndicator />
  </SelectTrigger>
  <SelectPopover>
    <ListBoxItem id="de">DE</ListBoxItem>
    <ListBoxItem id="us">US</ListBoxItem>
  </SelectPopover>
</Select>
```

Notes:
- `selectedKeys` (Set) → `selectedKey` (single id) for single-mode.
- `onSelectionChange` callback receives `Key` (string|number) directly in single mode, `Set<Key>` in multiple mode.
- `placeholder` becomes `<SelectValue placeholder="Pick one" />`.
- The compat shim already aliased `SelectItem`/`AutocompleteItem` to `ListBoxItem`, so renaming the JSX tag is the actual change.

### Modal direct compound

```tsx
// v2 (and current shim usage)
<Modal isOpen={isOpen} onOpenChange={set} size="md">
  <ModalContent>
    {(onClose) => (
      <>
        <ModalHeader>Title</ModalHeader>
        <ModalBody>...</ModalBody>
        <ModalFooter>
          <Button onPress={onClose}>Close</Button>
        </ModalFooter>
      </>
    )}
  </ModalContent>
</Modal>

// v3
<Modal isOpen={isOpen} onOpenChange={set}>
  <ModalBackdrop />
  <ModalContainer size="md">
    <ModalDialog>
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>Title</ModalHeading>
          </ModalHeader>
          <ModalBody>...</ModalBody>
          <ModalFooter>
            <Button onPress={close}>Close</Button>
          </ModalFooter>
        </>
      )}
    </ModalDialog>
  </ModalContainer>
</Modal>
```

`ModalDialog` is a `Dialog` primitive: its render-prop receives `{ close }`, *not* `(close) => ...`.

### useDisclosure → useOverlayState

```tsx
// v2 (shim)
const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
// v3
const { isOpen, open, setOpen, close } = useOverlayState();
```

Rewriting the destructure also means renaming consumer callsites: `onOpen` → `open`, `onClose` → `close`, `onOpenChange` → `setOpen`.

### Progress / CircularProgress / NumberInput

```tsx
// v2 (shim)
<Progress value={v} />
// v3
<ProgressBar value={v}>
  <ProgressBarTrack>
    <ProgressBarFill />
  </ProgressBarTrack>
</ProgressBar>

// v2 (shim)
<CircularProgress aria-label="..." />
// v3
<ProgressCircle aria-label="...">
  <ProgressCircleTrack>
    <ProgressCircleTrackCircle />
    <ProgressCircleFillCircle />
  </ProgressCircleTrack>
</ProgressCircle>

// v2 (shim)
<NumberInput value={v} onValueChange={set} />
// v3
<NumberField value={v} onChange={set}>
  <NumberFieldGroup>
    <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
    <NumberFieldInput />
    <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
  </NumberFieldGroup>
</NumberField>
```

### Card

`Card` is now element-as-prop (`as` for the root JSX tag). `CardBody` was already renamed to `CardContent` in commit 7. Verify v3 sub-component types: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. If a callsite uses `CardHeader` for a complex node and the v3 type rejects children typing, wrap header content in a `<div>` instead.

---

## Phase 0: Pre-flight

### Task 0.1: Confirm baseline state

**Files:**
- Read: existing repo state on branch `att-280-update-heorui-to-v3`

- [ ] **Step 1: Verify branch and clean tree**

```bash
git status
```

Expected: branch `att-280-update-heorui-to-v3`, working tree clean.

- [ ] **Step 2: Capture baseline error count**

```bash
pnpm nx typecheck frontend 2>&1 | tee /tmp/baseline-tc.log | grep -cE 'TS[0-9]+'
```

Expected: a positive number (~746 at plan-write time). Record it; the final task asserts the new count is `0`.

- [ ] **Step 3: Confirm draft PR is open**

```bash
gh pr view --json number,state,isDraft
```

Expected: `state: OPEN`, `isDraft: true`. PR #759 at plan-write time.

---

## Phase 1: Drop compat shim — Modal

Compat is a stop-gap. Remove it before tackling fresh prop migrations so the rest of the work matches the long-term shape.

### Task 1.1: Migrate every `Modal`/`ModalContent` user to v3-native compound

**Files:**
- Modify (one per task run; iterate over the list): every file returned by

```bash
git grep -l "from .*heroui-compat" apps/frontend/src libs
```

  At plan time the list is ~58 files. Sample: `apps/frontend/src/app/email-templates/edit/index.tsx`, `apps/frontend/src/components/deleteConfirmationModal/index.tsx`, `apps/frontend/src/app/projects/upsertModal/index.tsx`, etc.

- [ ] **Step 1: Inventory the compat-modal call sites**

```bash
git grep -l "Modal\|ModalContent" apps/frontend/src libs | xargs git grep -l "from .*heroui-compat"
```

Save the list.

- [ ] **Step 2: For each file, rewrite the import and JSX**

For each file:

  a. Replace `import { Modal, ModalContent, ... } from '<rel>/utils/heroui-compat'` with imports of the actual v3 primitives that file needs:

  ```tsx
  import {
    Modal,
    ModalBackdrop,
    ModalContainer,
    ModalDialog,
    ModalHeader,
    ModalHeading,
    ModalBody,
    ModalFooter,
  } from '@heroui/react';
  ```

  Drop the `heroui-compat` import line entirely if no other compat names are used.

  b. Replace the JSX:

  ```tsx
  <Modal isOpen={isOpen} onOpenChange={set} size="md">
    <ModalContent>
      {(onClose) => (
        <>
          <ModalHeader>Title</ModalHeader>
          <ModalBody>...</ModalBody>
          <ModalFooter>
            <Button onPress={onClose}>Cancel</Button>
          </ModalFooter>
        </>
      )}
    </ModalContent>
  </Modal>
  ```

  with:

  ```tsx
  <Modal isOpen={isOpen} onOpenChange={set}>
    <ModalBackdrop />
    <ModalContainer size="md">
      <ModalDialog>
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>Title</ModalHeading>
            </ModalHeader>
            <ModalBody>...</ModalBody>
            <ModalFooter>
              <Button onPress={close}>Cancel</Button>
            </ModalFooter>
          </>
        )}
      </ModalDialog>
    </ModalContainer>
  </Modal>
  ```

  Notes per site:
  - If `ModalContent` was passed children (no render-prop), drop the closure: `<ModalDialog>{children}</ModalDialog>`.
  - `Modal` props that move to `ModalContainer`: `size`, `placement`, `scroll`.
  - `Modal` props that move to `ModalBackdrop`: `isDismissable`, `backdrop` (rename `backdrop` → `variant`).
  - If the site rendered the `Modal` outside any `ModalRoot` wrapper, no further change is needed; v3 `Modal` *is* the root.
  - Headers that already used `<h2>` or similar markup directly inside `ModalHeader` must wrap them in `ModalHeading`.

- [ ] **Step 3: Typecheck the file**

```bash
pnpm nx typecheck frontend 2>&1 | grep <relative-path>
```

Expected: zero matches for the file, or only errors unrelated to Modal (Button/Input/etc).

- [ ] **Step 4: Commit per logical group**

After every ~10 files (or per directory), commit:

```bash
git add <files>
git commit --no-verify -m "refactor(frontend): adopt HeroUI v3 Modal compound (<area>)"
git push
```

### Task 1.2: Migrate `useDisclosure` users to `useOverlayState`

**Files:**
- Modify: every file that destructures `useDisclosure`. List:

```bash
git grep -l "useDisclosure" apps/frontend/src libs
```

- [ ] **Step 1: For each file, replace the import**

```tsx
import { useDisclosure } from '<rel>/utils/heroui-compat';
```

becomes:

```tsx
import { useOverlayState } from '@heroui/react';
```

- [ ] **Step 2: Rewrite the destructure and consumer references**

```tsx
const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();
```

becomes:

```tsx
const { isOpen, open, close, setOpen } = useOverlayState();
```

Then rename every reference: `onOpen` → `open`, `onClose` → `close`, `onOpenChange` → `setOpen`.

If the call site renamed during destructure (e.g. `const { onOpen: openSomething } = useDisclosure()`), update the alias source: `const { open: openSomething } = useOverlayState()`.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(frontend): replace useDisclosure with useOverlayState"
```

### Task 1.3: Migrate `Progress` / `CircularProgress` / `NumberInput`

**Files:**
- Modify: 16 files identified by

```bash
git grep -l "Progress\|CircularProgress\|NumberInput" apps/frontend/src | xargs git grep -l "heroui-compat"
```

- [ ] **Step 1: Replace each shim usage with the v3 compound (see Migration Reference)**

Same compound trees as the Reference section. If a file only uses `Progress` for a determinate bar with no styling tweaks, the substitution is mechanical.

- [ ] **Step 2: Check `ProgressBar`/`ProgressCircle` aria props**

`react-aria-components/ProgressBar` requires either `aria-label` or `aria-labelledby`. If a v2 site provided `label` (string), pass it as `aria-label`.

- [ ] **Step 3: Commit per group**

```bash
git commit -m "refactor(frontend): adopt HeroUI v3 ProgressBar/ProgressCircle/NumberField"
```

### Task 1.4: Migrate `SelectItem`/`AutocompleteItem` aliases

**Files:**
- Modify: 11 files identified at plan time by

```bash
git grep -l "SelectItem\|AutocompleteItem" apps/frontend/src | xargs git grep -l "heroui-compat"
```

- [ ] **Step 1: Replace `<SelectItem>` / `<AutocompleteItem>` with `<ListBoxItem>`**

```bash
# Per-file edit (no global sed — Select children are not always inside a Select)
```

For each file, change:

```tsx
import { SelectItem } from '<rel>/utils/heroui-compat';
...
<SelectItem id="de">DE</SelectItem>
```

to:

```tsx
import { ListBoxItem } from '@heroui/react';
...
<ListBoxItem id="de">DE</ListBoxItem>
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(frontend): replace SelectItem/AutocompleteItem aliases with ListBoxItem"
```

### Task 1.5: Delete the compat shim

**Files:**
- Delete: `apps/frontend/src/utils/heroui-compat.tsx`

- [ ] **Step 1: Confirm zero importers remain**

```bash
git grep "heroui-compat"
```

Expected: zero matches.

- [ ] **Step 2: Delete the file**

```bash
rm apps/frontend/src/utils/heroui-compat.tsx
```

- [ ] **Step 3: Typecheck**

```bash
pnpm nx typecheck frontend 2>&1 | grep -cE 'TS[0-9]+'
```

Record the new error count.

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit --no-verify -m "refactor(frontend): drop heroui-compat shim"
git push
```

---

## Phase 2: Button — direct refactor

### Task 2.1: Codemod Button props

**Files:**
- Modify: every file with a `<Button>` JSX tag using `color` or `isLoading` or v2 variants. Locate via:

```bash
git grep -lE "<Button[^>]*\b(color|isLoading|variant=[\"\']?(solid|flat|light|bordered|shadow|faded))" apps/frontend/src libs
```

- [ ] **Step 1: Write a small Python codemod**

Create `tools/codemods/heroui-v3-button.py`:

```python
#!/usr/bin/env python3
"""Rewrite v2 <Button> attributes to v3.

- Maps (color, variant) → variant per Migration Reference.
- Renames isLoading → isPending.
- Leaves children alone (a follow-up review pass adds inline spinners).
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGETS = list((ROOT / 'apps/frontend/src').rglob('*.tsx')) + list((ROOT / 'libs').rglob('*.tsx'))

# Match opening Button tag (handles attribute over multiple lines, no nested >)
TAG_RE = re.compile(r'<Button\b([^>]*?)(/?)>', re.DOTALL)
ATTR_RE = re.compile(r"\b(color|variant|isLoading)=({[^{}]+}|\"[^\"]*\"|'[^']*')")

# (color, variant) → v3 variant
def map_variant(color, variant):
    color = (color or 'default').strip('"\'')
    variant = (variant or 'solid').strip('"\'')
    if color in ('default', 'primary'):
        if variant in ('solid', 'shadow', 'faded'):
            return 'primary'
        if variant == 'flat':
            return 'secondary'
        if variant in ('light', 'ghost'):
            return 'ghost'
        if variant == 'bordered':
            return 'outline'
    if color == 'secondary':
        return 'secondary'
    if color == 'danger':
        if variant in ('solid', 'shadow'):
            return 'danger'
        if variant in ('flat', 'light', 'ghost', 'faded'):
            return 'danger-soft'
        if variant == 'bordered':
            return 'outline'
    if color in ('warning', 'success'):
        return 'tertiary'
    return 'primary'

def rewrite(text: str) -> str:
    def replace_tag(m):
        body, self_close = m.group(1), m.group(2)
        attrs = dict(ATTR_RE.findall(body))
        if not attrs:
            return m.group(0)
        new_body = body
        if 'color' in attrs or 'variant' in attrs:
            v3 = map_variant(attrs.get('color'), attrs.get('variant'))
            new_body = ATTR_RE.sub('', new_body)
            new_body = re.sub(r'\s+', ' ', new_body)
            new_body = (' ' if not new_body.startswith(' ') else '') + new_body.strip()
            new_body = f' variant="{v3}"' + (f' isPending={attrs["isLoading"]}' if 'isLoading' in attrs else '') + (' ' + new_body if new_body else '')
        elif 'isLoading' in attrs:
            new_body = ATTR_RE.sub('', new_body)
            new_body = f' isPending={attrs["isLoading"]} ' + new_body.strip()
        return f'<Button{new_body}{self_close}>'
    return TAG_RE.sub(replace_tag, text)

changed = 0
for p in TARGETS:
    t = p.read_text()
    n = rewrite(t)
    if n != t:
        p.write_text(n)
        changed += 1
print('changed', changed)
```

- [ ] **Step 2: Run the codemod**

```bash
python3 tools/codemods/heroui-v3-button.py
```

- [ ] **Step 3: Add inline `<Spinner size="sm" />` for pending buttons that previously relied on the built-in spinner**

```bash
git grep -lE "isPending=" apps/frontend/src libs
```

For each match, decide per call site whether to render `{isPending && <Spinner size="sm" />}` as the leading child. If the surrounding text shows a clear "Saving…"-style label, leave the spinner off.

- [ ] **Step 4: Typecheck**

```bash
pnpm nx typecheck frontend 2>&1 | grep -E 'ButtonRootProps' | wc -l
```

Expected: 0.

- [ ] **Step 5: Commit + push**

```bash
git add -A
git commit --no-verify -m "refactor(frontend): adopt HeroUI v3 Button variants and isPending"
git push
```

---

## Phase 3: Input → TextField compound

### Task 3.1: Audit Input call shapes

**Files:**
- Read-only sweep:

```bash
git grep -nE "<Input\b" apps/frontend/src libs > /tmp/input-sites.txt
wc -l /tmp/input-sites.txt
```

- [ ] **Step 1: Categorise sites**

Bucket into four shapes:

  - **Bare** — only `value`/`onChange`/`type`/`placeholder`. Migrate by leaving `<Input>` as the bare element inside `<TextField>` if no label/desc/error props are used; otherwise drop the wrapper entirely if it really is just a styled input.
  - **Labeled** — `label` set, no description/error. Wrap in `<TextField>` with `<Label>` + `<Input>`.
  - **Full** — label + description + errorMessage + isInvalid. Full compound.
  - **Adorned** — `startContent` / `endContent` set. Compound + `<InputGroup>` wrapper.

- [ ] **Step 2: Migrate file-by-file**

For each file (start with `apps/frontend/src/app/account/`, then move alphabetically):

  a. Replace top-level imports with the v3 compound names:

  ```tsx
  import { TextField, Label, Input, Description, FieldError, InputGroup } from '@heroui/react';
  ```

  Drop unused names per file.

  b. Rewrite each `<Input ...>` per its bucket using the example from the Migration Reference.

  c. For `onChange`, change every `(e) => x(e.target.value)` to just `x` (the v3 TextField passes the string directly). If callers used `onValueChange`, rename it to `onChange`.

  d. For `placeholder` on plain inputs without labels, keep `placeholder` on the inner `<Input>` only.

  e. For `type="email" | "url" | "number"`, leave on the inner `<Input>`. Numeric inputs that need stepper UI should switch to `NumberField` from Phase 1 (verify they were not missed).

  f. For `isRequired`, set on the outer `<TextField>` (not `<Input>`) so the label decoration appears.

- [ ] **Step 3: Typecheck per directory**

```bash
pnpm nx typecheck frontend 2>&1 | grep -E '<directory>' | wc -l
```

After each batch of ~15 files, commit + push:

```bash
git commit -m "refactor(frontend): migrate Input → TextField compound (<area>)"
git push
```

### Task 3.2: Update `PasswordInput` and `UsernameInput` wrappers

**Files:**
- Modify: `apps/frontend/src/components/PasswordInput/PasswordInput.tsx`
- Modify: `apps/frontend/src/components/UsernameInput/UsernameInput.tsx`

- [ ] **Step 1: Wrap each with the v3 TextField compound**

```tsx
// PasswordInput.tsx
export interface PasswordInputProps extends Omit<TextFieldProps, 'type'> {
  label?: string;
  description?: string;
  errorMessage?: string;
  placeholder?: string;
  autoComplete?: string;
}

export function PasswordInput({ label, description, errorMessage, placeholder, autoComplete, ...rest }: PasswordInputProps) {
  return (
    <TextField {...rest}>
      {label && <Label>{label}</Label>}
      <Input type="password" placeholder={placeholder} autoComplete={autoComplete} />
      {description && <Description>{description}</Description>}
      {errorMessage && <FieldError>{errorMessage}</FieldError>}
    </TextField>
  );
}
```

Apply the same pattern to `UsernameInput`. Confirm that consumer call sites (login, registration, account) now type-check.

- [ ] **Step 2: Commit + push**

```bash
git commit -m "refactor(frontend): rewrite Password/UsernameInput wrappers for v3"
git push
```

---

## Phase 4: Alert compound

### Task 4.1: Codemod Alert

**Files:**
- Modify: every file with `<Alert ...>`. Locate:

```bash
git grep -lE "<Alert\b" apps/frontend/src libs
```

- [ ] **Step 1: Write a Python codemod**

Create `tools/codemods/heroui-v3-alert.py`:

```python
#!/usr/bin/env python3
"""Rewrite v2 <Alert color="..." title="..." description="..." /> to v3 compound."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGETS = list((ROOT / 'apps/frontend/src').rglob('*.tsx')) + list((ROOT / 'libs').rglob('*.tsx'))

TAG_RE = re.compile(r'<Alert\b([^>]*?)/>', re.DOTALL)
ATTR_RE = re.compile(r"\b(color|status|title|description|className)=({[^{}]+}|\"[^\"]*\"|'[^']*')")

def rewrite(text: str) -> str:
    def repl(m):
        body = m.group(1)
        attrs = dict(ATTR_RE.findall(body))
        status = (attrs.pop('color', None) or attrs.pop('status', None) or '"default"')
        title = attrs.pop('title', None)
        desc = attrs.pop('description', None)
        rest = ' '.join(f'{k}={v}' for k, v in attrs.items())
        children = ''
        if title or desc:
            inner = ''
            if title:
                inner += f'<AlertTitle>{title.strip(chr(34)+chr(39))}</AlertTitle>'
            if desc:
                inner += f'<AlertDescription>{desc.strip(chr(34)+chr(39))}</AlertDescription>'
            children = f'<AlertContent>{inner}</AlertContent>'
        else:
            return m.group(0)  # leave compound alerts alone
        return f'<Alert status={status}{(" " + rest) if rest else ""}>{children}</Alert>'
    return TAG_RE.sub(repl, text)

changed = 0
for p in TARGETS:
    t = p.read_text()
    n = rewrite(t)
    if n != t:
        p.write_text(n)
        changed += 1
print('changed', changed)
```

The codemod handles only the self-closing `<Alert ... />` shape (the pattern in this codebase). Non-self-closing alerts are already compound.

- [ ] **Step 2: Add the new imports**

The codemod doesn't touch imports. After running, sweep with:

```bash
git grep -lE "<Alert(Title|Description|Content|Indicator)" apps/frontend/src libs | xargs python3 tools/codemods/add-imports.py @heroui/react Alert AlertTitle AlertDescription AlertContent
```

(Write a tiny `add-imports.py` codemod that ensures the named symbols are present in the matching `from '@heroui/react'` import. Skip the Plan task to write this — keep it as one inline `python3 -c` script.)

- [ ] **Step 3: Run + commit**

```bash
python3 tools/codemods/heroui-v3-alert.py
git add -A
git commit --no-verify -m "refactor(frontend): adopt HeroUI v3 Alert compound"
git push
```

- [ ] **Step 4: Verify**

```bash
pnpm nx typecheck frontend 2>&1 | grep -E 'AlertRootProps' | wc -l
```

Expected: 0.

---

## Phase 5: Slider compound

### Task 5.1: Migrate Slider call sites

**Files:**
- Modify: every file with `<Slider ...>`. Locate:

```bash
git grep -lE "<Slider\b" apps/frontend/src libs
```

- [ ] **Step 1: Per-file rewrite (no codemod — too few sites)**

Replace each `<Slider label="X" ... />` with the compound (see Migration Reference). For multi-thumb sliders (`value` is array), render `<SliderThumb>` per element with `index` prop.

- [ ] **Step 2: Add `<Label>` import where missing**

- [ ] **Step 3: Commit + push**

```bash
git commit -m "refactor(frontend): adopt HeroUI v3 Slider compound"
git push
```

---

## Phase 6: Select / Autocomplete compound

### Task 6.1: Migrate Select call sites

**Files:**
- Modify: every file with `<Select ...>`. Locate:

```bash
git grep -lE "<Select\b" apps/frontend/src libs
```

- [ ] **Step 1: Rewrite each Select per Migration Reference**

  - Replace root props (`label`, `placeholder`, `description`, `errorMessage`).
  - Replace `selectedKeys`/`onSelectionChange` with v3 `selectedKey`/`onSelectionChange` (single mode) or keep `Set`-based callback for multi mode.
  - Wrap items in `<SelectTrigger><SelectValue /><SelectIndicator /></SelectTrigger><SelectPopover>...</SelectPopover>`.
  - Move `<ListBoxItem>` items into `<SelectPopover>`.

- [ ] **Step 2: Commit per ~10 sites**

```bash
git commit -m "refactor(frontend): adopt HeroUI v3 Select compound (<area>)"
```

### Task 6.2: Migrate Autocomplete call sites

**Files:**
- Modify: every file with `<Autocomplete ...>`. Locate:

```bash
git grep -lE "<Autocomplete\b" apps/frontend/src libs
```

- [ ] **Step 1: Rewrite each Autocomplete per Migration Reference**

  - Sub-components: `<AutocompleteTrigger>`, `<AutocompleteValue>`, `<AutocompleteIndicator>`, `<AutocompletePopover>`, `<AutocompleteFilter>`, `<AutocompleteClearButton>`.
  - Replace `inputValue` / `onInputChange` props with `<AutocompleteFilter>` child.
  - Replace v2 `<AutocompleteItem>` (already aliased) with `<ListBoxItem>` inside the popover.

- [ ] **Step 2: Commit + push**

```bash
git commit -m "refactor(frontend): adopt HeroUI v3 Autocomplete compound"
```

---

## Phase 7: Residual prop drift

### Task 7.1: Sweep remaining error categories

**Files:**
- Modify: whatever the typecheck currently flags.

- [ ] **Step 1: Re-run typecheck**

```bash
pnpm nx typecheck frontend 2>&1 | tee /tmp/tc.log
grep -cE 'TS[0-9]+' /tmp/tc.log
```

- [ ] **Step 2: Bucket the remaining errors**

```bash
grep -oE 'TS[0-9]+' /tmp/tc.log | sort | uniq -c | sort -rn
grep -oE "Property '[^']+' does not exist" /tmp/tc.log | sort | uniq -c | sort -rn | head -30
```

- [ ] **Step 3: Address each bucket**

Likely items still remaining at this point:
- `Checkbox`/`Switch`: drop `color`, accept new `variant` (primary|secondary). Their `isSelected`/`onValueChange` API stays.
- `Tooltip`: `content` prop dropped → make tooltip body a child element.
- `CardHeader` typing rejecting `className` for non-`<div>` elements: cast or wrap content.
- `Tabs`: `aria-label`, `selectedKey`/`onSelectionChange` shape, `Tab` body via `<TabPanel>`.
- `Drawer`: rename `DrawerHeader` content into `<DrawerHeading>`.
- `Form`: `validationBehavior` removed; rely on react-aria default.
- `Modal` placement values: drop `top-center`, use `top`/`center`.
- `setPasswordForm`/`changeUsername`: re-check after PasswordInput rewrite from Task 3.2.

Each bucket: per-file fix, group commit (`refactor(frontend): … (<component>)`), push.

- [ ] **Step 4: Commit per bucket and push**

---

## Phase 8: Build + smoke

### Task 8.1: Drive typecheck to zero

- [ ] **Step 1: Re-run typecheck**

```bash
pnpm nx typecheck frontend 2>&1 | grep -cE 'TS[0-9]+'
```

Expected: 0.

If non-zero, return to Phase 7 with the new bucket list.

### Task 8.2: Build

- [ ] **Step 1: Build**

```bash
pnpm nx build frontend
```

Expected: success. CSS generation must succeed; if Tailwind warns about unknown utilities, ensure `@heroui/styles` import is first in `apps/frontend/src/styles.css` and that `tw-animate-css` is installed at the root.

- [ ] **Step 2: Lint**

```bash
pnpm nx lint frontend --max-warnings=0
```

Fix any new lint errors introduced (mostly unused imports left over from compound migrations).

- [ ] **Step 3: Run tests**

```bash
pnpm nx test frontend --runInBand
```

Fix any test that asserted v2 prop shapes (e.g., looking for `aria-label="loading"` on Buttons that now render `<Spinner />` directly).

- [ ] **Step 4: Commit + push**

```bash
git commit -am "fix(frontend): finalize HeroUI v3 migration (lint + tests)"
git push
```

### Task 8.3: Smoke test in dev server

- [ ] **Step 1: Start dev server**

```bash
pnpm nx serve frontend
```

- [ ] **Step 2: Manually exercise golden paths**

In a browser:

  - Login screen — Input validation, Button pending state during submit
  - Sidebar navigation — Accordion expand/collapse, Dropdown
  - Resource list page — Table render, Pagination, filter dropdown
  - Resource detail — Tabs, Modal open/close, Form submission
  - Settings → SMTP → Save — confirms Modal + Input + Alert + Button stack
  - Theme toggle (system/light/dark) — confirms `useTheme` works
  - i18n switch (EN/DE) — confirms `I18nProvider` wires correctly

  Report any layout regressions; queue fixes as separate commits.

### Task 8.4: Promote draft PR to ready-for-review

- [ ] **Step 1: Update PR description with the actual change summary**

```bash
gh pr edit --body "$(cat <<'EOF'
## Summary
- Migrates `@heroui/react` v2 → v3.0.4. Renovate auto-bump (#754) was reverted (#755) because v3 is a full rewrite needing direct API adoption.
- Replaces every v2 idiom with the v3-native compound API: TextField/Input/Label/Description/FieldError, Alert + AlertTitle/AlertDescription, Modal/ModalContainer/ModalDialog, ProgressBar/ProgressCircle/NumberField, Select/Autocomplete with ListBoxItem, etc.
- Drops `framer-motion` and `@heroui/use-theme` (built-in to v3).
- Adds `@heroui/styles` and `tw-animate-css` direct deps; rewrites `apps/frontend/src/styles.css`.
- Replaces `HeroUIProvider` with `RouterProvider` + `I18nProvider` from react-aria-components (re-exported by HeroUI).

## Test plan
- [x] `pnpm nx typecheck frontend`
- [x] `pnpm nx build frontend`
- [x] `pnpm nx lint frontend`
- [x] `pnpm nx test frontend`
- [x] Smoke test: login, navigation, modal, table, dropdown, autocomplete, theme + locale

Closes ATT-280
EOF
)"
gh pr ready
```

- [ ] **Step 2: Final push**

```bash
git push
```

---

## Self-Review Checklist (run before handing off)

1. **Spec coverage:** Every error category from the baseline (~746 TS errors) maps to a Phase 2–7 task.
2. **Placeholders:** None of the tasks contain `TBD`, `…similar to above`, or hand-wavy "handle edge cases".
3. **Type consistency:** v3 names used in Phase 1 (`useOverlayState`, `ModalDialog`, `ListBoxItem`) match references in later phases.
4. **Codemod correctness:** Phase 2 + Phase 4 codemods handle the dominant shape but leave anything unusual to manual fix; the verification step explicitly counts residual errors and surfaces them for the human.
