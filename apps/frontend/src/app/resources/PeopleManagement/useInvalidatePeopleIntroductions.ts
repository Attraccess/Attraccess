import { useCallback } from 'react';
import {
  useResourceIntroductionsGetPeopleKey,
  UseResourceIntroductionsGetPeopleKeyFn,
  UseResourceGroupIntroductionsGetHistoryKeyFn,
  UseResourceGroupIntroductionsGetManyKeyFn,
  UseResourceIntroductionsGetHistoryKeyFn,
  UseResourceIntroductionsGetManyKeyFn,
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
        ? UseResourceIntroductionsGetManyKeyFn({ path: { resourceId: target.id } })
        : UseResourceGroupIntroductionsGetManyKeyFn({ path: { groupId: target.id } });
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({
        queryKey: isResource
          ? UseResourceIntroductionsGetPeopleKeyFn({ path: { resourceId: target.id } })
          : [useResourceIntroductionsGetPeopleKey],
      });
      if (userId !== undefined) {
        const historyKey = isResource
          ? UseResourceIntroductionsGetHistoryKeyFn({ path: { resourceId: target.id, userId } })
          : UseResourceGroupIntroductionsGetHistoryKeyFn({ path: { groupId: target.id, userId } });
        queryClient.invalidateQueries({ queryKey: historyKey });
      }
    },
    [queryClient, target.id, isResource],
  );
}
