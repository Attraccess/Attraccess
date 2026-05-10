import { useAccessControlServiceResourceIntroductionsGetHistory } from '@attraccess/react-query-client';
import { useEffect } from 'react';
import { IntroductionHistoryModal } from '../../../../components/IntroductionsManagement/history';

interface Props {
  resourceId: number;
  userId: number;
  isOpen: boolean;
  onClose: () => void;
}
export function ResourceIntroductionHistoryModal(props: Readonly<Props>) {
  const { resourceId, userId, isOpen, onClose } = props;

  const {
    data: history,
    isLoading,
    refetch,
  } = useAccessControlServiceResourceIntroductionsGetHistory(
    {
      resourceId,
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
