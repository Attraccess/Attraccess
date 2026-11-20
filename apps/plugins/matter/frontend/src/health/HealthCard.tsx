import { Button, Card, Chip, Spinner } from '@heroui/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatterTranslations } from '../i18n';
import { HEALTH_LEVEL_COLOR, type HealthLevel } from '../healthLevel';
import { matterTabPath, type MatterTabKey } from '../matterPaths';

export type { HealthLevel } from '../healthLevel';

/**
 * One health overview card: a title, a level chip and the facts. A card that is not healthy links to the tab where it
 * can be fixed (`fix`), so the overview is a starting point, not a dead end. While its data loads (`loading`) it shows
 * a spinner and no level, so nothing reads as "unknown" or offers a fix before the answer is in.
 */
export function HealthCard({
  title,
  level,
  levelLabel,
  fix,
  loading = false,
  children,
  dataCy,
}: Readonly<{
  title: string;
  level: HealthLevel;
  levelLabel: string;
  /** Where to fix it; shown while the level is not `ok`. */
  fix?: { tab: MatterTabKey; label: string };
  loading?: boolean;
  children?: ReactNode;
  dataCy: string;
}>) {
  const { t } = useMatterTranslations();
  const navigate = useNavigate();
  return (
    <Card data-cy={dataCy} data-level={loading ? 'loading' : level}>
      <Card.Header className="mt:flex mt:flex-wrap mt:items-center mt:justify-between mt:gap-2">
        <Card.Title>{title}</Card.Title>
        {!loading && (
          <Chip color={HEALTH_LEVEL_COLOR[level]} variant="soft" data-cy={`${dataCy}-level`}>
            {levelLabel}
          </Chip>
        )}
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-2 mt:text-sm">
        {loading ? <Spinner size="sm" data-cy={`${dataCy}-loading`} /> : children}
        {fix && !loading && level !== 'ok' && (
          <div>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => navigate(matterTabPath(fix.tab))}
              data-cy={`${dataCy}-fix`}
            >
              {fix.label}
            </Button>
          </div>
        )}
        {!loading && <span className="mt:sr-only">{t(`health.levels.${level}`)}</span>}
      </Card.Content>
    </Card>
  );
}
