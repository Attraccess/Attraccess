import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card } from '@heroui/react';
import { LayoutDashboardIcon, GripVerticalIcon } from 'lucide-react';
import { useDashboardPins, updateDashboardPins, type Pin } from './pins';
import { useAllRoutes } from '../routes';
import { useAuth } from '../../hooks/useAuth';
import { hasRequiredPermissions } from '../routes/routeAccess';
import { SIDEBAR_ITEMS, useSidebarItems, buildSidebarEndItems, type SidebarItem, type SidebarItemGroup } from '../layout/sidebarItems';
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

function Landing() {
  const { data, isLoading, isError, refetch } = useDashboardPins();
  useLicenseServiceGetLicenseInformation();
  if (isLoading) return null;
  if (isError) return <div className="p-6"><p>Could not load your dashboard.</p><button onClick={() => void refetch()}>Retry loading pins</button></div>;
  if (!data?.length) return <Navigate to="/resources" replace />;
  if (data.some((pin) => pin.itemType === 'resource')) return <DashboardPage />;
  return <DashboardPage />;
}

type PageEntry = { pin: Pin; path: string; title: string; icon?: React.ReactNode; badgeCount?: number };
function usePageEntries(pins: Pin[]): PageEntry[] {
  const { t: sidebarT } = useTranslations({ en: sidebarEn, de: sidebarDe });
  const routes = useAllRoutes();
  const { plugins } = usePluginState();
  const sidebarItems = useSidebarItems();
  const { hasPermission } = useAuth();
  return useMemo(() => {
    const builtInPaths = new Set(SIDEBAR_ITEMS.flatMap((item) => 'items' in item ? item.items : [item]).map((item) => item.path));
    const flatten = (items: (SidebarItem | SidebarItemGroup)[], prefix: string): { path: string; title: string; icon?: React.ReactNode; badgeCount?: number; isExternal?: boolean }[] => items.flatMap((item) => {
      if ('items' in item) return item.items.map((child) => ({ path: child.path, title: sidebarT(`${prefix}groups.${item.translationKey}.items.${child.translationKey}`), icon: <child.icon size={22} />, badgeCount: child.badgeCount, isExternal: child.isExternal }));
      return [{ path: item.path, title: sidebarT(prefix === 'endItems.' ? `endItems.${item.translationKey}` : `groups.##default##.items.${item.translationKey}`), icon: <item.icon size={22} />, badgeCount: item.badgeCount, isExternal: item.isExternal }];
    });
    const all = [...flatten(sidebarItems, ''), ...flatten(buildSidebarEndItems('', ''), 'endItems.')];
    all.push(...plugins.flatMap((manifest) => {
      try { return manifest.plugin.getSidebarItems?.() ?? []; } catch { return []; }
    }).map((item) => ({ path: item.path, title: item.label, icon: undefined })));
    return pins.flatMap((pin): PageEntry[] => {
      if (pin.itemType !== 'page') return [];
      const item = all.find((entry) => entry.path === pin.itemId);
      if (!item || (builtInPaths.has(pin.itemId) && !sidebarItems.some((group) => ('items' in group ? group.items : [group]).some((entry) => entry.path === pin.itemId)))) return [];
      const route = routes.find((candidate) => candidate.path === pin.itemId);
      if (!route || (route.authRequired && route.authRequired !== true && !hasRequiredPermissions(route.authRequired, hasPermission))) return [];
      if (pin.itemId.startsWith('/kiosk') || pin.itemId === '/dashboard' || /^https?:/.test(pin.itemId)) return [];
      if ('isExternal' in item && item.isExternal) return [];
      return [{ path: pin.itemId, title: item.title, icon: item.icon, badgeCount: 'badgeCount' in item ? item.badgeCount : undefined, pin }];
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
    const ordered = [...pins];
    const [item] = ordered.splice(source, 1);
    ordered.splice(target, 0, item);
    void updateDashboardPins({ kind: 'move', item, before: ordered[target + 1] });
  };
  const removePin = (pin: Pin) => void updateDashboardPins({ kind: 'remove', item: pin });

  return <section className="p-6">
    <header className="mb-6 flex items-center gap-3"><LayoutDashboardIcon /><div><h1 className="text-2xl font-semibold">{t('title')}</h1><p className="text-sm text-muted">{t('subtitle')}</p></div></header>
    {isError ? <Card className="p-6"><p>Could not load your dashboard.</p><button onClick={() => void refetch()}>{t('retry')}</button></Card> : null}
    {!isLoading && !isError && entries.length === 0 && !pins.some((pin) => pin.itemType === 'resource') ? <Card className="p-6"><h2 className="text-lg font-semibold">{t('emptyTitle')}</h2><p className="mt-2">{t('emptyDescription')}</p><Link className="mt-3 underline" to="/resources">{t('resources')}</Link></Card> : null}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over) reorder(String(active.id), String(over.id)); }}>
    <SortableContext items={pins.map((pin) => `${pin.itemType}:${pin.itemId}`)} strategy={rectSortingStrategy}>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {!isError && pins.map((pin) => pin.itemType === 'page' ? (() => {
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
  const name = pin.resourceName ?? resourceLabel;
  return <SortableResourceCard id={`resource:${pin.itemId}`} className="flex flex-col gap-3 rounded-xl border border-default-200 bg-content1 p-4">
    <div className="flex flex-row items-center justify-between p-3"><GripVerticalIcon size={18} className="touch-none cursor-grab text-muted" /><h2 className="font-semibold">{name}</h2><button aria-label={`${unpinLabel} ${name}`} onClick={onUnpin}>★</button></div>
    <Link className="mt-3 inline-block underline" to={`/resources/${id}`}>{openLabel}</Link>
  </SortableResourceCard>;
}

function SortableResourceCard({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({ id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={className}>{children}</div>;
}

export { Landing as DashboardLanding, DashboardPage };
