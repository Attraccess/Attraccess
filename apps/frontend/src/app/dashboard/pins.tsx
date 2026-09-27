import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { DashboardService } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export type Pin = { itemType: 'page' | 'resource'; itemId: string; resourceName?: string };
const key = (userId?: number) => ['dashboard', 'pins', userId ?? 'anonymous'];
const changedEvent = 'attraccess:dashboard-pins-changed';
const currentUserKey = ['UsersServiceGetCurrent'] as const;
function useCurrentUserId() {
  let client: ReturnType<typeof useQueryClient> | undefined;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- invoke every render; isolated PageHeader tests may omit its provider.
  try { client = useQueryClient(); } catch { /* PageHeader may render outside the query provider in isolated views. */ }
  const getId = useCallback(() => typeof client?.getQueryData === 'function'
    ? client.getQueryData<{ id: number }>(currentUserKey)?.id
    : undefined, [client]);
  const [userId, setUserId] = useState(getId);
  useEffect(() => typeof client?.getQueryCache === 'function'
    ? client.getQueryCache().subscribe(() => setUserId(getId()))
    : undefined, [client, getId]);
  return userId;
}
const getPins = async (): Promise<Pin[]> => (await DashboardService.dashboardGetPins()) as unknown as Pin[];
export type PinOperation = { kind: 'add' | 'remove' | 'move'; item: Pin; before?: Pin };
const savePins = async ({ kind, item, before }: PinOperation): Promise<Pin[]> =>
  (await DashboardService.dashboardUpdatePins({ requestBody: {
    kind, item: { itemType: item.itemType, itemId: item.itemId },
    ...(before ? { before: { itemType: before.itemType, itemId: before.itemId } } : {}),
  } })) as unknown as Pin[];
let writeQueue = Promise.resolve<unknown>(undefined);
export async function updateDashboardPins(operation: PinOperation, userId: number) {
  const write = writeQueue.then(async () => savePins(operation));
  writeQueue = write.catch(() => undefined);
  const items = await write;
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: { userId, items } }));
  return items;
}
export function useDashboardPins() {
  const client = useQueryClient();
  const userId = useCurrentUserId();
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: number; items: Pin[] }>).detail;
      if (detail.userId !== userId) return;
      client.setQueryData(key(userId), detail.items);
      void client.invalidateQueries({ queryKey: key(userId) });
    };
    window.addEventListener(changedEvent, sync);
    return () => window.removeEventListener(changedEvent, sync);
  }, [client, userId]);
  const query = useQuery({ queryKey: key(userId), queryFn: getPins, enabled: !!userId });
  return query;
}
export function DashboardPinToggle({ itemType, itemId, label }: Pin & { label: string }) {
  const { t } = useTranslations({ en, de });
  const userId = useCurrentUserId();
  const [data, setData] = useState<Pin[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const load = () => {
    setIsLoading(true);
    setLoadFailed(false);
    getPins().then((items) => setData(items)).catch(() => setLoadFailed(true)).finally(() => setIsLoading(false));
  };
  useEffect(() => {
    let active = true;
    setData(null);
    setIsLoading(true);
    getPins().then((items) => { if (active) setData(items); }).catch(() => { if (active) setLoadFailed(true); }).finally(() => { if (active) setIsLoading(false); });
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: number; items: Pin[] }>).detail;
      if (detail.userId !== userId) return;
      setData(detail.items); setLoadFailed(false);
    };
    window.addEventListener(changedEvent, sync);
    return () => { active = false; window.removeEventListener(changedEvent, sync); };
  }, [userId]);
  const pinned = data?.some((pin) => pin.itemType === itemType && pin.itemId === itemId) ?? false;
  if (!data && loadFailed) return <button type="button" onClick={load} className="text-sm underline">{t('retry')}</button>;
  const button = <button type="button" aria-pressed={pinned} aria-label={`${pinned ? t('unpin') : t('pin')} ${label}`} disabled={isLoading || isSaving || !data || !userId}
    onClick={async () => {
      if (!data || !userId) return;
      setIsSaving(true);
      try {
        const items = await updateDashboardPins({ kind: pinned ? 'remove' : 'add', item: { itemType, itemId } }, userId);
        setData(items);
        setSaveFailed(false);
      } catch { setSaveFailed(true); }
      finally { setIsSaving(false); }
    }}
    className="inline-flex items-center rounded-md px-2 py-1 text-sm text-muted hover:bg-default-100">{pinned ? '★' : '☆'}</button>;
  return <div className="inline-flex items-center">{saveFailed && <span role="alert" className="mr-2 text-danger">{t('saveFailed')}</span>}{button}</div>;
}
