import { useSearchParams } from 'react-router-dom';
import { PeopleManagement } from './index';

/** Development-only browser fixture for inspecting the real PeopleManagement component. */
export function PeopleManagementPreview() {
  const [searchParams] = useSearchParams();
  const targetType = searchParams.get('target') === 'group' ? 'group' : 'resource';
  const targetId = Number(searchParams.get('id') ?? 1);
  const canManage = searchParams.get('actions') !== '0';
  const hideHeader = searchParams.get('header') === 'hidden';

  return (
    <main className="p-4">
      <PeopleManagement
        target={{ type: targetType, id: targetId }}
        canManageIntroducers={canManage}
        canManageIntroductions={canManage}
        hideHeader={hideHeader}
      />
    </main>
  );
}
