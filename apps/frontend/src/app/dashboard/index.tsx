import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card } from '@heroui/react';
import { LayoutDashboardIcon, GripVerticalIcon } from 'lucide-react';
import { useDashboardPins, type Pin } from './pins';
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

function Landing() {
  const { data, isLoading, isError } = useDashboardPins();
  if (isLoading) return null;
  if (isError) return <p className="p-6">Could not load your dashboard.</p>;
  return data?.length ? <DashboardPage /> : <Navigate to="/resources" replace />;
}

type NavEntry = { path: string; title: string; icon?: React.ComponentType<{ size?: number }>; badgeCount?: number };
function DashboardPage() {
  const { t } = useTranslations({ en, de });
  const routes = useAllRoutes();
  const { plugins } = usePluginState();
  const sidebarItems = useSidebarItems();
  const { hasPermission } = useAuth();
  const { data: pins = [], save } = useDashboardPins();
  const [dragging, setDragging] = useState<string | null>(null);
  const entries = useMemo(() => {
    const builtInPaths = new Set(SIDEBAR_ITEMS.flatMap((item) => 'items' in item ? item.items : [item]).map((item) => item.path));
    const all = [...sidebarItems.flatMap((i) => 'items' in i ? i.items : [i]), ...buildSidebarEndItems('', '').flatMap((i) => 'items' in i ? i.items : [i])].map((item) => ({ path: item.path, translationKey: item.translationKey, icon: item.icon, title: undefined as string | undefined, badgeCount: item.badgeCount }));
    all.push(...plugins.flatMap((manifest) => {
      try { return manifest.plugin.getSidebarItems?.() ?? []; } catch { return []; }
    }).map((item) => ({ path: item.path, translationKey: undefined, icon: undefined, title: item.label, badgeCount: undefined })));
    return pins.flatMap((pin): (NavEntry & { pin: Pin })[] => {
      if (pin.itemType !== 'page') return [];
      const item = all.find((entry) => entry.path === pin.itemId);
      if (!item && builtInPaths.has(pin.itemId)) return [];
      const pluginLabel = routes.find((route) => route.path === pin.itemId)?.path;
      const route = routes.find((candidate) => candidate.path === pin.itemId);
      if (!route || (route.authRequired && route.authRequired !== true && !hasRequiredPermissions(route.authRequired, hasPermission))) return [];
      if (pin.itemId.startsWith('/kiosk') || pin.itemId === '/dashboard' || /^https?:/.test(pin.itemId)) return [];
      return [{ path: pin.itemId, title: item?.title ?? (item?.translationKey ? t(item.translationKey) : (pluginLabel ?? pin.itemId)), icon: item?.icon, badgeCount: item?.badgeCount, pin }];
    });
  }, [pins, routes, hasPermission, t, plugins, sidebarItems]);

  const reorder = (from: string, to: string) => {
    const source = pins.findIndex((pin) => `${pin.itemType}:${pin.itemId}` === from);
    const target = pins.findIndex((pin) => `${pin.itemType}:${pin.itemId}` === to);
    if (source < 0 || target < 0 || source === target) return;
    const ordered = [...pins]; const [entry] = ordered.splice(source, 1); ordered.splice(target, 0, entry);
    save.mutate(ordered);
  };

  return <section className="p-6">
    <header className="mb-6 flex items-center gap-3"><LayoutDashboardIcon /><div><h1 className="text-2xl font-semibold">{t('title')}</h1><p className="text-sm text-muted">{t('subtitle')}</p></div></header>
    {!pins.length ? <Card className="p-6"><h2 className="text-lg font-semibold">{t('emptyTitle')}</h2><p className="mt-2">{t('emptyDescription')}</p><Link className="mt-3 underline" to="/resources">{t('resources')}</Link></Card> : null}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {pins.map((pin) => pin.itemType === 'page' ? (() => {
        const entry = entries.find((item) => item.pin.itemId === pin.itemId);
        if (!entry) return null;
        return <Card key={entry.pin.itemId} onDragOver={(event) => event.preventDefault()} onDrop={() => dragging && reorder(dragging, `${entry.pin.itemType}:${entry.pin.itemId}`)} className="flex flex-row items-center gap-3 p-4">
        <span draggable title="Drag to reorder" onDragStart={() => setDragging(`${entry.pin.itemType}:${entry.pin.itemId}`)} className="cursor-grab text-muted"><GripVerticalIcon size={18} /></span>
        {entry.icon && <entry.icon size={22} />}
        <Link className="min-w-0 flex-1 font-medium hover:underline" to={entry.path}>{entry.title}</Link>
        {!!entry.badgeCount && <span className="rounded-full bg-default-100 px-2 py-1 text-xs">{entry.badgeCount}</span>}
        <button aria-label={`${t('unpin')} ${entry.title}`} onClick={() => save.mutate(pins.filter((pin) => !(pin.itemType === 'page' && pin.itemId === entry.path)))}>★</button>
      </Card>;
      })() : <ResourcePinCard key={`resource:${pin.itemId}`} pin={pin} openLabel={t('open')} resourceLabel={t('resource')} unpinLabel={t('unpin')} onUnpin={() => save.mutate(pins.filter((item) => item !== pin))} onReorder={(target) => reorder(dragging ?? '', target)} onDragStart={() => setDragging(`resource:${pin.itemId}`)} />)}
    </div>
  </section>;
}

function ResourcePinCard({ pin, openLabel, resourceLabel, unpinLabel, onUnpin, onReorder, onDragStart }: { pin: Pin; openLabel: string; resourceLabel: string; unpinLabel: string; onUnpin: () => void; onReorder: (target: string) => void; onDragStart: () => void }) {
  const id = Number(pin.itemId);
  const { data: resource, isLoading, isError } = useResourcesServiceGetOneResourceById({ id }, undefined, { enabled: Number.isSafeInteger(id) && id > 0, retry: false });
  if (isLoading) return <Card className="p-4">Loading {resourceLabel.toLowerCase()}…</Card>;
  if (isError || !resource) return null;
  return <div onDragOver={(event) => event.preventDefault()} onDrop={() => onReorder(`resource:${pin.itemId}`)} className="flex flex-col gap-3 rounded-xl border border-default-200 bg-content1 p-4">
    <Card className="flex flex-row items-center justify-between p-3"><span draggable title="Drag to reorder" onDragStart={onDragStart} className="cursor-grab text-muted"><GripVerticalIcon size={18} /></span><h2 className="font-semibold">{resource.name}</h2><button aria-label={`${unpinLabel} ${resource.name}`} onClick={onUnpin}>★</button></Card>
    <div className="flex justify-end"><StatusChip resourceId={id} /></div>
    <ResourceUsageSession resourceId={id} resource={resource} />
    <Link className="mt-3 inline-block underline" to={`/resources/${id}`}>{openLabel}</Link>
  </div>;
}

export { Landing as DashboardLanding, DashboardPage };
