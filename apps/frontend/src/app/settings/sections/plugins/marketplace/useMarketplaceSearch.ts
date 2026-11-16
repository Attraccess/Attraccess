import type { MarketplacePluginDto, MarketplaceSearchResponseDto } from '@attraccess/react-query-client';
import {
  usePluginsServicePluginControllerMarketplacePackage,
  usePluginsServicePluginControllerSearchMarketplace,
} from '@attraccess/react-query-client';
import { keepPreviousData } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Params {
  isOpen: boolean;
  query: string;
  registryId: string;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Searches the marketplace (debounced) in the selected registry. With a selected registry the typed package name is
 * also looked up directly and merged into the results, de-duplicated by registry and name.
 */
export function useMarketplaceSearch({ isOpen, query, registryId }: Params) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const [settled, setSettled] = useState({ query, registryId });

  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(() => setSettled({ query, registryId }), query.trim() ? SEARCH_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timeout);
  }, [isOpen, query, registryId]);

  const exactName = settled.query.trim();
  const search = usePluginsServicePluginControllerSearchMarketplace<MarketplaceSearchResponseDto>(
    { query: settled.query, registryId: settled.registryId || undefined },
    undefined,
    { enabled: isOpen, retry: false, refetchOnWindowFocus: false, placeholderData: keepPreviousData },
  );
  // Registry search results remain useful when an exact package lookup is unavailable.
  const direct = usePluginsServicePluginControllerMarketplacePackage(
    { packageName: exactName, registryId: settled.registryId || undefined },
    undefined,
    { enabled: isOpen && Boolean(settled.registryId && exactName), retry: false, refetchOnWindowFocus: false },
  );

  const plugins = useMemo(() => {
    const found = search.isError ? [] : (search.data?.results ?? []);
    const unique = new Map<string, MarketplacePluginDto>(
      [...found, ...(direct.data ? [direct.data] : [])].map((plugin) => [
        `${plugin.registry.id}:${plugin.name}`,
        plugin,
      ]),
    );
    return [...unique.values()];
  }, [search.isError, search.data, direct.data]);

  const reportOutcome = useEffectEvent(() => {
    const errors = search.isError ? [] : (search.data?.errors ?? []);
    if (search.isError && !direct.data) toast.error({ title: t('marketplace.loadError') });
    else if (errors.length > 0) toast.error({ title: t('marketplace.loadError'), description: errors.join(', ') });
  });

  const isSettled = !search.isFetching && !direct.isFetching && (search.isSuccess || search.isError);
  const outcome = isSettled
    ? [search.dataUpdatedAt, search.errorUpdatedAt, direct.dataUpdatedAt, direct.errorUpdatedAt].join(':')
    : null;
  useEffect(() => {
    if (outcome) reportOutcome();
  }, [outcome]);

  return { plugins, isLoading: search.isFetching || direct.isFetching };
}
