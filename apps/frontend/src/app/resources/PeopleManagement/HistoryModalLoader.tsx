import {
  useAccessControlServiceResourceGroupIntroductionsGetHistory,
  useAccessControlServiceResourceIntroductionsGetHistory,
} from '@attraccess/react-query-client';
import { IntroductionHistoryModal } from '../../../components/IntroductionsManagement/history';
import { PeopleTarget } from './types';

interface HistoryModalLoaderProps {
  target: PeopleTarget;
  userId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function HistoryModalLoader(props: Readonly<HistoryModalLoaderProps>) {
  const { target, userId, isOpen, onClose } = props;
  const isResource = target.type === 'resource';

  const { data: resourceHistory, isLoading: isResourceLoading } = useAccessControlServiceResourceIntroductionsGetHistory(
    { resourceId: target.id, userId },
    undefined,
    { enabled: isOpen && !!userId && isResource },
  );

  const { data: groupHistory, isLoading: isGroupLoading } = useAccessControlServiceResourceGroupIntroductionsGetHistory(
    { groupId: target.id, userId },
    undefined,
    { enabled: isOpen && !!userId && !isResource },
  );

  const history = isResource ? resourceHistory : groupHistory;
  const isLoading = isResource ? isResourceLoading : isGroupLoading;

  return <IntroductionHistoryModal isOpen={isOpen} onClose={onClose} history={history ?? []} isLoading={isLoading} />;
}
