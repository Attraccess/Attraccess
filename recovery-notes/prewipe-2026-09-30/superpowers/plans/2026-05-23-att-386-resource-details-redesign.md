# ATT-386 — Resource Details Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered `/resources/:id` page with a tabbed hub-and-spoke layout per the spec at `docs/superpowers/specs/2026-05-23-att-386-resource-details-redesign-design.md`.

**Architecture:** A new `ResourceTabsLayout` shell renders `PageHeader` + persistent `ResourceHealthWarning` + perm-filtered HeroUI `Tabs` + `<Outlet />`. The Overview tab composes Session, Billing, Documentation preview, and own-last-3 sessions. Existing sub-page components (Flows, Forms, Maintenance, People, Groups, History) are reused unchanged, just nested under the new layout route. Tab perm-filtering centralizes via a `useResourceTabs` hook.

**Tech Stack:** React, React Router v6 nested routes + `<Outlet />`, HeroUI v3 (`Tabs`, `Select`), Tailwind, `@attraccess/react-query-client`, `@attraccess/plugins-frontend-ui` `useTranslations`.

**Working directory:** `/Users/jappy/.cyrus/worktrees/ATT-386` (existing worktree; branch `att-386-resource-details-page-full-redesign-current-layout-is`).

---

## File structure overview

**New files:**
- `apps/frontend/src/app/resources/details/layout/ResourceTabsLayout.tsx` — page shell with PageHeader + HealthWarning + Tabs + Outlet
- `apps/frontend/src/app/resources/details/layout/useResourceTabs.ts` — hook returning visible tab list filtered by perms
- `apps/frontend/src/app/resources/details/overview/ResourceOverviewTab.tsx` — Overview tab body
- `apps/frontend/src/app/resources/details/overview/RecentSessionsCard.tsx` — own last 3 sessions card
- `apps/frontend/src/app/resources/details/overview/ResourceDocsPreviewCard.tsx` — docs preview card
- `apps/frontend/src/app/resources/details/overview/recentSessionsCard.en.json`
- `apps/frontend/src/app/resources/details/overview/recentSessionsCard.de.json`
- `apps/frontend/src/app/resources/details/overview/resourceDocsPreviewCard.en.json`
- `apps/frontend/src/app/resources/details/overview/resourceDocsPreviewCard.de.json`
- `apps/frontend/src/app/resources/details/history/ResourceHistoryTab.tsx` — thin wrapper around `ResourceUsageHistory` to render at the route
- `apps/frontend/src/app/resources/details/people/ResourcePeopleTab.tsx` — thin wrapper around `PeopleManagement` with resource context
- `apps/frontend/src/app/resources/details/groups/ResourceGroupsTab.tsx` — thin wrapper around `ManageResourceGroups`

**Modified files:**
- `apps/frontend/src/app/resources/details/resourceDetails.tsx` — replaced by `ResourceTabsLayout` re-export wrapper for back-compat (keeps `ResourceDetails` import alive in routes) OR deleted if route table updates the import
- `apps/frontend/src/app/resources/details/resourceDetails.en.json` — add `tabs.*` and reroute existing action keys
- `apps/frontend/src/app/resources/details/resourceDetails.de.json` — same
- `apps/frontend/src/app/routes/index.tsx` — convert flat `/resources/:id/...` routes to a nested layout route with children

**Deleted files:** none (existing sub-page components are reused as-is).

---

## Task 1: Add tab + overview i18n keys

**Files:**
- Modify: `apps/frontend/src/app/resources/details/resourceDetails.en.json`
- Modify: `apps/frontend/src/app/resources/details/resourceDetails.de.json`

- [ ] **Step 1: Update English translations**

Replace `apps/frontend/src/app/resources/details/resourceDetails.en.json` with:

```json
{
  "error": {
    "resourceNotFound": {
      "title": "Resource not found",
      "description": "The requested resource could not be found or you don't have permission to view it.",
      "backToResources": "Back to Resources"
    }
  },
  "tabs": {
    "overview": "Overview",
    "history": "History",
    "people": "People",
    "groups": "Groups",
    "maintenance": "Maintenance",
    "flows": "Flows",
    "forms": "Forms",
    "mobilePickerLabel": "Section"
  },
  "actions": {
    "edit": "Edit",
    "delete": "Delete",
    "documentation": "Documentation",
    "maintenance": "Maintenance",
    "qrCode": "QR Code",
    "moreLabel": "More actions"
  }
}
```

- [ ] **Step 2: Update German translations**

Replace `apps/frontend/src/app/resources/details/resourceDetails.de.json` with:

```json
{
  "error": {
    "resourceNotFound": {
      "title": "Ressource nicht gefunden",
      "description": "Die angefragte Ressource konnte nicht gefunden werden oder Sie haben keine Berechtigung, sie anzuzeigen.",
      "backToResources": "Zurück zu Ressourcen"
    }
  },
  "tabs": {
    "overview": "Übersicht",
    "history": "Verlauf",
    "people": "Personen",
    "groups": "Gruppen",
    "maintenance": "Wartung",
    "flows": "Flows",
    "forms": "Formulare",
    "mobilePickerLabel": "Bereich"
  },
  "actions": {
    "edit": "Bearbeiten",
    "delete": "Löschen",
    "documentation": "Dokumentation",
    "maintenance": "Wartung",
    "qrCode": "QR-Code",
    "moreLabel": "Weitere Aktionen"
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit`
Expected: no new errors from these files.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/resources/details/resourceDetails.en.json apps/frontend/src/app/resources/details/resourceDetails.de.json
git commit -m "feat(ATT-386): add tab + overflow action i18n keys"
```

---

## Task 2: useResourceTabs hook

**Files:**
- Create: `apps/frontend/src/app/resources/details/layout/useResourceTabs.ts`

- [ ] **Step 1: Create hook**

Create `apps/frontend/src/app/resources/details/layout/useResourceTabs.ts`:

```ts
import { useMemo } from 'react';
import {
  useAccessControlServiceResourceIntroducersIsIntroducer,
  useResourceMaintenancesServiceCanManageMaintenance,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';

export type ResourceTabKey =
  | 'overview'
  | 'history'
  | 'people'
  | 'groups'
  | 'maintenance'
  | 'flows'
  | 'forms';

export interface ResourceTabDescriptor {
  key: ResourceTabKey;
  path: string;
  translationKey: string;
}

export function useResourceTabs(resourceId: number): {
  tabs: ResourceTabDescriptor[];
  canManageResources: boolean;
  isIntroducer: boolean;
  canManageMaintenance: boolean;
} {
  const { hasPermission, user } = useAuth();
  const canManageResources = hasPermission('canManageResources');

  const { data: introducerData } = useAccessControlServiceResourceIntroducersIsIntroducer(
    {
      resourceId,
      userId: user?.id as number,
      includeGroups: true,
    },
    undefined,
    { enabled: !!user?.id },
  );
  const isIntroducer = !!introducerData?.isIntroducer;

  const { data: maintenancePermissions } =
    useResourceMaintenancesServiceCanManageMaintenance({ resourceId });
  const canManageMaintenance = !!maintenancePermissions?.canManage;

  const tabs = useMemo<ResourceTabDescriptor[]>(() => {
    const list: ResourceTabDescriptor[] = [
      { key: 'overview', path: '', translationKey: 'tabs.overview' },
      { key: 'history', path: 'history', translationKey: 'tabs.history' },
    ];

    if (isIntroducer || canManageResources) {
      list.push({ key: 'people', path: 'people', translationKey: 'tabs.people' });
    }
    if (canManageResources) {
      list.push({ key: 'groups', path: 'groups', translationKey: 'tabs.groups' });
    }
    if (canManageMaintenance) {
      list.push({ key: 'maintenance', path: 'maintenance', translationKey: 'tabs.maintenance' });
    }
    if (canManageResources) {
      list.push({ key: 'flows', path: 'flows', translationKey: 'tabs.flows' });
      list.push({ key: 'forms', path: 'forms', translationKey: 'tabs.forms' });
    }
    return list;
  }, [isIntroducer, canManageResources, canManageMaintenance]);

  return { tabs, canManageResources, isIntroducer, canManageMaintenance };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/details/layout/useResourceTabs.ts
git commit -m "feat(ATT-386): add useResourceTabs hook for perm-filtered tab list"
```

---

## Task 3: ResourceTabsLayout component

**Files:**
- Create: `apps/frontend/src/app/resources/details/layout/ResourceTabsLayout.tsx`

- [ ] **Step 1: Create layout component**

Create `apps/frontend/src/app/resources/details/layout/ResourceTabsLayout.tsx`:

```tsx
import { useParams, useNavigate, useLocation, Outlet, Navigate } from 'react-router-dom';
import { Button, Spinner, Tabs, Tab, Select, SelectItem, useOverlayState } from '@heroui/react';
import { useAuth } from '../../../../hooks/useAuth';
import { useToastMessage } from '../../../../components/toastProvider';
import {
  ArrowLeft,
  BookOpen,
  FolderIcon,
  Gauge,
  History as HistoryIcon,
  ListChecks,
  PenSquareIcon,
  ShapesIcon,
  Trash,
  Users,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import {
  useResourcesServiceDeleteOneResource,
  useResourcesServiceGetOneResourceById,
  useResourcesServiceGetAllResourcesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader, PageAction } from '../../../../components/pageHeader';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import { DocumentationModal } from '../../documentation';
import { ResourceEditModal } from '../../editModal/resourceEditModal';
import { ResourceQrCode } from '../qrcode';
import { useQrCodeAction } from '../useQrCodeAction';
import { filenameToUrl } from '../../../../api';
import { ResourceHealthWarning } from '../health-state';
import { useResourceTabs, ResourceTabKey } from './useResourceTabs';
import de from '../resourceDetails.de.json';
import en from '../resourceDetails.en.json';

const TAB_ICONS: Record<ResourceTabKey, JSX.Element> = {
  overview: <Gauge className="w-4 h-4" />,
  history: <HistoryIcon className="w-4 h-4" />,
  people: <Users className="w-4 h-4" />,
  groups: <FolderIcon className="w-4 h-4" />,
  maintenance: <WrenchIcon className="w-4 h-4" />,
  flows: <WorkflowIcon className="w-4 h-4" />,
  forms: <ListChecks className="w-4 h-4" />,
};

function ResourceTabsLayoutComponent() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);

  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isOpen, open, close: closeDeleteModal } = useOverlayState();

  const { hasPermission } = useAuth();
  const { success, error: showError } = useToastMessage();
  useQrCodeAction({ resourceId });

  const { t } = useTranslations({ en, de });

  const canManageResources = hasPermission('canManageResources');

  const {
    data: resource,
    isLoading: isLoadingResource,
    error: resourceError,
  } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const deleteResource = useResourcesServiceDeleteOneResource();

  const { tabs } = useResourceTabs(resourceId);

  const activeTabKey = useMemo<ResourceTabKey>(() => {
    const base = `/resources/${resourceId}`;
    const remainder = location.pathname.startsWith(base)
      ? location.pathname.slice(base.length).replace(/^\//, '').split('/')[0]
      : '';
    const match = tabs.find((tab) => tab.path === remainder);
    return match?.key ?? 'overview';
  }, [location.pathname, resourceId, tabs]);

  const handleDelete = async () => {
    try {
      await deleteResource.mutateAsync({ id: resourceId });
      success({
        title: 'Resource deleted',
        description: `${resource?.name} has been successfully deleted`,
      });
      queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });
      navigate('/resources');
    } catch (err) {
      showError({
        title: 'Failed to delete resource',
        description: 'An error occurred while deleting the resource. Please try again.',
      });
      console.error('Failed to delete resource:', err);
      throw err;
    }
  };

  if (isLoadingResource) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner color="accent" data-cy="resource-details-loading-spinner" />
      </div>
    );
  }

  if (resourceError || !resource) {
    return (
      <div className="max-w-7xl mx-auto px-4 flex flex-col items-center justify-center min-h-screen">
        <h2 className="text-xl font-semibold mb-2">{t('error.resourceNotFound.title')}</h2>
        <p className="text-gray-500 mb-4">{t('error.resourceNotFound.description')}</p>
        <Button variant="ghost" onPress={() => navigate('/resources')} data-cy="back-to-resources-button">
          <ArrowLeft className="w-4 h-4" />
          {t('error.resourceNotFound.backToResources')}
        </Button>
      </div>
    );
  }

  const overflowActions: PageAction[] = [
    {
      key: 'documentation',
      label: t('actions.documentation'),
      icon: <BookOpen className="w-4 h-4" />,
      dataCy: 'documentation-button',
      renderTrigger: (triggerProps) => (
        <DocumentationModal resourceId={resourceId}>
          {(onOpenDocumentation) => <Button {...triggerProps} onPress={onOpenDocumentation} />}
        </DocumentationModal>
      ),
    },
    {
      key: 'qr',
      label: t('actions.qrCode'),
      isHidden: !canManageResources,
      renderTrigger: (triggerProps) => (
        <ResourceQrCode
          resourceId={resourceId}
          variant={triggerProps.variant}
          size={triggerProps.size}
          buttonIconSize={16}
        />
      ),
    },
    {
      key: 'edit',
      label: t('actions.edit'),
      icon: <PenSquareIcon className="w-4 h-4" />,
      isHidden: !canManageResources,
      dataCy: 'edit-resource-button',
      renderTrigger: (triggerProps) => (
        <ResourceEditModal resourceId={resourceId} closeOnSuccess>
          {(onOpen) => <Button {...triggerProps} onPress={onOpen} />}
        </ResourceEditModal>
      ),
    },
    {
      key: 'delete',
      label: t('actions.delete'),
      icon: <Trash className="w-4 h-4" />,
      variant: 'destructive',
      isHidden: !canManageResources,
      onPress: open,
      dataCy: 'delete-resource-button',
    },
  ];

  const useMobilePicker = tabs.length > 5;

  return (
    <div>
      <PageHeader
        title={resource.name}
        icon={!resource.imageFilename && <ShapesIcon className="w-6 h-6" />}
        thumbnailSrc={resource.imageFilename ? filenameToUrl(resource.imageFilename) : undefined}
        thumbnailAlt={resource.name}
        subtitle={resource.description ?? undefined}
        backTo="/resources"
        actions={overflowActions}
        maxVisibleActions={0}
        moreActionsLabel={t('actions.moreLabel')}
      />

      <div className="mb-6">
        <ResourceHealthWarning resourceId={resourceId} />
      </div>

      <div className="mb-6">
        {useMobilePicker ? (
          <div className="sm:hidden">
            <Select
              aria-label={t('tabs.mobilePickerLabel')}
              selectedKeys={[activeTabKey]}
              onChange={(e) => {
                const next = tabs.find((tab) => tab.key === (e.target.value as ResourceTabKey));
                if (next) navigate(`/resources/${resourceId}${next.path ? '/' + next.path : ''}`);
              }}
              data-cy="resource-tabs-mobile-picker"
            >
              {tabs.map((tab) => (
                <SelectItem key={tab.key}>{t(tab.translationKey)}</SelectItem>
              ))}
            </Select>
          </div>
        ) : null}

        <div className={useMobilePicker ? 'hidden sm:block' : ''}>
          <Tabs
            aria-label={t('tabs.mobilePickerLabel')}
            variant="underlined"
            selectedKey={activeTabKey}
            onSelectionChange={(key) => {
              const next = tabs.find((tab) => tab.key === (key as ResourceTabKey));
              if (next) navigate(`/resources/${resourceId}${next.path ? '/' + next.path : ''}`);
            }}
            data-cy="resource-tabs"
          >
            {tabs.map((tab) => (
              <Tab
                key={tab.key}
                title={
                  <span className="flex items-center gap-2">
                    {TAB_ICONS[tab.key]}
                    {t(tab.translationKey)}
                  </span>
                }
              />
            ))}
          </Tabs>
        </div>
      </div>

      <Outlet />

      {canManageResources && (
        <DeleteConfirmationModal
          isOpen={isOpen}
          onClose={closeDeleteModal}
          onConfirm={handleDelete}
          itemName={resource.name}
          data-cy="delete-confirmation-modal"
        />
      )}

      {/* Redirect for routes that resolve to a tab the user cannot see */}
      {tabs.find((tab) => tab.key === activeTabKey) ? null : <Navigate to={`/resources/${resourceId}`} replace />}
    </div>
  );
}

export const ResourceTabsLayout = memo(ResourceTabsLayoutComponent);
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/details/layout/ResourceTabsLayout.tsx
git commit -m "feat(ATT-386): add ResourceTabsLayout shell with persistent tabs"
```

---

## Task 4: RecentSessionsCard

**Files:**
- Create: `apps/frontend/src/app/resources/details/overview/RecentSessionsCard.tsx`
- Create: `apps/frontend/src/app/resources/details/overview/recentSessionsCard.en.json`
- Create: `apps/frontend/src/app/resources/details/overview/recentSessionsCard.de.json`

- [ ] **Step 1: English translations**

Create `apps/frontend/src/app/resources/details/overview/recentSessionsCard.en.json`:

```json
{
  "title": "Recent sessions",
  "empty": "No runs yet on this resource.",
  "viewAll": "View all →",
  "columns": {
    "date": "Date",
    "duration": "Duration",
    "cost": "Cost",
    "status": "Status"
  },
  "status": {
    "running": "In progress",
    "completed": "Completed"
  },
  "noCost": "—"
}
```

- [ ] **Step 2: German translations**

Create `apps/frontend/src/app/resources/details/overview/recentSessionsCard.de.json`:

```json
{
  "title": "Letzte Nutzungen",
  "empty": "Du hast diese Ressource noch nicht genutzt.",
  "viewAll": "Alle anzeigen →",
  "columns": {
    "date": "Datum",
    "duration": "Dauer",
    "cost": "Kosten",
    "status": "Status"
  },
  "status": {
    "running": "Läuft",
    "completed": "Beendet"
  },
  "noCost": "—"
}
```

- [ ] **Step 3: Component**

Create `apps/frontend/src/app/resources/details/overview/RecentSessionsCard.tsx`:

```tsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import { FlatSection } from '../../../../components/flatSection';
import { History as HistoryIcon, CheckCircle2, CircleDashed } from 'lucide-react';
import {
  useResourcesServiceResourceUsageGetHistory,
  ResourceUsage,
} from '@attraccess/react-query-client';
import en from './recentSessionsCard.en.json';
import de from './recentSessionsCard.de.json';

interface RecentSessionsCardProps {
  resourceId: number;
}

function formatDuration(start: string, end?: string | null): string {
  if (!end) return '…';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function formatCost(session: ResourceUsage, fallback: string): string {
  const cost = (session as unknown as { cost?: number; currency?: string }).cost;
  if (typeof cost !== 'number' || cost <= 0) return fallback;
  const currency = (session as unknown as { currency?: string }).currency ?? '';
  return `${cost.toFixed(2)} ${currency}`.trim();
}

export function RecentSessionsCard({ resourceId }: RecentSessionsCardProps) {
  const { t } = useTranslations({ en, de });
  const { user } = useAuth();

  const { data, isLoading } = useResourcesServiceResourceUsageGetHistory(
    { resourceId, page: 1, limit: 3, userId: user?.id },
    undefined,
    { enabled: !!user?.id },
  );

  const rows = useMemo(() => (data?.data ?? []).slice(0, 3), [data?.data]);

  return (
    <FlatSection
      icon={<HistoryIcon className="w-4 h-4" />}
      title={t('title')}
      actions={
        <Link
          to={`/resources/${resourceId}/history`}
          className="text-sm text-primary hover:underline"
          data-cy="recent-sessions-view-all"
        >
          {t('viewAll')}
        </Link>
      }
      data-cy="recent-sessions-card"
    >
      {isLoading ? (
        <div className="text-sm text-foreground-500 py-2">…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-foreground-500 py-2" data-cy="recent-sessions-empty">
          {t('empty')}
        </div>
      ) : (
        <ul className="divide-y divide-default-200">
          {rows.map((session) => (
            <li
              key={session.id}
              className="flex items-center justify-between py-2 text-sm gap-4"
              data-cy="recent-sessions-row"
            >
              <span className="flex-1 truncate">{formatDate(session.startTime)}</span>
              <span className="w-16 text-right text-foreground-500">
                {formatDuration(session.startTime, session.endTime)}
              </span>
              <span className="w-20 text-right text-foreground-500">
                {formatCost(session, t('noCost'))}
              </span>
              <span className="w-6 text-right text-foreground-500">
                {session.endTime ? (
                  <CheckCircle2 className="w-4 h-4 inline" aria-label={t('status.completed')} />
                ) : (
                  <CircleDashed className="w-4 h-4 inline" aria-label={t('status.running')} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </FlatSection>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/resources/details/overview/recentSessionsCard.en.json apps/frontend/src/app/resources/details/overview/recentSessionsCard.de.json apps/frontend/src/app/resources/details/overview/RecentSessionsCard.tsx
git commit -m "feat(ATT-386): add RecentSessionsCard"
```

---

## Task 5: ResourceDocsPreviewCard

**Files:**
- Create: `apps/frontend/src/app/resources/details/overview/ResourceDocsPreviewCard.tsx`
- Create: `apps/frontend/src/app/resources/details/overview/resourceDocsPreviewCard.en.json`
- Create: `apps/frontend/src/app/resources/details/overview/resourceDocsPreviewCard.de.json`

- [ ] **Step 1: Inspect existing DocumentationView/DocumentationModal**

Run: `cat apps/frontend/src/app/resources/documentation/DocumentationView.tsx apps/frontend/src/app/resources/documentation/index.ts | head -120`
Note the hook used to fetch documentation (likely `useResourcesServiceGetOneResourceDocumentation` or similar). Use the same hook here. If a different hook is the canonical fetch, swap it in.

- [ ] **Step 2: English translations**

Create `apps/frontend/src/app/resources/details/overview/resourceDocsPreviewCard.en.json`:

```json
{
  "title": "Documentation",
  "openFull": "Open full",
  "empty": "No documentation for this resource yet.",
  "addCta": "Add documentation"
}
```

- [ ] **Step 3: German translations**

Create `apps/frontend/src/app/resources/details/overview/resourceDocsPreviewCard.de.json`:

```json
{
  "title": "Dokumentation",
  "openFull": "Vollständig öffnen",
  "empty": "Noch keine Dokumentation für diese Ressource.",
  "addCta": "Dokumentation hinzufügen"
}
```

- [ ] **Step 4: Component**

Create `apps/frontend/src/app/resources/details/overview/ResourceDocsPreviewCard.tsx`:

```tsx
import { useMemo } from 'react';
import { Button } from '@heroui/react';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuth } from '../../../../hooks/useAuth';
import { FlatSection } from '../../../../components/flatSection';
import { DocumentationModal } from '../../documentation';
import en from './resourceDocsPreviewCard.en.json';
import de from './resourceDocsPreviewCard.de.json';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';

interface ResourceDocsPreviewCardProps {
  resourceId: number;
}

const PREVIEW_CHAR_COUNT = 220;

export function ResourceDocsPreviewCard({ resourceId }: ResourceDocsPreviewCardProps) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const canManageResources = hasPermission('canManageResources');
  const navigate = useNavigate();

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const previewText = useMemo(() => {
    const raw = (resource as unknown as { documentationMarkdown?: string | null })?.documentationMarkdown ?? '';
    if (!raw) return '';
    return raw.length > PREVIEW_CHAR_COUNT ? raw.slice(0, PREVIEW_CHAR_COUNT).trimEnd() + '…' : raw;
  }, [resource]);

  if (!previewText) {
    if (!canManageResources) return null;
    return (
      <FlatSection
        icon={<BookOpen className="w-4 h-4" />}
        title={t('title')}
        data-cy="docs-preview-card"
      >
        <div className="flex items-center justify-between gap-4 py-2">
          <span className="text-sm text-foreground-500">{t('empty')}</span>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => navigate(`/resources/${resourceId}/documentation/edit`)}
            data-cy="docs-preview-add"
          >
            {t('addCta')}
          </Button>
        </div>
      </FlatSection>
    );
  }

  return (
    <FlatSection
      icon={<BookOpen className="w-4 h-4" />}
      title={t('title')}
      data-cy="docs-preview-card"
      actions={
        <DocumentationModal resourceId={resourceId}>
          {(onOpen) => (
            <Button size="sm" variant="ghost" onPress={onOpen} data-cy="docs-preview-open">
              {t('openFull')}
            </Button>
          )}
        </DocumentationModal>
      }
    >
      <p className="text-sm text-foreground-600 whitespace-pre-wrap">{previewText}</p>
    </FlatSection>
  );
}
```

NOTE: if the resource entity does not expose `documentationMarkdown`, replace the source line in `previewText` with the correct hook returning the markdown string. Investigate via `DocumentationView.tsx` in Step 1.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/resources/details/overview/resourceDocsPreviewCard.en.json apps/frontend/src/app/resources/details/overview/resourceDocsPreviewCard.de.json apps/frontend/src/app/resources/details/overview/ResourceDocsPreviewCard.tsx
git commit -m "feat(ATT-386): add ResourceDocsPreviewCard"
```

---

## Task 6: ResourceOverviewTab

**Files:**
- Create: `apps/frontend/src/app/resources/details/overview/ResourceOverviewTab.tsx`

- [ ] **Step 1: Component**

Create `apps/frontend/src/app/resources/details/overview/ResourceOverviewTab.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { ResourceUsageSession } from '../../usage/resourceUsageSession';
import { ResourceBillingInfo } from '../resourceBillingInfo';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { RecentSessionsCard } from './RecentSessionsCard';
import { ResourceDocsPreviewCard } from './ResourceDocsPreviewCard';

export function ResourceOverviewTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const [insufficientBalanceDesiredAmount, setInsufficientBalanceDesiredAmount] = useState(10);

  if (!resource) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-start">
        <div className="lg:col-span-2">
          <ResourceUsageSession
            resourceId={resourceId}
            resource={resource}
            data-cy="resource-usage-session"
            insufficientBalanceDesiredAmount={insufficientBalanceDesiredAmount}
          />
        </div>
        <aside className="lg:col-span-1">
          <ResourceBillingInfo
            variant="flat"
            resourceId={resourceId}
            onExampleAmountChange={(value) =>
              setInsufficientBalanceDesiredAmount(Math.ceil(value))
            }
          />
        </aside>
      </div>

      <ResourceDocsPreviewCard resourceId={resourceId} />

      <RecentSessionsCard resourceId={resourceId} />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/details/overview/ResourceOverviewTab.tsx
git commit -m "feat(ATT-386): add ResourceOverviewTab composing Session/Billing/Docs/Recent"
```

---

## Task 7: Thin tab wrappers for History / People / Groups

**Files:**
- Create: `apps/frontend/src/app/resources/details/history/ResourceHistoryTab.tsx`
- Create: `apps/frontend/src/app/resources/details/people/ResourcePeopleTab.tsx`
- Create: `apps/frontend/src/app/resources/details/groups/ResourceGroupsTab.tsx`

- [ ] **Step 1: History tab**

Create `apps/frontend/src/app/resources/details/history/ResourceHistoryTab.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { ResourceUsageHistory } from '../../usage/resourceUsageHistory';

export function ResourceHistoryTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);
  return <ResourceUsageHistory resourceId={resourceId} data-cy="resource-usage-history" />;
}
```

- [ ] **Step 2: People tab**

Create `apps/frontend/src/app/resources/details/people/ResourcePeopleTab.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import {
  useAccessControlServiceResourceIntroducersIsIntroducer,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { PeopleManagement } from '../../PeopleManagement';

export function ResourcePeopleTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);

  const { hasPermission, user } = useAuth();
  const canManageResources = hasPermission('canManageResources');

  const { data: isIntroducer } = useAccessControlServiceResourceIntroducersIsIntroducer(
    {
      resourceId,
      userId: user?.id as number,
      includeGroups: true,
    },
    undefined,
    { enabled: !!user?.id },
  );

  return (
    <PeopleManagement
      target={{ type: 'resource', id: resourceId }}
      canManageIntroducers={canManageResources}
      canManageIntroductions={isIntroducer?.isIntroducer || canManageResources}
      flat
      data-cy="manage-resource-people"
    />
  );
}
```

- [ ] **Step 3: Groups tab**

Create `apps/frontend/src/app/resources/details/groups/ResourceGroupsTab.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { ManageResourceGroups } from '../../groups';

export function ResourceGroupsTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);
  return <ManageResourceGroups resourceId={resourceId} data-cy="manage-resource-groups" />;
}
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/resources/details/history apps/frontend/src/app/resources/details/people apps/frontend/src/app/resources/details/groups
git commit -m "feat(ATT-386): add thin tab wrappers for history/people/groups"
```

---

## Task 8: Wire layout into routes

**Files:**
- Modify: `apps/frontend/src/app/routes/index.tsx`

- [ ] **Step 1: Inspect how routes are consumed**

Run: `grep -rn "useAllRoutes\|RouteConfig\|coreRoutes\b" apps/frontend/src | head`
The routes array is consumed by the auth-wrapping router elsewhere. Confirm whether children-of-parent route support is needed via React Router's `<Route>` or whether the consumer reads the flat list. If the consumer is a flat list mapping (no nested routing), keep routes flat but introduce a wrapper component pattern: each `/resources/:id/...` route renders `<ResourceTabsLayout><ChildTabComponent /></ResourceTabsLayout>` directly.

Inspect: `grep -rn "useAllRoutes\|RoutesProvider\|useRoutes" apps/frontend/src/app | head`. Adjust the route entries accordingly.

- [ ] **Step 2: Apply flat-list compatible route changes**

Assuming routes are consumed as a flat list (most likely given the file shape), replace the `/resources/:id` entries in `apps/frontend/src/app/routes/index.tsx`:

Find:

```tsx
  {
    path: '/resources/:id',
    element: <ResourceDetails />,
    authRequired: true,
  },
  {
    path: '/resources/:id/flows',
    element: <FlowsPage />,
    authRequired: true,
  },
  {
    path: '/resources/:id/forms',
    element: <FormListPage />,
    authRequired: 'canManageResources',
  },
```

Replace with:

```tsx
  {
    path: '/resources/:id',
    element: (
      <ResourceTabsLayout>
        <ResourceOverviewTab />
      </ResourceTabsLayout>
    ),
    authRequired: true,
  },
  {
    path: '/resources/:id/history',
    element: (
      <ResourceTabsLayout>
        <ResourceHistoryTab />
      </ResourceTabsLayout>
    ),
    authRequired: true,
  },
  {
    path: '/resources/:id/people',
    element: (
      <ResourceTabsLayout>
        <ResourcePeopleTab />
      </ResourceTabsLayout>
    ),
    authRequired: true,
  },
  {
    path: '/resources/:id/groups',
    element: (
      <ResourceTabsLayout>
        <ResourceGroupsTab />
      </ResourceTabsLayout>
    ),
    authRequired: 'canManageResources',
  },
  {
    path: '/resources/:id/flows',
    element: (
      <ResourceTabsLayout>
        <FlowsPage />
      </ResourceTabsLayout>
    ),
    authRequired: true,
  },
  {
    path: '/resources/:id/forms',
    element: (
      <ResourceTabsLayout>
        <FormListPage />
      </ResourceTabsLayout>
    ),
    authRequired: 'canManageResources',
  },
```

(Maintenance route is kept separate below because it links straight to `MaintenanceHubPage` — wrap it the same way:)

Replace:

```tsx
  {
    path: '/resources/:id/maintenance',
    element: <MaintenanceHubPage />,
    authRequired: true,
  },
```

with:

```tsx
  {
    path: '/resources/:id/maintenance',
    element: (
      <ResourceTabsLayout>
        <MaintenanceHubPage />
      </ResourceTabsLayout>
    ),
    authRequired: true,
  },
```

Update imports at the top of `routes/index.tsx`:

```tsx
import { ResourceTabsLayout } from '../resources/details/layout/ResourceTabsLayout';
import { ResourceOverviewTab } from '../resources/details/overview/ResourceOverviewTab';
import { ResourceHistoryTab } from '../resources/details/history/ResourceHistoryTab';
import { ResourcePeopleTab } from '../resources/details/people/ResourcePeopleTab';
import { ResourceGroupsTab } from '../resources/details/groups/ResourceGroupsTab';
```

Remove the now-unused `import { ResourceDetails } from '../resources/details/resourceDetails';` line.

- [ ] **Step 3: Update ResourceTabsLayout to accept children when used as wrapper**

Open `apps/frontend/src/app/resources/details/layout/ResourceTabsLayout.tsx` and change the component to accept optional `children` and render them in place of `<Outlet />`:

```tsx
import { ReactNode } from 'react';
// ...existing imports...

function ResourceTabsLayoutComponent({ children }: { children?: ReactNode }) {
  // ...all existing body unchanged until the JSX return...
  // Replace `<Outlet />` with:
  // {children ?? <Outlet />}
}

export const ResourceTabsLayout = memo(ResourceTabsLayoutComponent);
```

(Keep the `import { ... Outlet ... } from 'react-router-dom'` so the fallback works in case the layout is ever used inside a nested route configuration.)

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/routes/index.tsx apps/frontend/src/app/resources/details/layout/ResourceTabsLayout.tsx
git commit -m "feat(ATT-386): nest resource sub-routes under tabbed layout"
```

---

## Task 9: Remove old monolithic ResourceDetails

**Files:**
- Delete: `apps/frontend/src/app/resources/details/resourceDetails.tsx`

- [ ] **Step 1: Confirm no remaining importers**

Run: `grep -rn "from .*resourceDetails['\"]" apps/frontend/src | grep -v "\.json"`
Expected: zero matches outside the file itself. If any survive, replace them with `ResourceTabsLayout`.

- [ ] **Step 2: Delete file**

Run: `rm apps/frontend/src/app/resources/details/resourceDetails.tsx`

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add -A apps/frontend/src/app/resources/details/resourceDetails.tsx
git commit -m "refactor(ATT-386): drop legacy stacked ResourceDetails page"
```

---

## Task 10: Browser verification + screenshots

**Files:** none (verification only).

- [ ] **Step 1: Start dev server**

Run: `pnpm --filter @attraccess/frontend dev` (or the project's standard dev command — check `package.json` scripts if unsure). Run in background.

- [ ] **Step 2: Log in as a regular end user**

Open `/resources/<id>` in `agent-browser`. Verify:
- Single overflow `⋯` action menu (or none if no admin perms)
- Persistent tab bar showing only Overview, History
- Health warning banner above tabs (if resource has health issues)
- Session card left/main and Billing card right on ≥lg viewport
- Documentation preview snippet renders or hides per content
- Recent sessions card lists own last 3 (or empty state)

Capture screenshot: `att-386-overview-end-user.png`.

- [ ] **Step 3: Log in as an admin user**

Verify tab bar shows all entries (Overview, History, People, Groups, Maintenance, Flows, Forms) and `⋯` menu contains Documentation, QR, Edit, Delete.

Capture screenshots:
- `att-386-overview-admin.png`
- `att-386-history-admin.png` (after clicking History tab)
- `att-386-people-admin.png`
- `att-386-maintenance-admin.png`

- [ ] **Step 4: Mobile viewport**

Resize browser to 375px width. Verify:
- Session and Billing stack vertically (Session first)
- Tab bar collapses to a Select picker
- All tabs reachable via the picker

Capture screenshot: `att-386-overview-mobile.png`.

- [ ] **Step 5: Post screenshots back to Linear**

Upload each screenshot as a Linear attachment to ATT-386 and post a single comment listing them with one-line captions describing what changed in each shot.

- [ ] **Step 6: No commit** (verification step only).

---

## Task 11: Final sanity pass and changelog

**Files:**
- Possibly modify: changelog file (check existence under `CHANGELOG.md` or `apps/frontend/CHANGELOG.md`)

- [ ] **Step 1: Run typecheck + lint**

Run: `pnpm --filter @attraccess/frontend exec tsc --noEmit && pnpm --filter @attraccess/frontend lint`
Expected: zero errors and zero new lint warnings.

- [ ] **Step 2: Run unit tests**

Run: `pnpm --filter @attraccess/frontend test --run`
Expected: all green. Existing snapshots may need updating only if they cover the dropped layout — investigate any failure before regenerating.

- [ ] **Step 3: Update changelog (if convention dictates)**

Look at recent commits for changelog hints. If there's a changelog file, add an entry under the next release describing "Resource details page redesign (ATT-386)".

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(ATT-386): changelog + verification pass"
```

(Skip if no changelog update needed.)

---

## Self-review

- Every spec section maps to a task: tab bar (T3), persistent health warning (T3), header overflow (T3), Overview composition (T6), Docs preview (T5), Recent sessions (T4), History/People/Groups tab wrappers (T7), routing (T8), mobile picker (T3), i18n (T1, T4, T5), legacy removal (T9), verification (T10).
- No placeholders. Each code step has the actual source to write.
- Type consistency: `ResourceTabKey` defined in T2, reused in T3 only. `useResourceTabs` API stable between T2 and T3.
- Caveat: `documentationMarkdown` is a guess at the field name on the `Resource` entity. Task 5 Step 1 instructs the engineer to verify it via `DocumentationView.tsx` before coding the component. This is acceptable because the spec listed the exact source as an "implementation detail" and the engineer is told to confirm.
