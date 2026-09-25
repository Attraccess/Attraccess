import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card } from '@heroui/react';
import { LayoutDashboardIcon, GripVerticalIcon } from 'lucide-react';
import { useDashboardPins, updateDashboardPins, type Pin } from './pins';
import { useAllRoutes } from '../routes';
import { useAuth } from '../../hooks/useAuth';
import { hasRequiredPermissions } from '../routes/routeAccess';
import {
  useSidebarItems,
  buildSidebarEndItems,
} from '../layout/sidebarItems';
import sidebarEn from '../layout/sidebar.en.json';
import sidebarDe from '../layout/sidebar.de.json';
import en from './en.json';
import de from './de.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import usePluginState from '../plugins/plugin.state';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useResourcesServiceGetOneResourceById,
} from '@attraccess/react-query-client';
import { StatusChip } from '../resourceOverview/resourceGroupCard/statusChip';
import { ResourceUsageSession } from '../resources/usage/components';

function Landing() {
  const { data, isLoading, isError, refetch } = useDashboardPins();
  if (isLoading) return null;
  if (isError) return <div className="p-6"><p>Could not load your dashboard.</p><button onClick={() => void refetch()}>Retry loading pins</button></div>;
  if (!data?.length) return <Navigate to="/resources" replace />;
  if (data.some((pin) => pin.itemType === 'resource')) return <DashboardPage />;
  if (isLicenseLoading) return null;
  if (entries.length) return <DashboardPage />;
  if (!pluginsInitialized) return null;
  return <Navigate to="/resources" replace />;
}

type PageEntry = { pin: Pin; path: string; title: string; icon?: React.ReactNode; badgeCount?: number };
function usePageEntries(pins: Pin[]): PageEntry[] {
  const { t: sidebarT } = useTranslations({ en: sidebarEn, de: sidebarDe });
  const routes = useAllRoutes();
  const { plugins } = usePluginState();
  const sidebarItems = useSidebarItems();
  const { hasPermission } = useAuth();
  return useMemo(() => {
    const all: {
      path: string;
      translationKey?: string;
      icon?: React.ReactNode;
      title?: string;
      badgeCount?: number;
      isExternal?: boolean;
    }[] = [
      ...sidebarItems.flatMap((i) => ('items' in i ? i.items : [i])),
      ...buildSidebarEndItems('', '').flatMap((i) => ('items' in i ? i.items : [i])),
    ].map((item) => ({
      path: item.path,
      translationKey: item.translationKey,
      icon: <item.icon size={22} />,
      title: undefined,
      badgeCount: item.badgeCount,
      isExternal: item.isExternal,
    }));
    all.push(
      ...plugins
        .flatMap((manifest) => {
          try {
            return manifest.plugin.getSidebarItems?.() ?? [];
          } catch {
            return [];
          }
        })
        .map((item) => ({
          path: item.path,
          translationKey: undefined,
          icon: item.icon,
          title: item.label,
          badgeCount: undefined,
          isExternal: false,
        })),
    );
    return pins.flatMap((pin): PageEntry[] => {
      if (pin.itemType !== 'page') return [];
      const item = all.find((entry) => entry.path === pin.itemId);
      if (!item) return [];
      const route = routes.find((candidate) => candidate.path === pin.itemId);
      if (!route || (route.authRequired && route.authRequired !== true && !hasRequiredPermissions(route.authRequired, hasPermission))) return [];
      if (pin.itemId.startsWith('/kiosk') || pin.itemId === '/dashboard' || /^https?:/.test(pin.itemId)) return [];
      const labelKey = item.translationKey;
      const translationPath = labelKey ? findTranslationPath(sidebarEn, labelKey) : undefined;
      const title = item.title ?? (translationPath ? sidebarT(translationPath) : pin.itemId);
      return [{ path: pin.itemId, title, icon: item.icon, badgeCount: item.badgeCount, pin }];
    });
  }, [pins, routes, hasPermission, sidebarT, plugins, sidebarItems]);
}

function DashboardPage() {
  const { t } = useTranslations({ en, de });
  const { data: pins = [], isLoading, isError, refetch } = useDashboardPins();
  const entries = usePageEntries(pins);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }));

  const reorder = (from: string, to: string) => {
    const source = pins.findIndex((pin) => `${pin.itemType}:${pin.itemId}` === from);
    const target = pins.findIndex((pin) => `${pin.itemType}:${pin.itemId}` === to);
    if (source < 0 || target < 0 || source === target) return;
    void updateDashboardPins((current) => {
      const fromIndex = current.findIndex((pin) => `${pin.itemType}:${pin.itemId}` === from);
      const toIndex = current.findIndex((pin) => `${pin.itemType}:${pin.itemId}` === to);
      if (fromIndex < 0 || toIndex < 0) return current;
      const ordered = [...current]; const [entry] = ordered.splice(fromIndex, 1); ordered.splice(toIndex, 0, entry);
      return ordered;
    });
  };
  const removePin = (pin: Pin) => void updateDashboardPins((current) => current.filter((item) => item.itemType !== pin.itemType || item.itemId !== pin.itemId));

  return (
    <section className="p-6">
      <header className="mb-6 flex items-center gap-3">
        <LayoutDashboardIcon />
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted">{t('subtitle')}</p>
        </div>
      </header>
      {!pins.length ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">{t('emptyTitle')}</h2>
          <p className="mt-2">{t('emptyDescription')}</p>
          <Link className="mt-3 underline" to="/resources">
            {t('resources')}
          </Link>
        </Card>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (over) reorder(String(active.id), String(over.id));
        }}
      >
        <SortableContext items={pins.map((pin) => `${pin.itemType}:${pin.itemId}`)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pins.map((pin) =>
              pin.itemType === 'page' ? (
                (() => {
                  const entry = entries.find((item) => item.pin.itemId === pin.itemId);
                  if (!entry) return null;
                  return (
                    <SortablePageCard
                      key={entry.pin.itemId}
                      id={`page:${entry.pin.itemId}`}
                      className="flex flex-row items-center gap-3 p-4"
                    >
                      <GripVerticalIcon size={18} className="touch-none cursor-grab text-muted" />
                      {entry.icon}
                      <Link className="min-w-0 flex-1 font-medium hover:underline" to={entry.path}>
                        {entry.title}
                      </Link>
                      {!!entry.badgeCount && (
                        <span className="rounded-full bg-default-100 px-2 py-1 text-xs">{entry.badgeCount}</span>
                      )}
                      <button aria-label={`${t('unpin')} ${entry.title}`} onClick={() => removePin(entry.pin)}>
                        ★
                      </button>
                    </SortablePageCard>
                  );
                })()
              ) : (
                <ResourcePinCard
                  key={`resource:${pin.itemId}`}
                  pin={pin}
                  openLabel={t('open')}
                  resourceLabel={t('resource')}
                  unpinLabel={t('unpin')}
                  onUnpin={() => removePin(pin)}
                />
              ),
            )}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function findTranslationPath(value: unknown, key: string, prefix = ''): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const [childKey, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${childKey}` : childKey;
    if (childKey === key && typeof child === 'string') return path;
    const nested = findTranslationPath(child, key, path);
    if (nested) return nested;
  }
  return undefined;
}

function SortablePageCard({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({ id });
  return <Card ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={className}>{children}</Card>;
}

function ResourcePinCard({ pin, openLabel, resourceLabel, unpinLabel, onUnpin }: { pin: Pin; openLabel: string; resourceLabel: string; unpinLabel: string; onUnpin: () => void }) {
  const id = Number(pin.itemId);
  const {
    data: resource,
    isLoading,
    isError,
  } = useResourcesServiceGetOneResourceById({ id }, undefined, {
    enabled: Number.isSafeInteger(id) && id > 0,
    retry: false,
  });
  if (isLoading || isError || !resource)
    return <SortableResourceCard id={`resource:${pin.itemId}`} className="flex flex-row items-center gap-3 rounded-xl border border-default-200 bg-content1 p-4">
      <GripVerticalIcon size={18} className="touch-none cursor-grab text-muted" />
      <span className="flex-1">{isLoading ? `Loading ${resourceLabel.toLowerCase()}…` : resourceLabel}</span>
      <button aria-label={`${unpinLabel} ${resourceLabel}`} onClick={onUnpin}>★</button>
    </SortableResourceCard>;
  return (
    <SortableResourceCard
      id={`resource:${pin.itemId}`}
      className="flex flex-col gap-3 rounded-xl border border-default-200 bg-content1 p-4"
    >
      <div className="flex flex-row items-center justify-between p-3">
        <GripVerticalIcon size={18} className="touch-none cursor-grab text-muted" />
        <h2 className="font-semibold">{resource.name}</h2>
        <button aria-label={`${unpinLabel} ${resource.name}`} onClick={onUnpin}>
          ★
        </button>
      </div>
      <div className="flex justify-end">
        <StatusChip resourceId={id} />
      </div>
      <ResourceUsageSession resourceId={id} resource={resource} />
      <Link className="mt-3 inline-block underline" to={`/resources/${id}`}>
        {openLabel}
      </Link>
    </SortableResourceCard>
  );
}

function SortableResourceCard({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({ id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={className}>{children}</div>;
}

export { Landing as DashboardLanding, DashboardPage };
