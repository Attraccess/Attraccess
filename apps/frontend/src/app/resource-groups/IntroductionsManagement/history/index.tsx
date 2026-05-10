import { useAccessControlServiceResourceGroupIntroductionsGetHistory } from '@attraccess/react-query-client';
import { useEffect } from 'react';
import { IntroductionHistoryModal } from '../../../../components/IntroductionsManagement/history';

interface Props {
  groupId: number;
  userId: number;
  isOpen: boolean;
  onClose: () => void;
}
export function ResourceGroupIntroductionHistoryModal(props: Readonly<Props>) {
  const { groupId, userId, isOpen, onClose } = props;

  const {
    data: history,
    isLoading,
    refetch,
  } = useAccessControlServiceResourceGroupIntroductionsGetHistory(
    {
      groupId,
      userId,
    },
    undefined,
    { enabled: isOpen && !!userId }
  );

  useEffect(() => {
    if (isOpen) {
      refetch();
    }
  }, [isOpen, refetch]);

  return <IntroductionHistoryModal isOpen={isOpen} onClose={onClose} history={history ?? []} />;
}
