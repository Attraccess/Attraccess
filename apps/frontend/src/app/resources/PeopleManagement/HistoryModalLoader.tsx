import { useAccessControlServiceResourceIntroductionsGetHistory } from '@attraccess/react-query-client';
import { IntroductionHistoryModal } from '../../../components/IntroductionsManagement/history';

interface HistoryModalLoaderProps {
  resourceId: number;
  userId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function HistoryModalLoader(props: Readonly<HistoryModalLoaderProps>) {
  const { resourceId, userId, isOpen, onClose } = props;
  const { data: history, isLoading } = useAccessControlServiceResourceIntroductionsGetHistory(
    { resourceId, userId },
    undefined,
    { enabled: isOpen && !!userId },
  );

  return <IntroductionHistoryModal isOpen={isOpen} onClose={onClose} history={history ?? []} isLoading={isLoading} />;
}
