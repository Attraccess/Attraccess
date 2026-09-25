import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DashboardService } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export type Pin = { itemType: 'page' | 'resource'; itemId: string; resourceName?: string };
const key = ['dashboard', 'pins'];
const changedEvent = 'attraccess:dashboard-pins-changed';
const getPins = async (): Promise<Pin[]> => (await DashboardService.dashboardGetPins()) as unknown as Pin[];
export type PinOperation = { kind: 'add' | 'remove' | 'move'; item: Pin; before?: Pin };
const savePins = async ({ kind, item, before }: PinOperation): Promise<Pin[]> =>
  (await DashboardService.dashboardUpdatePins({ requestBody: {
    kind, item: { itemType: item.itemType, itemId: item.itemId },
    ...(before ? { before: { itemType: before.itemType, itemId: before.itemId } } : {}),
  } })) as unknown as Pin[];
let writeQueue = Promise.resolve<unknown>(undefined);
export async function updateDashboardPins(operation: PinOperation) {
  const write = writeQueue.then(async () => savePins(operation));
  writeQueue = write.catch(() => undefined);
  const items = await write;
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: items }));
  return items;
}
export function useDashboardPins() {
  const client = useQueryClient();
  useEffect(() => {
    const sync = (event: Event) => {
      client.setQueryData(key, (event as CustomEvent<Pin[]>).detail);
      void client.invalidateQueries({ queryKey: key });
    };
    window.addEventListener(changedEvent, sync);
    return () => window.removeEventListener(changedEvent, sync);
  }, [client]);
  const query = useQuery({ queryKey: key, queryFn: getPins });
  return query;
}
export function DashboardPinToggle({ itemType, itemId, label }: Pin & { label: string }) {
  const { t } = useTranslations({ en, de });
  const [data, setData] = useState<Pin[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const load = () => {
    setIsLoading(true);
    setLoadFailed(false);
    getPins().then((items) => setData(items)).catch(() => setLoadFailed(true)).finally(() => setIsLoading(false));
  };
  useEffect(() => {
    let active = true;
    getPins().then((items) => { if (active) setData(items); }).catch(() => { if (active) setLoadFailed(true); }).finally(() => { if (active) setIsLoading(false); });
    const sync = (event: Event) => { setData((event as CustomEvent<Pin[]>).detail); setLoadFailed(false); };
    window.addEventListener(changedEvent, sync);
    return () => { active = false; window.removeEventListener(changedEvent, sync); };
  }, []);
  const pinned = data?.some((pin) => pin.itemType === itemType && pin.itemId === itemId) ?? false;
  if (!data && loadFailed) return <button type="button" onClick={load} className="text-sm underline">{t('retry')}</button>;
  return <button type="button" aria-pressed={pinned} aria-label={`${pinned ? t('unpin') : t('pin')} ${label}`} disabled={isLoading || isSaving || !data}
    onClick={async () => {
      if (!data) return;
      setIsSaving(true);
      try {
        const items = await updateDashboardPins({ kind: pinned ? 'remove' : 'add', item: { itemType, itemId } });
        setData(items);
        window.dispatchEvent(new CustomEvent(changedEvent, { detail: items }));
      } finally { setIsSaving(false); }
    }}
    className="inline-flex items-center rounded-md px-2 py-1 text-sm text-muted hover:bg-default-100">{pinned ? '★' : '☆'}</button>;
}
