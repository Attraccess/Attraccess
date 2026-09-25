import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card } from '@heroui/react';
import { LayoutDashboardIcon, GripVerticalIcon } from 'lucide-react';
import { useDashboardPins, updateDashboardPins, type Pin } from './pins';
import { useAllRoutes } from '../routes';
import { useAuth } from '../../hooks/useAuth';
import { hasRequiredPermissions } from '../routes/routeAccess';
import { SIDEBAR_ITEMS, useSidebarItems, buildSidebarEndItems } from '../layout/sidebarItems';
import en from './en.json';
import de from './de.json';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { ResourceUsageSession } from '../resources/usage/components/ResourceUsageSession';
import { StatusChip } from '../resourceOverview/resourceGroupCard/statusChip';
import usePluginState from '../plugins/plugin.state';
import sidebarEn from '../layout/sidebar.en.json';
import sidebarDe from '../layout/sidebar.de.json';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function Landing() {
  const { data, isLoading, isError } = useDashboardPins();
  if (isLoading) return null;
  if (isError) return <p className="p-6">Could not load your dashboard.</p>;
  return data?.length ? <DashboardPage /> : <Navigate to="/resources" replace />;
}

type NavEntry = { path: string; title: string; icon?: React.ReactNode; badgeCount?: number };
function DashboardPage() {
  const { t } = useTranslations({ en, de });
  const { t: sidebarT } = useTranslations({ en: sidebarEn, de: sidebarDe });
  const routes = useAllRoutes();
  const { plugins } = usePluginState();
  const sidebarItems = useSidebarItems();
  const { hasPermission } = useAuth();
  const { data: pins = [] } = useDashboardPins();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }));
  const entries = useMemo(() => {
    const builtInPaths = new Set(SIDEBAR_ITEMS.flatMap((item) => 'items' in item ? item.items : [item]).map((item) => item.path));
    const all: { path: string; translationKey?: string; icon?: React.ReactNode; title?: string; badgeCount?: number; isExternal?: boolean }[] = [...sidebarItems.flatMap((i) => 'items' in i ? i.items : [i]), ...buildSidebarEndItems('', '').flatMap((i) => 'items' in i ? i.items : [i])].map((item) => ({ path: item.path, translationKey: item.translationKey, icon: <item.icon size={22} />, title: undefined, badgeCount: item.badgeCount, isExternal: item.isExternal }));
    all.push(...plugins.flatMap((manifest) => {
      try { return manifest.plugin.getSidebarItems?.() ?? []; } catch { return []; }
    }).map((item) => ({ path: item.path, translationKey: undefined, icon: item.icon, title: item.label, badgeCount: undefined, isExternal: false })));
    return pins.flatMap((pin): (NavEntry & { pin: Pin })[] => {
      if (pin.itemType !== 'page') return [];
      const item = all.find((entry) => entry.path === pin.itemId);
      if (!item && builtInPaths.has(pin.itemId)) return [];
      const route = routes.find((candidate) => candidate.path === pin.itemId);
      if (!item || item.isExternal) return [];
      if (!route || (route.authRequired && route.authRequired !== true && !hasRequiredPermissions(route.authRequired, hasPermission))) return [];
      if (pin.itemId.startsWith('/kiosk') || pin.itemId === '/dashboard' || /^https?:/.test(pin.itemId)) return [];
      const labelKey = item.translationKey;
      const title = item.title ?? (labelKey ? sidebarT(['/dependencies', '/changelog', '/printables'].includes(pin.itemId) ? `endItems.${labelKey}` : `groups.##default##.items.${labelKey}`) : pin.itemId);
      return [{ path: pin.itemId, title, icon: item.icon, badgeCount: item.badgeCount, pin }];
    });
  }, [pins, routes, hasPermission, sidebarT, plugins, sidebarItems]);

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

  return <section className="p-6">
    <header className="mb-6 flex items-center gap-3"><LayoutDashboardIcon /><div><h1 className="text-2xl font-semibold">{t('title')}</h1><p className="text-sm text-muted">{t('subtitle')}</p></div></header>
    {!pins.length ? <Card className="p-6"><h2 className="text-lg font-semibold">{t('emptyTitle')}</h2><p className="mt-2">{t('emptyDescription')}</p><Link className="mt-3 underline" to="/resources">{t('resources')}</Link></Card> : null}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over) reorder(String(active.id), String(over.id)); }}>
    <SortableContext items={pins.map((pin) => `${pin.itemType}:${pin.itemId}`)} strategy={rectSortingStrategy}>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {pins.map((pin) => pin.itemType === 'page' ? (() => {
        const entry = entries.find((item) => item.pin.itemId === pin.itemId);
        if (!entry) return null;
        return <SortablePageCard key={entry.pin.itemId} id={`page:${entry.pin.itemId}`} className="flex flex-row items-center gap-3 p-4">
        <GripVerticalIcon size={18} className="touch-none cursor-grab text-muted" />
        {entry.icon}
        <Link className="min-w-0 flex-1 font-medium hover:underline" to={entry.path}>{entry.title}</Link>
        {!!entry.badgeCount && <span className="rounded-full bg-default-100 px-2 py-1 text-xs">{entry.badgeCount}</span>}
        <button aria-label={`${t('unpin')} ${entry.title}`} onClick={() => removePin(entry.pin)}>★</button>
      </SortablePageCard>;
      })() : <ResourcePinCard key={`resource:${pin.itemId}`} pin={pin} openLabel={t('open')} resourceLabel={t('resource')} unpinLabel={t('unpin')} onUnpin={() => removePin(pin)} />)}
    </div>
    </SortableContext></DndContext>
  </section>;
}

function SortablePageCard({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({ id });
  return <Card ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={className}>{children}</Card>;
}

function ResourcePinCard({ pin, openLabel, resourceLabel, unpinLabel, onUnpin }: { pin: Pin; openLabel: string; resourceLabel: string; unpinLabel: string; onUnpin: () => void }) {
  const id = Number(pin.itemId);
  const { data: resource, isLoading, isError } = useResourcesServiceGetOneResourceById({ id }, undefined, { enabled: Number.isSafeInteger(id) && id > 0, retry: false });
  if (isLoading) return <Card className="p-4">Loading {resourceLabel.toLowerCase()}…</Card>;
  if (isError || !resource) return <Card className="flex flex-row items-center gap-3 p-4"><span className="flex-1">{resourceLabel}</span><button aria-label={`${unpinLabel} ${resourceLabel}`} onClick={onUnpin}>★</button></Card>;
  return <SortableResourceCard id={`resource:${pin.itemId}`} className="flex flex-col gap-3 rounded-xl border border-default-200 bg-content1 p-4">
    <div className="flex flex-row items-center justify-between p-3"><GripVerticalIcon size={18} className="touch-none cursor-grab text-muted" /><h2 className="font-semibold">{resource.name}</h2><button aria-label={`${unpinLabel} ${resource.name}`} onClick={onUnpin}>★</button></div>
    <div className="flex justify-end"><StatusChip resourceId={id} /></div>
    <ResourceUsageSession resourceId={id} resource={resource} />
    <Link className="mt-3 inline-block underline" to={`/resources/${id}`}>{openLabel}</Link>
  </SortableResourceCard>;
}

function SortableResourceCard({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({ id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={className}>{children}</div>;
}

export { Landing as DashboardLanding, DashboardPage };
