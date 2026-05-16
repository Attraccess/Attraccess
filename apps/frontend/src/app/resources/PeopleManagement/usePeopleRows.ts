import { useMemo } from 'react';
import {
  useAccessControlServiceResourceIntroducersGetMany,
  useAccessControlServiceResourceIntroductionsGetMany,
} from '@attraccess/react-query-client';
import { useHasValidIntroduction } from '../../../hooks/useHasValidIntroduction';
import { PersonRow } from './types';

interface Params {
  resourceId: number;
}

interface UsePeopleRowsResult {
  rows: PersonRow[];
  isLoading: boolean;
  hasError: boolean;
}

export function usePeopleRows({ resourceId }: Params): UsePeopleRowsResult {
  const {
    data: introducers,
    error: introducersError,
    isLoading: isIntroducersLoading,
  } = useAccessControlServiceResourceIntroducersGetMany({ resourceId });

  const {
    data: introductions,
    error: introductionsError,
    isLoading: isIntroductionsLoading,
  } = useAccessControlServiceResourceIntroductionsGetMany({ resourceId });

  const userHasValidIntroduction = useHasValidIntroduction({ introductions: introductions ?? [] });

  const rows = useMemo<PersonRow[]>(() => {
    const byUserId = new Map<number, PersonRow>();

    (introducers ?? []).forEach((introducer) => {
      if (!introducer.user) return;
      byUserId.set(introducer.user.id, {
        user: introducer.user,
        isIntroducer: true,
        introducer,
        introduction: null,
        hasValidIntroduction: false,
        introductionLastEventAt: null,
        activityAt: introducer.grantedAt,
      });
    });

    (introductions ?? []).forEach((introduction) => {
      const user = introduction.receiverUser;
      if (!user) return;
      let latestHistoryAt: string | null = null;
      let latestHistoryTime = -Infinity;
      for (const event of introduction.history ?? []) {
        const time = new Date(event.createdAt).getTime();
        if (time > latestHistoryTime) {
          latestHistoryTime = time;
          latestHistoryAt = event.createdAt;
        }
      }
      const lastEventAt = latestHistoryAt ?? introduction.createdAt;
      const isValid = userHasValidIntroduction(user);
      const existing = byUserId.get(user.id);
      if (existing) {
        existing.introduction = introduction;
        existing.hasValidIntroduction = isValid;
        existing.introductionLastEventAt = lastEventAt;
        if (new Date(lastEventAt).getTime() > new Date(existing.activityAt).getTime()) {
          existing.activityAt = lastEventAt;
        }
      } else {
        byUserId.set(user.id, {
          user,
          isIntroducer: false,
          introducer: null,
          introduction,
          hasValidIntroduction: isValid,
          introductionLastEventAt: lastEventAt,
          activityAt: lastEventAt,
        });
      }
    });

    return Array.from(byUserId.values()).sort(
      (a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime(),
    );
  }, [introducers, introductions, userHasValidIntroduction]);

  return {
    rows,
    isLoading: isIntroducersLoading || isIntroductionsLoading,
    hasError: Boolean(introducersError || introductionsError),
  };
}
