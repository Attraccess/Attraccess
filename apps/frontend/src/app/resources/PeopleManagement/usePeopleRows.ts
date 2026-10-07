import { useMemo } from 'react';
import {
  useAccessControlServiceResourceGroupIntroducersGetMany,
  useAccessControlServiceResourceGroupIntroductionsGetMany,
  useAccessControlServiceResourceIntroducersGetMany,
  useAccessControlServiceResourceIntroductionsGetPeople,
} from '@attraccess/react-query-client';
import { ResourceIntroducerType } from '@attraccess/react-query-client';
import { PeopleTarget, PersonRow } from './types';

interface Params {
  target: PeopleTarget;
}

interface UsePeopleRowsResult {
  rows: PersonRow[];
  isLoading: boolean;
  hasError: boolean;
}

export function usePeopleRows({ target }: Params): UsePeopleRowsResult {
  const isResource = target.type === 'resource';
  const isGroup = target.type === 'group';

  const {
    data: resourceIntroducers,
    error: resourceIntroducersError,
    isLoading: isResourceIntroducersLoading,
  } = useAccessControlServiceResourceIntroducersGetMany({ resourceId: target.id }, undefined, { enabled: isResource });

  const {
    data: resourceIntroductions,
    error: resourceIntroductionsError,
    isLoading: isResourceIntroductionsLoading,
  } = useAccessControlServiceResourceIntroductionsGetPeople({ resourceId: target.id }, undefined, {
    enabled: isResource,
  });

  const {
    data: groupIntroducers,
    error: groupIntroducersError,
    isLoading: isGroupIntroducersLoading,
  } = useAccessControlServiceResourceGroupIntroducersGetMany({ groupId: target.id }, undefined, { enabled: isGroup });

  const {
    data: groupIntroductions,
    error: groupIntroductionsError,
    isLoading: isGroupIntroductionsLoading,
  } = useAccessControlServiceResourceGroupIntroductionsGetMany({ groupId: target.id }, undefined, { enabled: isGroup });

  const introducers = isResource ? resourceIntroducers : groupIntroducers;
  const introductions = isResource ? resourceIntroductions : groupIntroductions;
  const introducersError = isResource ? resourceIntroducersError : groupIntroducersError;
  const introductionsError = isResource ? resourceIntroductionsError : groupIntroductionsError;
  const isIntroducersLoading = isResource ? isResourceIntroducersLoading : isGroupIntroducersLoading;
  const isIntroductionsLoading = isResource ? isResourceIntroductionsLoading : isGroupIntroductionsLoading;

  const rows = useMemo<PersonRow[]>(() => {
    const byUserId = new Map<number, PersonRow>();

    (introducers ?? []).forEach((introducer) => {
      if (!introducer.user) return;
      const existing = byUserId.get(introducer.user.id);
      if (existing) {
        existing.introducers.push(introducer);
        existing.isIntroducer ||= introducer.type === ResourceIntroducerType.INTRODUCER;
        existing.isMaintainer ||= introducer.type === ResourceIntroducerType.MAINTAINER;
        if (new Date(introducer.grantedAt).getTime() > new Date(existing.activityAt).getTime()) {
          existing.activityAt = introducer.grantedAt;
        }
        return;
      }
      byUserId.set(introducer.user.id, {
        user: introducer.user,
        isIntroducer: introducer.type === ResourceIntroducerType.INTRODUCER,
        isMaintainer: introducer.type === ResourceIntroducerType.MAINTAINER,
        introducers: [introducer],
        introduction: null,
        hasValidIntroduction: false,
        hasValidDirectIntroduction: false,
        inheritedIntroductions: [],
        introductionLastEventAt: null,
        activityAt: introducer.grantedAt,
      });
    });

    (introductions ?? []).forEach((introduction) => {
      const user = introduction.receiverUser;
      if (!user) return;
      let latestHistoryAt: string | null = null;
      let latestHistoryTime = -Infinity;
      let latestHistoryId = -Infinity;
      let latestAction: string | undefined;
      for (const event of introduction.history ?? []) {
        const time = new Date(event.createdAt).getTime();
        if (time > latestHistoryTime || (time === latestHistoryTime && event.id > latestHistoryId)) {
          latestHistoryId = event.id;
          latestHistoryTime = time;
          latestHistoryAt = event.createdAt;
          latestAction = event.action;
        }
      }
      const lastEventAt = latestHistoryAt ?? introduction.createdAt;
      const isValid = latestAction === 'grant';
      const isInherited = isResource && introduction.resourceGroupId != null;
      // Revoked group records are not a resource-level relationship.
      if (isInherited && !isValid) return;
      const existing = byUserId.get(user.id);
      if (existing) {
        if (isInherited) {
          existing.inheritedIntroductions.push(introduction);
        } else {
          existing.introduction = introduction;
          existing.hasValidDirectIntroduction = isValid;
          existing.introductionLastEventAt = lastEventAt;
        }
        existing.hasValidIntroduction ||= isValid;
        if (new Date(lastEventAt).getTime() > new Date(existing.activityAt).getTime()) {
          existing.activityAt = lastEventAt;
        }
      } else {
        byUserId.set(user.id, {
          user,
          isIntroducer: false,
          isMaintainer: false,
          introducers: [],
          introduction: isInherited ? null : introduction,
          hasValidIntroduction: isValid,
          hasValidDirectIntroduction: !isInherited && isValid,
          inheritedIntroductions: isInherited ? [introduction] : [],
          introductionLastEventAt: isInherited ? null : lastEventAt,
          activityAt: lastEventAt,
        });
      }
    });

    return Array.from(byUserId.values()).sort(
      (a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime(),
    );
  }, [introducers, introductions, isResource]);

  return {
    rows,
    isLoading: isIntroducersLoading || isIntroductionsLoading,
    hasError: Boolean(introducersError || introductionsError),
  };
}
