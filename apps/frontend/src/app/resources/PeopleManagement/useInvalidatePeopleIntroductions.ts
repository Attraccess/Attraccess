import { useCallback } from 'react';
import {
  useAccessControlServiceResourceIntroductionsGetPeopleKey,
  UseAccessControlServiceResourceIntroductionsGetPeopleKeyFn,
  UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn,
  UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn,
  UseAccessControlServiceResourceIntroductionsGetManyKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { PeopleTarget } from './types';

/** Refreshes the people table (and one user's history) after introductions changed for the target. */
export function useInvalidatePeopleIntroductions(target: PeopleTarget) {
  const queryClient = useQueryClient();
  const isResource = target.type === 'resource';
  return useCallback(
    (userId?: number) => {
      const listKey = isResource
        ? UseAccessControlServiceResourceIntroductionsGetManyKeyFn({ resourceId: target.id })
        : UseAccessControlServiceResourceGroupIntroductionsGetManyKeyFn({ groupId: target.id });
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({
        queryKey: isResource
          ? UseAccessControlServiceResourceIntroductionsGetPeopleKeyFn({ resourceId: target.id })
          : [useAccessControlServiceResourceIntroductionsGetPeopleKey],
      });
      if (userId !== undefined) {
        const historyKey = isResource
          ? UseAccessControlServiceResourceIntroductionsGetHistoryKeyFn({ resourceId: target.id, userId })
          : UseAccessControlServiceResourceGroupIntroductionsGetHistoryKeyFn({ groupId: target.id, userId });
        queryClient.invalidateQueries({ queryKey: historyKey });
      }
    },
    [queryClient, target.id, isResource],
  );
}
