import { useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card } from '@heroui/react';
import { LayoutDashboardIcon, GripVerticalIcon } from 'lucide-react';
import { useDashboardPins, type Pin } from './pins';
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

function Landing() {
  const { data, isLoading, isError } = useDashboardPins();
  const { isLoading: isLicenseLoading } = useLicenseServiceGetLicenseInformation();
  const entries = usePageEntries(data ?? []);
  if (isLoading || isLicenseLoading) return null;
  if (isError) return <p className="p-6">Could not load your dashboard.</p>;
  return data?.some((pin) => pin.itemType === 'resource' || entries.some((entry) => entry.pin.itemId === pin.itemId))
    ? <DashboardPage /> : <Navigate to="/resources" replace />;
}

type NavEntry = { path: string; title: string; icon?: React.ComponentType<{ size?: number }>; badgeCount?: number };
type PageEntry = NavEntry & { pin: Pin };

function usePageEntries(pins: Pin[]): PageEntry[] {
  const { t: sidebarT } = useTranslations({ en: sidebarEn, de: sidebarDe });
  const routes = useAllRoutes();
  const { plugins } = usePluginState();
  const sidebarItems = useSidebarItems();
  const { hasPermission } = useAuth();
  return useMemo(() => {
    const builtInPaths = new Set(SIDEBAR_ITEMS.flatMap((item) => 'items' in item ? item.items : [item]).map((item) => item.path));
    const flatten = (items: (SidebarItem | SidebarItemGroup)[], prefix: string) => items.flatMap((item) => {
      if ('items' in item) return item.items.map((child) => ({ ...child, title: sidebarT(`${prefix === 'groups' ? 'groups' : 'endItems.groups'}.${item.translationKey}.items.${child.translationKey}`) }));
      return [{ ...item, title: sidebarT(prefix === 'groups' ? `groups.##default##.items.${item.translationKey}` : `endItems.${item.translationKey}`) }];
    });
    const all = [...flatten(sidebarItems, 'groups'), ...flatten(buildSidebarEndItems('', ''), 'endItems')];
    all.push(...plugins.flatMap((manifest) => {
      try { return manifest.plugin.getSidebarItems?.() ?? []; } catch { return []; }
    }).map((item) => ({ path: item.path, icon: undefined, title: item.label })));
    return pins.flatMap((pin): PageEntry[] => {
      if (pin.itemType !== 'page') return [];
      const item = all.find((entry) => entry.path === pin.itemId);
      if (!item || (builtInPaths.has(pin.itemId) && !sidebarItems.some((group) => ('items' in group ? group.items : [group]).some((entry) => entry.path === pin.itemId)))) return [];
      const route = routes.find((candidate) => candidate.path === pin.itemId);
      if (!route || (route.authRequired && route.authRequired !== true && !hasRequiredPermissions(route.authRequired, hasPermission))) return [];
      if (item.isExternal || pin.itemId.startsWith('/kiosk') || pin.itemId === '/dashboard' || /^https?:/.test(pin.itemId)) return [];
      return [{ path: pin.itemId, title: item.title, icon: item.icon, badgeCount: 'badgeCount' in item ? item.badgeCount : undefined, pin }];
    });
  }, [pins, routes, hasPermission, sidebarT, plugins, sidebarItems]);
}

function DashboardPage() {
  const { t } = useTranslations({ en, de });
  const { data: pins = [], save } = useDashboardPins();
  const entries = usePageEntries(pins);
  const [dragging, setDragging] = useState<string | null>(null);
  const saving = useRef(false);
  const persist = (items: Pin[]) => {
    if (saving.current || save.isPending) return;
    saving.current = true;
    save.mutate(items, { onSettled: () => { saving.current = false; } });
  };
  const remove = (pin: Pin) => persist(pins.filter((item) => item.itemType !== pin.itemType || item.itemId !== pin.itemId));
  const unavailable = pins.filter((pin) => pin.itemType === 'page' && !entries.some((entry) => entry.pin.itemId === pin.itemId));

  const reorder = (from: string, to: string) => {
    const source = pins.findIndex((pin) => `${pin.itemType}:${pin.itemId}` === from);
    const target = pins.findIndex((pin) => `${pin.itemType}:${pin.itemId}` === to);
    if (saving.current || save.isPending || source < 0 || target < 0 || source === target) return;
    const ordered = [...pins]; const [entry] = ordered.splice(source, 1); ordered.splice(target, 0, entry);
    persist(ordered);
  };

  return <section className="p-6">
    <header className="mb-6 flex items-center gap-3"><LayoutDashboardIcon /><div><h1 className="text-2xl font-semibold">{t('title')}</h1><p className="text-sm text-muted">{t('subtitle')}</p></div></header>
    {!pins.length || (unavailable.length === pins.length) ? <Card className="p-6"><h2 className="text-lg font-semibold">{t('emptyTitle')}</h2><p className="mt-2">{t('emptyDescription')}</p><Link className="mt-3 underline" to="/resources">{t('resources')}</Link></Card> : null}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {pins.map((pin) => pin.itemType === 'page' ? (() => {
        const entry = entries.find((item) => item.pin.itemId === pin.itemId);
        if (!entry) return null;
        return <Card key={entry.pin.itemId} onDragOver={(event) => event.preventDefault()} onDrop={() => dragging && reorder(dragging, `${entry.pin.itemType}:${entry.pin.itemId}`)} className="flex flex-row items-center gap-3 p-4">
        <span draggable={!save.isPending} title="Drag to reorder" onDragStart={() => setDragging(`${entry.pin.itemType}:${entry.pin.itemId}`)} className="cursor-grab text-muted"><GripVerticalIcon size={18} /></span>
        {entry.icon && <entry.icon size={22} />}
        <Link className="min-w-0 flex-1 font-medium hover:underline" to={entry.path}>{entry.title}</Link>
        {!!entry.badgeCount && <span className="rounded-full bg-default-100 px-2 py-1 text-xs">{entry.badgeCount}</span>}
        <button disabled={save.isPending} aria-label={`${t('unpin')} ${entry.title}`} onClick={() => remove(pin)}>★</button>
      </Card>;
      })() : <ResourcePinCard key={`resource:${pin.itemId}`} pin={pin} openLabel={t('open')} resourceLabel={t('resource')} unpinLabel={t('unpin')} disabled={save.isPending} onUnpin={() => remove(pin)} onReorder={(target) => reorder(dragging ?? '', target)} onDragStart={() => setDragging(`resource:${pin.itemId}`)} />)}
    </div>
    {!!unavailable.length && <div className="mt-6"><h2 className="mb-3 font-semibold">{t('unavailable')}</h2>{unavailable.map((pin) => <Card key={pin.itemId} className="mb-2 flex flex-row items-center justify-between p-4"><span>{pin.itemId}</span><button disabled={save.isPending} aria-label={`${t('unpin')} ${pin.itemId}`} onClick={() => remove(pin)}>★</button></Card>)}</div>}
  </section>;
}

function ResourcePinCard({ pin, openLabel, resourceLabel, unpinLabel, disabled, onUnpin, onReorder, onDragStart }: { pin: Pin; openLabel: string; resourceLabel: string; unpinLabel: string; disabled: boolean; onUnpin: () => void; onReorder: (target: string) => void; onDragStart: () => void }) {
  const id = Number(pin.itemId);
  const name = pin.resourceName ?? resourceLabel;
  return <div onDragOver={(event) => event.preventDefault()} onDrop={() => onReorder(`resource:${pin.itemId}`)} className="flex flex-col gap-3 rounded-xl border border-default-200 bg-content1 p-4">
    <Card className="flex flex-row items-center justify-between p-3"><span draggable={!disabled} title="Drag to reorder" onDragStart={onDragStart} className="cursor-grab text-muted"><GripVerticalIcon size={18} /></span><h2 className="font-semibold">{name}</h2><button disabled={disabled} aria-label={`${unpinLabel} ${name}`} onClick={onUnpin}>★</button></Card>
    <Link className="mt-3 inline-block underline" to={`/resources/${id}`}>{openLabel}</Link>
  </div>;
}

export { Landing as DashboardLanding, DashboardPage };
