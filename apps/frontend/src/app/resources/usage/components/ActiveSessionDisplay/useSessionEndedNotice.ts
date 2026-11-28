import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { GetActiveUsageSessionDto, UseResourceUsageGetActiveSessionKeyFn } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../../components/toastProvider';
import en from './switchProject/en.json';
import de from './switchProject/de.json';

/**
 * The switch dialog disappears with its session. If it goes because its owner no longer has a running session on the
 * machine (rather than because they left the page or the session continues as a new record), this says so.
 */
export function useSessionEndedNotice(resourceId: number, userId: number | null | undefined) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const report = useRef(() => undefined as void);
  report.current = () => {
    const active = queryClient.getQueryData<GetActiveUsageSessionDto>(
      UseResourceUsageGetActiveSessionKeyFn({ path: { resourceId } }),
    );
    if (!active) return;
    const running = [active.usage, ...(active.usages ?? [])].some((session) => session && session.userId === userId);
    if (!running) toast.warning({ title: t('ended.title'), description: t('ended.description') });
  };

  useEffect(() => () => report.current(), []);
}
