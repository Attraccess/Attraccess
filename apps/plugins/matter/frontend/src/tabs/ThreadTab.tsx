import { Button, Card } from '@heroui/react';
import { CpuIcon, NetworkIcon, RadioTowerIcon, ShieldCheckIcon, StethoscopeIcon } from 'lucide-react';
import { useMatterTranslations } from '../i18n';
import { FamilyNotice } from './FamilyNotice';
import { NotAvailableYet } from './NotAvailableYet';

/**
 * Thread Network (ATT-1012 and ATT-1013 fill the sections). Nothing here reads Thread data yet: the sections only say
 * what they will show. Visible with `thread.network.read`; manage actions need `thread.network.manage` (none yet).
 */
export function ThreadTab() {
  const { t } = useMatterTranslations();
  const sections = [
    { key: 'dataset', icon: <ShieldCheckIcon className="mt:h-7 mt:w-7" /> },
    { key: 'borderRouters', icon: <RadioTowerIcon className="mt:h-7 mt:w-7" /> },
    { key: 'rcps', icon: <CpuIcon className="mt:h-7 mt:w-7" /> },
    { key: 'smlight', icon: <StethoscopeIcon className="mt:h-7 mt:w-7" /> },
  ] as const;
  return (
    <div className="mt:flex mt:flex-col mt:gap-4" data-cy="matter-thread-tab">
      <NotAvailableYet
        title={t('thread.emptyTitle')}
        icon={<NetworkIcon className="mt:h-8 mt:w-8" />}
        dataCy="matter-thread-empty"
      >
        <FamilyNotice family="thread" />
        <p>{t('thread.emptyText')}</p>
      </NotAvailableYet>
      <Card data-cy="matter-thread-coexistence">
        <Card.Header>
          <Card.Title>{t('thread.coexistenceTitle')}</Card.Title>
        </Card.Header>
        <Card.Content className="mt:flex mt:flex-col mt:gap-3">
          <p>{t('thread.coexistenceText')}</p>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => window.open(t('thread.docsUrl'), '_blank', 'noopener,noreferrer')}
              data-cy="matter-thread-docs"
            >
              {t('thread.docs')}
            </Button>
          </div>
        </Card.Content>
      </Card>
      <div className="mt:grid mt:grid-cols-1 mt:gap-4 mt:md:grid-cols-2">
        {sections.map(({ key, icon }) => (
          <NotAvailableYet key={key} title={t(`thread.${key}.title`)} icon={icon} dataCy={`matter-thread-${key}`}>
            <p>{t(`thread.${key}.text`)}</p>
          </NotAvailableYet>
        ))}
      </div>
    </div>
  );
}
