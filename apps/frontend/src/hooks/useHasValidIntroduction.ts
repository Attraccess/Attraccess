import { ResourceIntroduction, User } from '@attraccess/react-query-client';
import { useCallback } from 'react';

interface Props {
  introductions: ResourceIntroduction[];
}

export function useHasValidIntroduction(props: Props) {
  const { introductions } = props;

  const userHasValidIntroduction = useCallback(
    (user: User | null | undefined) => {
      if (!user) {
        return false;
      }

      const introductionOfUser = introductions.find((intro) => intro.receiverUserId === user.id);

      if (!introductionOfUser) {
        return false;
      }

      if (!introductionOfUser.history) {
        return false;
      }

      const sortedHistory = [...introductionOfUser.history].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);

        return dateB.getTime() - dateA.getTime();
      });

      const lastHistoryItem = sortedHistory[0];

      return lastHistoryItem?.action === 'grant';
    },
    [introductions]
  );

  return userHasValidIntroduction;
}
