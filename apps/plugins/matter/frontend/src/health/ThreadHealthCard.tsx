import { useMatterTranslations } from '../i18n';
import { FamilyNotice } from '../tabs/FamilyNotice';
import { HealthCard } from './HealthCard';

/** Thread health placeholder (ATT-1012 fills it). Only for users with `thread.network.read`. */
export function ThreadHealthCard() {
  const { t } = useMatterTranslations();
  return (
    <HealthCard
      title={t('health.thread.title')}
      level="unknown"
      levelLabel={t('health.levels.unknown')}
      fix={{ tab: 'thread', label: t('health.fix.thread') }}
      dataCy="matter-health-thread"
    >
      <FamilyNotice family="thread" />
      <p className="mt:text-muted">{t('health.thread.text')}</p>
    </HealthCard>
  );
}
