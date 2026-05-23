# Maintenance Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new route `/resources/:id/maintenance` — a maintenance hub that holds both schedule definitions (accordion) and the activity log (Live / Upcoming / History sections) — and wire two trigger affordances on the resource detail page that lead to it.

**Architecture:** A single page component owns route state and renders a PageHeader, a 4-tile stat strip, and a two-tab HeroUI v3 `Tabs` component. The Schedules tab renders a HeroUI `Accordion` with inline edit / pause / delete actions. The Activity tab renders three stacked sections backed by the existing maintenance instances query. Schedule create/edit is moved from a Modal into a HeroUI v3 `Drawer` wrapping a re-usable `ScheduleForm` component. The old `<MaintenanceSchedules>` card is removed from the detail page; `<MaintenanceManagement>` stays unchanged.

**Tech Stack:** React 18, react-router-dom v6, HeroUI v3 (`@heroui/react`: Tabs, TabList, Tab, TabPanel, Accordion + sub-parts, Drawer + sub-parts, Card, Chip, Skeleton, Tooltip), TanStack React Query, `@attraccess/react-query-client` SDK, `@attraccess/plugins-frontend-ui` (`useTranslations`, `DateTimeDisplay`), Vitest + `@testing-library/react`, Tailwind CSS.

**Design spec:** `docs/superpowers/specs/2026-05-13-maintenance-hub-design.md`

**Linear:** [ATT-290](https://linear.app/attraccess/issue/ATT-290)

---

## File structure

**Create:**

```
apps/frontend/src/app/resources/details/maintenance-hub/
├── index.tsx                          # MaintenanceHubPage (route component)
├── de.json                            # German translations
├── en.json                            # English translations
├── stat-strip.tsx                     # 4-tile stat strip
├── schedules-tab.tsx                  # Tab content: accordion of schedules
├── schedule-accordion-item.tsx        # One accordion item (header + expanded panel + actions)
├── schedule-form-drawer.tsx           # Drawer wrapping the schedule form
├── schedule-form.tsx                  # Re-usable form (name + trigger + conditional config)
├── activity-tab.tsx                   # Tab content: live + upcoming + history
├── live-section.tsx                   # Live status card(s) with "Mark done"
├── upcoming-section.tsx               # Upcoming maintenance compact list
├── history-section.tsx                # History compact list
└── config-summary.ts                  # Pure util: schedule → human sentence
```

**Modify:**

- `apps/frontend/src/app/routes/index.tsx` — register `/resources/:id/maintenance`
- `apps/frontend/src/app/resources/details/resourceDetails.tsx` — drop `<MaintenanceSchedules>`, add "Maintenance" button in PageHeader actions
- `apps/frontend/src/app/resources/details/maintenance-management/index.tsx` — add "Manage maintenance" link in its `CardHeader`/`PageHeader`

**Delete (after migration is verified):**

- `apps/frontend/src/app/resources/details/maintenance-schedules/` — entire directory replaced by the hub. The two i18n files inside it are not migrated as-is; the new `maintenance-hub/{de,en}.json` covers all needed keys.

---

## Task 1: Extract `config-summary` util

Pure util lifted out of the doomed `maintenance-schedules/index.tsx` so the new hub doesn't depend on a file we're about to delete.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/config-summary.ts`
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/config-summary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/frontend/src/app/resources/details/maintenance-hub/config-summary.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ResourceMaintenanceScheduleTriggerType, UsageDurationUnit } from '@attraccess/react-query-client';
import { configSummary } from './config-summary';

const t = vi.fn((key: string, params?: Record<string, number | string>) => {
  return params ? `${key}:${JSON.stringify(params)}` : key;
});

describe('configSummary', () => {
  it('formats USAGE_HOURS in HOURS', () => {
    const result = configSummary(
      {
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
        usageHoursConfig: { duration: 50, unit: UsageDurationUnit.HOURS },
      } as never,
      t,
    );
    expect(result).toBe('configSummary.usageHoursHours:{"duration":50}');
  });

  it('formats USAGE_COUNT', () => {
    const result = configSummary(
      {
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
        usageCountConfig: { thresholdSessions: 100 },
      } as never,
      t,
    );
    expect(result).toBe('configSummary.usageCount:{"count":100}');
  });

  it('formats TIME_INTERVAL in DAYS', () => {
    const result = configSummary(
      {
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        timeIntervalConfig: { duration: 7, unit: 'DAYS' },
      } as never,
      t,
    );
    expect(result).toBe('configSummary.timeIntervalDays:{"duration":7}');
  });

  it('returns dash for missing config', () => {
    const result = configSummary(
      { triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS } as never,
      t,
    );
    expect(result).toBe('—');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd apps/frontend && npx vitest run src/app/resources/details/maintenance-hub/config-summary.test.ts`
Expected: FAIL — module `./config-summary` not found.

- [ ] **Step 3: Implement the util**

```ts
// apps/frontend/src/app/resources/details/maintenance-hub/config-summary.ts
import { ResourceMaintenanceSchedule, ResourceMaintenanceScheduleTriggerType } from '@attraccess/react-query-client';

type Translator = (key: string, params?: Record<string, number | string>) => string;

export function configSummary(schedule: ResourceMaintenanceSchedule, t: Translator): string {
  switch (schedule.triggerType) {
    case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS: {
      const config = schedule.usageHoursConfig as { duration: number; unit: string } | undefined;
      if (!config) return '—';
      const key =
        config.unit === 'MINUTES'
          ? 'configSummary.usageHoursMinutes'
          : config.unit === 'HOURS'
            ? 'configSummary.usageHoursHours'
            : 'configSummary.usageHoursDays';
      return t(key, { duration: config.duration });
    }
    case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT:
      return schedule.usageCountConfig
        ? t('configSummary.usageCount', { count: schedule.usageCountConfig.thresholdSessions })
        : '—';
    case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL: {
      const config = schedule.timeIntervalConfig as { duration?: number; unit?: string } | undefined;
      if (!config || config.duration == null) return '—';
      const key =
        config.unit === 'MINUTES'
          ? 'configSummary.timeIntervalMinutes'
          : config.unit === 'HOURS'
            ? 'configSummary.timeIntervalHours'
            : 'configSummary.timeIntervalDays';
      return t(key, { duration: config.duration });
    }
    default:
      return '—';
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `cd apps/frontend && npx vitest run src/app/resources/details/maintenance-hub/config-summary.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/config-summary.ts apps/frontend/src/app/resources/details/maintenance-hub/config-summary.test.ts
git commit -m "feat(ATT-290): extract config-summary util for maintenance hub"
```

---

## Task 2: Seed i18n files for the hub

Add both translation files up-front so subsequent tasks reference real keys.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/en.json`
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/de.json`

- [ ] **Step 1: Write `en.json`**

```json
{
  "title": "Maintenance",
  "subtitle": "{resourceName}",
  "actions": {
    "newSchedule": "New schedule",
    "manageMaintenance": "Manage maintenance",
    "backToResource": "Back to resource"
  },
  "stats": {
    "active": "Active",
    "schedules": "Schedules",
    "nextRun": "Next run",
    "thisMonth": "This month",
    "nextRunNone": "—",
    "nextRunRelative": "in {value}"
  },
  "tabs": {
    "schedules": "Schedules",
    "activity": "Active & history"
  },
  "schedules": {
    "empty": "No maintenance schedules yet.",
    "addFirst": "Create your first schedule",
    "status": { "on": "On", "paused": "Paused" },
    "triggerType": {
      "USAGE_HOURS": "Usage hours",
      "USAGE_COUNT": "Usage count",
      "TIME_INTERVAL": "Time interval"
    },
    "actions": {
      "edit": "Edit",
      "pause": "Pause",
      "resume": "Resume",
      "delete": "Delete"
    },
    "deleteConfirm": "Delete schedule \"{name}\"?"
  },
  "activity": {
    "live": {
      "label": "Live now",
      "count": "{count} running",
      "endsIn": "ends in {time}",
      "startedAgo": "Started {time} ago",
      "createdBy": "by {name}",
      "markDone": "Mark done"
    },
    "upcoming": {
      "label": "Upcoming",
      "count": "{count} scheduled",
      "empty": "No upcoming maintenance.",
      "columns": { "when": "When", "duration": "Duration", "reason": "Reason" }
    },
    "history": {
      "label": "History",
      "subtitle": "Last 30 days",
      "showAll": "Show all",
      "empty": "No past maintenance.",
      "columns": { "when": "When", "duration": "Duration", "reason": "Reason", "completedBy": "Completed by" }
    }
  },
  "form": {
    "titleCreate": "New maintenance schedule",
    "titleEdit": "Edit: {name}",
    "name": { "label": "Name", "placeholder": "e.g. Monthly check" },
    "triggerType": { "label": "Trigger type" },
    "duration": { "label": "Duration" },
    "unit": { "label": "Unit", "MINUTES": "minutes", "HOURS": "hours", "DAYS": "days" },
    "thresholdSessions": { "label": "Sessions threshold" },
    "enabled": { "label": "Enabled" },
    "timeIntervalNote": "Time-interval schedules are evaluated periodically by the server.",
    "actions": { "save": "Save", "cancel": "Cancel" },
    "alert": { "errorTitle": "Couldn't save schedule" }
  },
  "configSummary": {
    "usageHoursMinutes": "{duration} min of use",
    "usageHoursHours": "{duration} h of use",
    "usageHoursDays": "{duration} d of use",
    "usageCount": "Every {count} sessions",
    "timeIntervalMinutes": "Every {duration} min",
    "timeIntervalHours": "Every {duration} h",
    "timeIntervalDays": "Every {duration} d"
  },
  "errors": {
    "forbidden": "You don't have permission to manage maintenance for this resource."
  }
}
```

- [ ] **Step 2: Write `de.json`**

```json
{
  "title": "Wartung",
  "subtitle": "{resourceName}",
  "actions": {
    "newSchedule": "Neuer Zeitplan",
    "manageMaintenance": "Wartung verwalten",
    "backToResource": "Zurück zur Ressource"
  },
  "stats": {
    "active": "Aktiv",
    "schedules": "Zeitpläne",
    "nextRun": "Nächste Ausführung",
    "thisMonth": "Diesen Monat",
    "nextRunNone": "—",
    "nextRunRelative": "in {value}"
  },
  "tabs": {
    "schedules": "Zeitpläne",
    "activity": "Aktiv & Verlauf"
  },
  "schedules": {
    "empty": "Noch keine Wartungs-Zeitpläne.",
    "addFirst": "Ersten Zeitplan anlegen",
    "status": { "on": "An", "paused": "Pausiert" },
    "triggerType": {
      "USAGE_HOURS": "Nutzungsstunden",
      "USAGE_COUNT": "Nutzungsanzahl",
      "TIME_INTERVAL": "Zeitintervall"
    },
    "actions": {
      "edit": "Bearbeiten",
      "pause": "Pausieren",
      "resume": "Fortsetzen",
      "delete": "Löschen"
    },
    "deleteConfirm": "Zeitplan \"{name}\" löschen?"
  },
  "activity": {
    "live": {
      "label": "Läuft gerade",
      "count": "{count} laufend",
      "endsIn": "endet in {time}",
      "startedAgo": "Gestartet vor {time}",
      "createdBy": "von {name}",
      "markDone": "Als erledigt markieren"
    },
    "upcoming": {
      "label": "Anstehend",
      "count": "{count} geplant",
      "empty": "Keine anstehenden Wartungen.",
      "columns": { "when": "Wann", "duration": "Dauer", "reason": "Grund" }
    },
    "history": {
      "label": "Verlauf",
      "subtitle": "Letzte 30 Tage",
      "showAll": "Alle anzeigen",
      "empty": "Keine vergangenen Wartungen.",
      "columns": { "when": "Wann", "duration": "Dauer", "reason": "Grund", "completedBy": "Erledigt von" }
    }
  },
  "form": {
    "titleCreate": "Neuer Wartungs-Zeitplan",
    "titleEdit": "Bearbeiten: {name}",
    "name": { "label": "Name", "placeholder": "z. B. monatlicher Check" },
    "triggerType": { "label": "Auslöser-Typ" },
    "duration": { "label": "Dauer" },
    "unit": { "label": "Einheit", "MINUTES": "Minuten", "HOURS": "Stunden", "DAYS": "Tage" },
    "thresholdSessions": { "label": "Sitzungsschwelle" },
    "enabled": { "label": "Aktiv" },
    "timeIntervalNote": "Zeitintervall-Zeitpläne werden periodisch vom Server ausgewertet.",
    "actions": { "save": "Speichern", "cancel": "Abbrechen" },
    "alert": { "errorTitle": "Zeitplan konnte nicht gespeichert werden" }
  },
  "configSummary": {
    "usageHoursMinutes": "{duration} Min. Nutzung",
    "usageHoursHours": "{duration} Std. Nutzung",
    "usageHoursDays": "{duration} Tage Nutzung",
    "usageCount": "Alle {count} Sitzungen",
    "timeIntervalMinutes": "Alle {duration} Min.",
    "timeIntervalHours": "Alle {duration} Std.",
    "timeIntervalDays": "Alle {duration} Tage"
  },
  "errors": {
    "forbidden": "Du hast keine Berechtigung zur Wartungs-Verwaltung dieser Ressource."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/en.json apps/frontend/src/app/resources/details/maintenance-hub/de.json
git commit -m "feat(ATT-290): seed maintenance-hub i18n"
```

---

## Task 3: Build `ScheduleForm` (drawer body)

Re-usable form lifted from `maintenance-schedules/upsert/index.tsx`. Same fields, same mutations, **owns no overlay state** — caller controls open/close. Calls `onSaved()` after a successful create or update.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/schedule-form.tsx`

- [ ] **Step 1: Create the form component**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/schedule-form.tsx
import {
  Alert,
  AlertContent,
  AlertTitle,
  Button,
  Form,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import { Select } from '../../../../components/select';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResourceMaintenanceScheduleTriggerType,
  useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule,
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule,
  UsageDurationUnit,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import de from './de.json';
import en from './en.json';

const TRIGGER_OPTIONS = [
  { value: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS, labelKey: 'USAGE_HOURS' },
  { value: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT, labelKey: 'USAGE_COUNT' },
  { value: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL, labelKey: 'TIME_INTERVAL' },
] as const;

interface Props {
  resourceId: number;
  scheduleId?: number;
  onSaved: () => void;
  onCancel: () => void;
}

export function ScheduleForm(props: Props) {
  const { resourceId, scheduleId, onSaved, onCancel } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<ResourceMaintenanceScheduleTriggerType>(
    ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
  );
  const [usageHoursDuration, setUsageHoursDuration] = useState('100');
  const [usageHoursUnit, setUsageHoursUnit] = useState<UsageDurationUnit>(UsageDurationUnit.HOURS);
  const [thresholdSessions, setThresholdSessions] = useState('50');
  const [timeIntervalDuration, setTimeIntervalDuration] = useState('500');
  const [timeIntervalUnit, setTimeIntervalUnit] = useState<UsageDurationUnit>(UsageDurationUnit.HOURS);
  const [enabled, setEnabled] = useState(true);

  const { data: existing } = useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule(
    { resourceId, scheduleId: scheduleId ?? 0 },
    undefined,
    { enabled: scheduleId != null },
  );

  useEffect(() => {
    if (!existing) return;
    setName(existing.name ?? '');
    setTriggerType(existing.triggerType);
    setEnabled(existing.enabled);
    setUsageHoursDuration(existing.usageHoursConfig?.duration?.toString() ?? '100');
    setUsageHoursUnit(existing.usageHoursConfig?.unit ?? UsageDurationUnit.HOURS);
    setThresholdSessions(existing.usageCountConfig?.thresholdSessions?.toString() ?? '50');
    setTimeIntervalDuration(existing.timeIntervalConfig?.duration?.toString() ?? '500');
    setTimeIntervalUnit((existing.timeIntervalConfig?.unit as UsageDurationUnit) ?? UsageDurationUnit.HOURS);
  }, [existing]);

  const onDone = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey],
    });
    onSaved();
  }, [queryClient, onSaved]);

  const { mutate: create, isPending: isCreating, error: createError } =
    useResourceMaintenanceSchedulesServiceCreateMaintenanceSchedule({ onSuccess: onDone });
  const { mutate: update, isPending: isUpdating, error: updateError } =
    useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule({ onSuccess: onDone });

  const error = (createError ?? updateError) as Error | undefined;

  const onSubmit = useCallback(() => {
    if (!formRef.current?.reportValidity()) return;

    const base = { name: name || undefined, triggerType, enabled };
    const buildBody = () => {
      if (triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) {
        const duration = parseInt(usageHoursDuration, 10);
        if (Number.isNaN(duration) || duration < 1) return null;
        return { ...base, usageHoursConfig: { duration, unit: usageHoursUnit } };
      }
      if (triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT) {
        const sessions = parseInt(thresholdSessions, 10);
        if (Number.isNaN(sessions) || sessions < 1) return null;
        return { ...base, usageCountConfig: { thresholdSessions: sessions } };
      }
      const duration = parseInt(timeIntervalDuration, 10);
      if (Number.isNaN(duration) || duration < 1) return null;
      return { ...base, timeIntervalConfig: { duration, unit: timeIntervalUnit } };
    };

    const requestBody = buildBody();
    if (!requestBody) return;

    if (scheduleId != null) {
      update({ resourceId, scheduleId, requestBody });
    } else {
      create({ resourceId, requestBody });
    }
  }, [
    name, triggerType, usageHoursDuration, usageHoursUnit, thresholdSessions,
    timeIntervalDuration, timeIntervalUnit, enabled, resourceId, scheduleId, create, update,
  ]);

  return (
    <Form
      ref={formRef}
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex flex-col gap-4"
    >
      <TextField value={name} onChange={setName}>
        <Label>{t('form.name.label')}</Label>
        <Input placeholder={t('form.name.placeholder')} />
      </TextField>

      <Select
        label={t('form.triggerType.label')}
        selectedKey={triggerType}
        onSelectionChange={(key) => { if (key) setTriggerType(key as ResourceMaintenanceScheduleTriggerType); }}
        items={TRIGGER_OPTIONS.map((opt) => ({
          key: opt.value,
          label: t(`schedules.triggerType.${opt.labelKey}`),
        }))}
      />

      {triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS && (
        <>
          <TextField value={usageHoursDuration} onChange={setUsageHoursDuration} isRequired>
            <Label>{t('form.duration.label')}</Label>
            <Input type="number" min={1} />
          </TextField>
          <Select
            label={t('form.unit.label')}
            selectedKey={usageHoursUnit}
            onSelectionChange={(key) => { if (key) setUsageHoursUnit(key as UsageDurationUnit); }}
            items={Object.values(UsageDurationUnit).map((unit) => ({
              key: unit,
              label: t(`form.unit.${unit}`),
            }))}
          />
        </>
      )}

      {triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT && (
        <TextField value={thresholdSessions} onChange={setThresholdSessions} isRequired>
          <Label>{t('form.thresholdSessions.label')}</Label>
          <Input type="number" min={1} />
        </TextField>
      )}

      {triggerType === ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL && (
        <>
          <TextField value={timeIntervalDuration} onChange={setTimeIntervalDuration} isRequired>
            <Label>{t('form.duration.label')}</Label>
            <Input type="number" min={1} />
          </TextField>
          <Select
            label={t('form.unit.label')}
            selectedKey={timeIntervalUnit}
            onSelectionChange={(key) => { if (key) setTimeIntervalUnit(key as UsageDurationUnit); }}
            items={Object.values(UsageDurationUnit).map((unit) => ({
              key: unit,
              label: t(`form.unit.${unit}`),
            }))}
          />
          <p className="text-sm text-default-500">{t('form.timeIntervalNote')}</p>
        </>
      )}

      <LabeledSwitch isSelected={enabled} onChange={setEnabled}>
        {t('form.enabled.label')}
      </LabeledSwitch>

      {error && (
        <Alert status="danger">
          <AlertContent>
            <AlertTitle>{t('form.alert.errorTitle')}</AlertTitle>
          </AlertContent>
          {error.message}
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onPress={onCancel} type="button">
          {t('form.actions.cancel')}
        </Button>
        <Button variant="primary" onPress={onSubmit} isPending={isCreating || isUpdating} type="button">
          {t('form.actions.save')}
        </Button>
      </div>

      <button type="submit" hidden />
    </Form>
  );
}
```

- [ ] **Step 2: Smoke-check the file compiles**

Run: `cd apps/frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep maintenance-hub`
Expected: no errors mentioning this file.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/schedule-form.tsx
git commit -m "feat(ATT-290): add ScheduleForm component for the drawer"
```

---

## Task 4: Build `ScheduleFormDrawer`

Wraps `ScheduleForm` inside `StandardDrawer` with header + body. Parent owns `isOpen` and `scheduleId`.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/schedule-form-drawer.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/schedule-form-drawer.tsx
import { DrawerHeader, DrawerBody } from '@heroui/react';
import { StandardDrawer } from '../../../../components/standardDrawer';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ScheduleForm } from './schedule-form';
import { useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule } from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  scheduleId?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ScheduleFormDrawer(props: Props) {
  const { resourceId, scheduleId, isOpen, onClose } = props;
  const { t } = useTranslations({ de, en });

  const { data: existing } = useResourceMaintenanceSchedulesServiceGetMaintenanceSchedule(
    { resourceId, scheduleId: scheduleId ?? 0 },
    undefined,
    { enabled: isOpen && scheduleId != null },
  );

  const title =
    scheduleId != null
      ? t('form.titleEdit', { name: existing?.name ?? '…' })
      : t('form.titleCreate');

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      backdropProps={{ blur: true }}
    >
      <DrawerHeader>
        <h2 className="text-lg font-semibold">{title}</h2>
      </DrawerHeader>
      <DrawerBody>
        {isOpen && (
          <ScheduleForm
            resourceId={resourceId}
            scheduleId={scheduleId}
            onSaved={onClose}
            onCancel={onClose}
          />
        )}
      </DrawerBody>
    </StandardDrawer>
  );
}
```

> **Note:** `backdropProps={{ blur: true }}` — check the actual `DrawerBackdropProps` shape if `tsc` complains; drop the prop if HeroUI does blur by default.

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -E "schedule-form-drawer" | head -20`
Expected: no errors. If `blur` is not a valid prop, remove the line.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/schedule-form-drawer.tsx
git commit -m "feat(ATT-290): add ScheduleFormDrawer wrapping ScheduleForm"
```

---

## Task 5: Build `ScheduleAccordionItem`

One accordion item — summary row plus expanded panel with details and actions.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/schedule-accordion-item.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/schedule-accordion-item.tsx
import {
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Button,
  Chip,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ClockIcon, GaugeIcon, HashIcon, PencilIcon, TrashIcon } from 'lucide-react';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { configSummary } from './config-summary';
import de from './de.json';
import en from './en.json';

interface Props {
  schedule: ResourceMaintenanceSchedule;
  resourceId: number;
  onEdit: () => void;
  onDelete: () => void;
}

function TriggerIcon({ type }: { type: ResourceMaintenanceScheduleTriggerType }) {
  if (type === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) return <GaugeIcon className="w-4 h-4" />;
  if (type === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT) return <HashIcon className="w-4 h-4" />;
  return <ClockIcon className="w-4 h-4" />;
}

export function ScheduleAccordionItem(props: Props) {
  const { schedule, resourceId, onEdit, onDelete } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();

  const { mutate: updateSchedule, isPending: isToggling } =
    useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey],
        });
      },
    });

  const togglePause = () => {
    updateSchedule({ resourceId, scheduleId: schedule.id, requestBody: { enabled: !schedule.enabled } });
  };

  return (
    <AccordionItem id={schedule.id}>
      <AccordionHeading>
        <AccordionTrigger>
          <div className="flex items-center gap-3 w-full">
            <TriggerIcon type={schedule.triggerType} />
            <span className="font-medium">{schedule.name ?? t(`schedules.triggerType.${schedule.triggerType}`)}</span>
            <span className="text-default-500 text-sm ml-auto">{configSummary(schedule, t)}</span>
            <Chip
              size="sm"
              color={schedule.enabled ? 'success' : 'warning'}
              variant="flat"
            >
              {schedule.enabled ? t('schedules.status.on') : t('schedules.status.paused')}
            </Chip>
          </div>
        </AccordionTrigger>
      </AccordionHeading>
      <AccordionPanel>
        <AccordionBody>
          <div className="text-sm text-default-600 mb-3">
            {t(`schedules.triggerType.${schedule.triggerType}`)} · {configSummary(schedule, t)}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onPress={onEdit}>
              <PencilIcon className="w-4 h-4" />
              {t('schedules.actions.edit')}
            </Button>
            <Button variant="ghost" onPress={togglePause} isPending={isToggling}>
              {schedule.enabled ? t('schedules.actions.pause') : t('schedules.actions.resume')}
            </Button>
            <Button variant="danger-soft" onPress={onDelete}>
              <TrashIcon className="w-4 h-4" />
              {t('schedules.actions.delete')}
            </Button>
          </div>
        </AccordionBody>
      </AccordionPanel>
    </AccordionItem>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep schedule-accordion-item | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/schedule-accordion-item.tsx
git commit -m "feat(ATT-290): add ScheduleAccordionItem"
```

---

## Task 6: Build `SchedulesTab`

Owns drawer state + delete confirmation state. Renders Accordion of items, empty state, or skeletons.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/schedules-tab.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/schedules-tab.tsx
import { Accordion, Button, Skeleton } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PlusIcon, CalendarClockIcon } from 'lucide-react';
import { useState } from 'react';
import {
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceDeleteMaintenanceSchedule,
  ResourceMaintenanceSchedule,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { ScheduleAccordionItem } from './schedule-accordion-item';
import { ScheduleFormDrawer } from './schedule-form-drawer';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import { EmptyState } from '../../../../components/emptyState';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
}

export function SchedulesTab(props: Props) {
  const { resourceId } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();

  const { data: schedules, isLoading } =
    useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules({ resourceId });

  const [drawerScheduleId, setDrawerScheduleId] = useState<number | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ResourceMaintenanceSchedule | null>(null);

  const { mutate: deleteSchedule, isPending: isDeleting } =
    useResourceMaintenanceSchedulesServiceDeleteMaintenanceSchedule({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey],
        });
        setDeleteTarget(null);
      },
    });

  const openCreate = () => { setDrawerScheduleId(undefined); setDrawerOpen(true); };
  const openEdit = (id: number) => { setDrawerScheduleId(id); setDrawerOpen(true); };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
      </div>
    );
  }

  const list = schedules ?? [];

  if (list.length === 0) {
    return (
      <>
        <EmptyState
          icon={<CalendarClockIcon className="w-12 h-12 text-default-400" />}
          message={t('schedules.empty')}
        >
          <Button variant="primary" onPress={openCreate}>
            <PlusIcon className="w-4 h-4" />
            {t('schedules.addFirst')}
          </Button>
        </EmptyState>
        <ScheduleFormDrawer
          resourceId={resourceId}
          scheduleId={drawerScheduleId}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <Accordion selectionMode="single">
        {list.map((schedule) => (
          <ScheduleAccordionItem
            key={schedule.id}
            schedule={schedule}
            resourceId={resourceId}
            onEdit={() => openEdit(schedule.id)}
            onDelete={() => setDeleteTarget(schedule)}
          />
        ))}
      </Accordion>

      <ScheduleFormDrawer
        resourceId={resourceId}
        scheduleId={drawerScheduleId}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <DeleteConfirmationModal
        isOpen={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteSchedule({ resourceId, scheduleId: deleteTarget.id });
          }
        }}
        itemName={deleteTarget?.name ?? ''}
        isDeleting={isDeleting}
      />
    </>
  );
}
```

> **Note:** Check `EmptyState` component's actual prop shape — it may not accept `icon` and `children`. If it only takes `message`, render the icon and button outside it instead. Confirm by reading `apps/frontend/src/components/emptyState/index.tsx` and adjust.

> **Note:** `useResourceMaintenanceSchedulesServiceDeleteMaintenanceSchedule` — verify exact hook name in `@attraccess/react-query-client` (the existing `ScheduleDeleteModal.tsx` is the source of truth for the correct hook + key).

- [ ] **Step 2: Read `ScheduleDeleteModal.tsx` for the delete hook name**

Run: `grep -E "use.*Schedule" apps/frontend/src/app/resources/details/maintenance-schedules/ScheduleDeleteModal.tsx`

If the actual hook name differs, fix the import in `schedules-tab.tsx`.

- [ ] **Step 3: Read `EmptyState` to confirm prop shape**

```bash
cat apps/frontend/src/components/emptyState/index.tsx
```

If `EmptyState` doesn't take an `icon` or children prop, replace the empty-state JSX with:

```tsx
<div className="flex flex-col items-center justify-center py-12 gap-4">
  <CalendarClockIcon className="w-12 h-12 text-default-400" />
  <p className="text-default-600">{t('schedules.empty')}</p>
  <Button variant="primary" onPress={openCreate}>
    <PlusIcon className="w-4 h-4" />
    {t('schedules.addFirst')}
  </Button>
</div>
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep schedules-tab | head -20`
Expected: no errors. Fix any prop mismatches inline before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/schedules-tab.tsx
git commit -m "feat(ATT-290): add SchedulesTab with accordion + drawer + delete"
```

---

## Task 7: Build `LiveSection`

Renders one card per in-progress maintenance, with a "Mark done" button. Hidden when nothing is live. Reuses the existing `MarkDoneModal` for the confirmation step.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/live-section.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/live-section.tsx
import { Button } from '@heroui/react';
import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { CheckCircleIcon } from 'lucide-react';
import { ResourceMaintenance } from '@attraccess/react-query-client';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import { MarkDoneModal } from '../maintenance-management/mark-done';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  liveMaintenances: ResourceMaintenance[];
}

export function LiveSection(props: Props) {
  const { resourceId, liveMaintenances } = props;
  const { t } = useTranslations({ de, en });

  if (liveMaintenances.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
        </span>
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('activity.live.label')} · {liveMaintenances.length}
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {liveMaintenances.map((m) => (
          <div
            key={m.id}
            className="rounded-lg border border-success/40 bg-success/5 p-4 flex items-start justify-between gap-4"
          >
            <div className="flex-1">
              <div className="font-medium mb-1"><MaintenanceReasonDisplay reason={m.reason} /></div>
              <div className="text-xs text-default-600">
                <span>Start: <DateTimeDisplay date={m.startTime} /></span>
                {m.endTime && (<> · <span>End: <DateTimeDisplay date={m.endTime} /></span></>)}
                {(m.createdByUser as { username?: string } | undefined)?.username && (
                  <> · {t('activity.live.createdBy', { name: (m.createdByUser as { username?: string }).username! })}</>
                )}
              </div>
            </div>
            <MarkDoneModal resourceId={resourceId} maintenanceId={m.id}>
              {(open) => (
                <Button variant="primary" onPress={open}>
                  <CheckCircleIcon className="w-4 h-4" />
                  {t('activity.live.markDone')}
                </Button>
              )}
            </MarkDoneModal>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep live-section | head -20`
Expected: no errors. If `MarkDoneModal` import path is wrong, find it via:

```bash
grep -rn "export.*MarkDoneModal" apps/frontend/src/app/resources/details/maintenance-management/
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/live-section.tsx
git commit -m "feat(ATT-290): add LiveSection for active maintenances"
```

---

## Task 8: Build `UpcomingSection`

Compact list of future maintenance instances.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/upcoming-section.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/upcoming-section.tsx
import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { ResourceMaintenance } from '@attraccess/react-query-client';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import de from './de.json';
import en from './en.json';

interface Props {
  upcomingMaintenances: ResourceMaintenance[];
}

export function UpcomingSection(props: Props) {
  const { upcomingMaintenances } = props;
  const { t } = useTranslations({ de, en });

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('activity.upcoming.label')} · {upcomingMaintenances.length}
        </h3>
      </div>

      {upcomingMaintenances.length === 0 ? (
        <p className="text-sm text-default-500">{t('activity.upcoming.empty')}</p>
      ) : (
        <div className="rounded-lg border border-default-200 divide-y divide-default-200">
          {upcomingMaintenances.map((m) => (
            <div key={m.id} className="grid grid-cols-3 gap-2 p-3 text-sm">
              <div><DateTimeDisplay date={m.startTime} /></div>
              <div>{m.endTime ? <DateTimeDisplay date={m.endTime} /> : '—'}</div>
              <div className="truncate"><MaintenanceReasonDisplay reason={m.reason} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/upcoming-section.tsx
git commit -m "feat(ATT-290): add UpcomingSection"
```

---

## Task 9: Build `HistorySection`

Past maintenance list. "Show all" toggles between last 30 days and full history.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/history-section.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/history-section.tsx
import { Button } from '@heroui/react';
import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { useState, useMemo } from 'react';
import { ResourceMaintenance } from '@attraccess/react-query-client';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import de from './de.json';
import en from './en.json';

interface Props {
  pastMaintenances: ResourceMaintenance[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function HistorySection(props: Props) {
  const { pastMaintenances } = props;
  const { t } = useTranslations({ de, en });
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(() => {
    if (showAll) return pastMaintenances;
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return pastMaintenances.filter((m) => new Date(m.startTime).getTime() >= cutoff);
  }, [pastMaintenances, showAll]);

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('activity.history.label')}
        </h3>
        <span className="text-xs text-default-500">
          {showAll ? '' : t('activity.history.subtitle')}
        </span>
        {!showAll && pastMaintenances.length > visible.length && (
          <Button variant="ghost" onPress={() => setShowAll(true)} className="ml-auto">
            {t('activity.history.showAll')}
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-default-500">{t('activity.history.empty')}</p>
      ) : (
        <div className="rounded-lg border border-default-200 divide-y divide-default-200">
          {visible.map((m) => (
            <div key={m.id} className="grid grid-cols-4 gap-2 p-3 text-sm">
              <div><DateTimeDisplay date={m.startTime} /></div>
              <div>{m.endTime ? <DateTimeDisplay date={m.endTime} /> : '—'}</div>
              <div className="truncate"><MaintenanceReasonDisplay reason={m.reason} /></div>
              <div>{(m.completedByUser as { username?: string } | undefined)?.username ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/history-section.tsx
git commit -m "feat(ATT-290): add HistorySection with show-all toggle"
```

---

## Task 10: Build `ActivityTab`

Wraps the three sections. Single query for all maintenances, partitions by status, also exposes the "create maintenance" affordance via the existing `ResourceMaintenanceUpsertModal`.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/activity-tab.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/activity-tab.tsx
import { Button, Skeleton } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PlusIcon } from 'lucide-react';
import { useMemo } from 'react';
import {
  ResourceMaintenance,
  useResourceMaintenancesServiceFindMaintenances,
} from '@attraccess/react-query-client';
import { useNow } from '../../../../hooks/useNow';
import { ResourceMaintenanceUpsertModal } from '../maintenance-management/upsert';
import { LiveSection } from './live-section';
import { UpcomingSection } from './upcoming-section';
import { HistorySection } from './history-section';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
}

export function ActivityTab(props: Props) {
  const { resourceId } = props;
  const { t } = useTranslations({ de, en });
  const now = useNow();

  const { data, isLoading } = useResourceMaintenancesServiceFindMaintenances(
    { resourceId, includePast: true, includeActive: true, includeUpcoming: true },
    undefined,
    { refetchInterval: 10_000 },
  );

  const partitioned = useMemo(() => {
    const all = data?.data ?? [];
    const live: ResourceMaintenance[] = [];
    const upcoming: ResourceMaintenance[] = [];
    const past: ResourceMaintenance[] = [];
    for (const m of all) {
      const start = new Date(m.startTime);
      const end = m.endTime ? new Date(m.endTime) : null;
      if (start <= now && (!end || end > now)) live.push(m);
      else if (start > now) upcoming.push(m);
      else past.push(m);
    }
    upcoming.sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
    past.sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));
    return { live, upcoming, past };
  }, [data?.data, now]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <ResourceMaintenanceUpsertModal resourceId={resourceId}>
          {(open) => (
            <Button variant="primary" onPress={open}>
              <PlusIcon className="w-4 h-4" />
              {/* fallback to maintenance-management's own i18n if needed */}
              New maintenance
            </Button>
          )}
        </ResourceMaintenanceUpsertModal>
      </div>

      <LiveSection resourceId={resourceId} liveMaintenances={partitioned.live} />
      <UpcomingSection upcomingMaintenances={partitioned.upcoming} />
      <HistorySection pastMaintenances={partitioned.past} />
    </div>
  );
}
```

> **Note:** The "New maintenance" button label can either pull from the existing `maintenance-management` i18n namespace (re-import its `de.json`/`en.json` here) or get its own key under `activity.actions.create` — pick whichever is consistent with the rest of the file by the time you commit, and remove the placeholder English string.

- [ ] **Step 2: Replace the placeholder label**

Either add `activity.actions.create` to both i18n files, or import `de`/`en` from `../maintenance-management/` alongside the hub's own translations and merge. Whichever you pick — leave **no** hard-coded English in this file.

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep activity-tab | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/activity-tab.tsx apps/frontend/src/app/resources/details/maintenance-hub/{de,en}.json
git commit -m "feat(ATT-290): add ActivityTab partitioning live/upcoming/history"
```

---

## Task 11: Build `StatStrip`

4-tile read-only stat strip.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/stat-strip.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/stat-strip.tsx
import { Card, CardContent } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMemo } from 'react';
import {
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
} from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';

interface Props {
  schedules: ResourceMaintenanceSchedule[];
  maintenances: ResourceMaintenance[];
  now: Date;
}

function relativeHours(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return '—';
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function StatStrip(props: Props) {
  const { schedules, maintenances, now } = props;
  const { t } = useTranslations({ de, en });

  const stats = useMemo(() => {
    const active = maintenances.filter((m) => {
      const start = new Date(m.startTime);
      const end = m.endTime ? new Date(m.endTime) : null;
      return start <= now && (!end || end > now);
    }).length;

    const upcoming = maintenances
      .filter((m) => new Date(m.startTime) > now)
      .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
    const nextRun = upcoming[0]
      ? t('stats.nextRunRelative', { value: relativeHours(new Date(upcoming[0].startTime), now) })
      : t('stats.nextRunNone');

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = maintenances.filter((m) => new Date(m.startTime) >= monthStart).length;

    return { active, schedules: schedules.length, nextRun, thisMonth };
  }, [schedules, maintenances, now, t]);

  const tiles = [
    { label: t('stats.active'), value: stats.active },
    { label: t('stats.schedules'), value: stats.schedules },
    { label: t('stats.nextRun'), value: stats.nextRun },
    { label: t('stats.thisMonth'), value: stats.thisMonth },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="py-4 px-4 flex flex-col items-center">
            <div className="text-2xl font-semibold">{tile.value}</div>
            <div className="text-xs uppercase tracking-wide text-default-500 mt-1">{tile.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/stat-strip.tsx
git commit -m "feat(ATT-290): add StatStrip with 4 stat tiles"
```

---

## Task 12: Build `MaintenanceHubPage` (route component)

Assembles header + stat strip + tabs. Owns query for schedules + maintenances, passes data down. Permission-gated.

**Files:**
- Create: `apps/frontend/src/app/resources/details/maintenance-hub/index.tsx`

- [ ] **Step 1: Implement**

```tsx
// apps/frontend/src/app/resources/details/maintenance-hub/index.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button, Tabs, TabList, Tab, TabPanel, Spinner, Card } from '@heroui/react';
import { ConstructionIcon, PlusIcon, ArrowLeft } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourceMaintenancesServiceCanManageMaintenance,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules,
  useResourceMaintenancesServiceFindMaintenances,
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { PageHeader } from '../../../../components/pageHeader';
import { useNow } from '../../../../hooks/useNow';
import { StatStrip } from './stat-strip';
import { SchedulesTab } from './schedules-tab';
import { ActivityTab } from './activity-tab';
import { ScheduleFormDrawer } from './schedule-form-drawer';
import de from './de.json';
import en from './en.json';

export function MaintenanceHubPage() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);
  const navigate = useNavigate();
  const { t } = useTranslations({ de, en });

  const now = useNow();

  const { data: resource, isLoading: isLoadingResource, error: resourceError } =
    useResourcesServiceGetOneResourceById({ id: resourceId });

  const { data: permissions, isLoading: isLoadingPerms } =
    useResourceMaintenancesServiceCanManageMaintenance({ resourceId });

  const { data: schedules } =
    useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules({ resourceId });

  const { data: maintenancesEnvelope } = useResourceMaintenancesServiceFindMaintenances(
    { resourceId, includePast: true, includeActive: true, includeUpcoming: true },
    undefined,
    { refetchInterval: 10_000 },
  );

  const [tab, setTab] = useState<'schedules' | 'activity'>('schedules');
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);

  if (isLoadingResource || isLoadingPerms) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  if (resourceError || !resource) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-default-600 mb-4">Resource not found.</p>
        <Button variant="ghost" onPress={() => navigate('/resources')}>
          <ArrowLeft className="w-4 h-4" />
          Back to resources
        </Button>
      </div>
    );
  }

  if (!permissions?.canManage) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-default-600 mb-4">{t('errors.forbidden')}</p>
        <Button variant="ghost" onPress={() => navigate(`/resources/${resourceId}`)}>
          <ArrowLeft className="w-4 h-4" />
          {t('actions.backToResource')}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { resourceName: resource.name })}
        icon={<ConstructionIcon className="w-6 h-6" />}
        backTo={`/resources/${resourceId}`}
        actions={
          <Button variant="primary" onPress={() => setCreateDrawerOpen(true)}>
            <PlusIcon className="w-4 h-4" />
            {t('actions.newSchedule')}
          </Button>
        }
      />

      <div className="space-y-6 mb-6">
        <StatStrip
          schedules={schedules ?? []}
          maintenances={maintenancesEnvelope?.data ?? []}
          now={now}
        />

        <Card>
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as 'schedules' | 'activity')}>
            <TabList>
              <Tab id="schedules">{t('tabs.schedules')}</Tab>
              <Tab id="activity">{t('tabs.activity')}</Tab>
            </TabList>
            <TabPanel id="schedules">
              <div className="p-4"><SchedulesTab resourceId={resourceId} /></div>
            </TabPanel>
            <TabPanel id="activity">
              <div className="p-4"><ActivityTab resourceId={resourceId} /></div>
            </TabPanel>
          </Tabs>
        </Card>
      </div>

      <ScheduleFormDrawer
        resourceId={resourceId}
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the whole feature**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep maintenance-hub | head -40`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-hub/index.tsx
git commit -m "feat(ATT-290): assemble MaintenanceHubPage"
```

---

## Task 13: Register the route

**Files:**
- Modify: `apps/frontend/src/app/routes/index.tsx`

- [ ] **Step 1: Add the import**

Add this line near the existing route component imports (around line 21):

```tsx
import { MaintenanceHubPage } from '../resources/details/maintenance-hub';
```

- [ ] **Step 2: Add the route entry**

Insert this object into `coreRoutes` immediately after the `/resources/:id/documentation/edit` route (so it sits with the other resource sub-routes — current line ~101):

```tsx
  {
    path: '/resources/:id/maintenance',
    element: <MaintenanceHubPage />,
    authRequired: true,
  },
```

- [ ] **Step 3: Verify**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep routes/index | head`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/routes/index.tsx
git commit -m "feat(ATT-290): register /resources/:id/maintenance route"
```

---

## Task 14: Drop `<MaintenanceSchedules>` from detail page + add PageHeader button

**Files:**
- Modify: `apps/frontend/src/app/resources/details/resourceDetails.tsx`

- [ ] **Step 1: Remove the import**

Delete line 32: `import { MaintenanceSchedules } from './maintenance-schedules';`

- [ ] **Step 2: Remove the render block**

Replace lines 205–210 (the conditional rendering of both maintenance components) with:

```tsx
          {maintenancePermissions?.canManage && (
            <MaintenanceManagement resourceId={resourceId} className="flex-grow" />
          )}
```

- [ ] **Step 3: Add `WrenchIcon` import**

Modify line 5 — add `WrenchIcon` to the `lucide-react` import:

```tsx
import { ArrowLeft, BookOpen, ListChecks, PenSquareIcon, ShapesIcon, Trash, WorkflowIcon, WrenchIcon } from 'lucide-react';
```

- [ ] **Step 4: Add the PageHeader trigger button**

Insert this button inside the `canManageResources && (<>...</>)` block in the actions row, immediately before the `<ResourceEditModal>` block (around line 162). Gate it by `maintenancePermissions?.canManage`:

```tsx
                {maintenancePermissions?.canManage && (
                  <Button variant="ghost"
                    onPress={() => navigate(`/resources/${resourceId}/maintenance`)}
                    data-cy="maintenance-button"
                  ><WrenchIcon className="w-4 h-4" />
                    {t('actions.maintenance')}
                  </Button>
                )}
```

- [ ] **Step 5: Add the i18n key**

Modify `apps/frontend/src/app/resources/details/resourceDetails.en.json` — add `"maintenance": "Maintenance"` under the existing `actions` object.

Modify `apps/frontend/src/app/resources/details/resourceDetails.de.json` — add `"maintenance": "Wartung"` under `actions`.

- [ ] **Step 6: Verify typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep resourceDetails | head`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/resources/details/resourceDetails.tsx apps/frontend/src/app/resources/details/resourceDetails.en.json apps/frontend/src/app/resources/details/resourceDetails.de.json
git commit -m "feat(ATT-290): drop schedules from detail page, add Maintenance trigger button"
```

---

## Task 15: Add "Manage maintenance" link inside `<MaintenanceManagement>` header

**Files:**
- Modify: `apps/frontend/src/app/resources/details/maintenance-management/index.tsx`
- Modify: `apps/frontend/src/app/resources/details/maintenance-management/{de,en}.json`

- [ ] **Step 1: Import `useNavigate`**

In `apps/frontend/src/app/resources/details/maintenance-management/index.tsx`, add at the top:

```tsx
import { useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Use `useNavigate` in the component**

Just after `const { t } = useTranslations(...)` add:

```tsx
const navigate = useNavigate();
```

- [ ] **Step 3: Insert the "Manage maintenance" button**

In the `PageHeader actions` block (lines 80–97), add a new `<Button variant="ghost">` **before** the `LabeledSwitch`:

```tsx
            <Button variant="ghost"
              onPress={() => navigate(`/resources/${resourceId}/maintenance`)}
              data-cy="manage-maintenance-button"
            >
              {t('actions.manageHub.label')}
            </Button>
```

- [ ] **Step 4: Add i18n keys**

Add to both `en.json` and `de.json` in the same dir, under `actions`:

```json
"manageHub": { "label": "Manage maintenance" }
```

(German: `"label": "Wartung verwalten"`.)

- [ ] **Step 5: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep maintenance-management | head`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/resources/details/maintenance-management/
git commit -m "feat(ATT-290): add Manage maintenance link in MaintenanceManagement header"
```

---

## Task 16: Delete the old `maintenance-schedules` directory

Now that nothing imports from it, remove it cleanly.

**Files:**
- Delete: `apps/frontend/src/app/resources/details/maintenance-schedules/` (entire directory)

- [ ] **Step 1: Confirm no remaining imports**

Run:

```bash
grep -rn "from '.*maintenance-schedules'" apps/frontend/src apps/frontend/index.html 2>/dev/null
```

Expected: only matches inside `apps/frontend/src/app/resources/details/maintenance-schedules/` itself (self-references in tests, internal files). No matches from outside that directory.

If anything else still imports from it, fix the importer first.

- [ ] **Step 2: Remove the directory**

```bash
rm -rf apps/frontend/src/app/resources/details/maintenance-schedules
```

- [ ] **Step 3: Typecheck + lint the full app**

```bash
cd apps/frontend && npx tsc --noEmit && npx eslint src/app/resources/details --max-warnings=0
```

Expected: zero errors, zero warnings introduced by this PR.

- [ ] **Step 4: Commit**

```bash
git add -A apps/frontend/src/app/resources/details/maintenance-schedules
git commit -m "feat(ATT-290): remove legacy maintenance-schedules card"
```

---

## Task 17: Manual browser verification + screenshot

No automated end-to-end test exists for these views, so smoke-test in the browser and capture proof.

- [ ] **Step 1: Start the dev server**

```bash
cd apps/frontend && npm run dev
```

- [ ] **Step 2: Walk the golden path**

In the browser (Tailscale URL or `http://localhost:4200`):

1. Sign in as a user with `canManage` for some resource.
2. Open the resource detail page. Confirm:
   - The "Maintenance" button is in the PageHeader actions row.
   - The old "Maintenance Schedules" card is **gone**.
   - The "Maintenance Management" card is still present, with a new "Manage maintenance" link in its header.
3. Click "Maintenance" → land on `/resources/:id/maintenance`. Confirm:
   - PageHeader with back arrow, title "Maintenance · {resource name}", "+ New schedule" primary action.
   - Stat strip with 4 tiles (Active / Schedules / Next run / This month) — values plausible.
   - Two tabs visible: Schedules (default), Active & history.
4. **Schedules tab**:
   - If empty: shows empty state with "Create your first schedule" CTA. Click it.
   - Drawer slides in from the right. Fill in name + USAGE_HOURS, save. Drawer closes; new accordion item appears.
   - Expand the accordion item. Confirm trigger summary text and three action buttons (Edit / Pause / Delete).
   - Click Pause → status chip switches to "Paused". Click Resume → back to "On".
   - Click Edit → drawer opens populated.
   - Click Delete → confirmation modal. Confirm deletion. Item disappears.
5. **Active & history tab**:
   - If a maintenance is currently active: the Live section shows the green-bordered card with "Mark done" — click it through the existing flow.
   - Upcoming and History sections render. History "Show all" toggles between last-30-days and full list when both exist.
6. **Detail page round-trip**: from the hub, click the back arrow → land on `/resources/:id`. Click the "Manage maintenance" link inside `<MaintenanceManagement>` → land on the hub again.

- [ ] **Step 3: Capture a screenshot of the hub**

Save a PNG at `docs/superpowers/specs/2026-05-13-maintenance-hub-screenshot.png` (one screen showing the populated Schedules tab) and check it in. This is the proof the work matches the spec.

- [ ] **Step 4: Run vitest one last time across the touched area**

```bash
cd apps/frontend && npx vitest run src/app/resources/details/maintenance-hub
```

Expected: all green.

- [ ] **Step 5: Commit the screenshot**

```bash
git add docs/superpowers/specs/2026-05-13-maintenance-hub-screenshot.png
git commit -m "docs(ATT-290): add maintenance hub screenshot"
```

---

## Self-review pass

After all tasks complete, before opening the PR for the implementation:

1. **Spec coverage** — every acceptance criterion in `docs/superpowers/specs/2026-05-13-maintenance-hub-design.md` (section "Acceptance criteria") maps to at least one task:
   - AC1 (route reachable from two places) → Tasks 13, 14, 15
   - AC2 (PageHeader back + primary action) → Task 12
   - AC3 (Schedules tab accordion w/ edit/pause/delete) → Tasks 5, 6
   - AC4 (Drawer save updates list) → Tasks 3, 4
   - AC5 (Activity tab Live/Upcoming/History) → Tasks 7, 8, 9, 10
   - AC6 (detail page MaintenanceSchedules removed) → Task 14
   - AC7 (permission gate) → Task 12
   - AC8 (theme + mobile parity) → Manual check in Task 17
   - AC9 (i18n keys present) → Tasks 2, 14, 15

2. **Placeholder scan** — there is exactly one intentional "fallback to maintenance-management's own i18n if needed" comment in Task 10 with an explicit follow-up step (Task 10 Step 2) to remove the hard-coded English. Confirm that step is done before the Task 10 commit.

3. **Type consistency** — function and prop names used across tasks:
   - `ScheduleForm`: props `{ resourceId, scheduleId?, onSaved, onCancel }` — used identically in Task 4
   - `ScheduleFormDrawer`: props `{ resourceId, scheduleId?, isOpen, onClose }` — used identically in Task 6 and Task 12
   - `LiveSection`: props `{ resourceId, liveMaintenances }` — used identically in Task 10
   - `UpcomingSection`: prop `upcomingMaintenances` — used identically in Task 10
   - `HistorySection`: prop `pastMaintenances` — used identically in Task 10
   - `StatStrip`: props `{ schedules, maintenances, now }` — used identically in Task 12
   - All matches. No drift detected.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-maintenance-hub.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a 17-task plan touching this many files.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**
