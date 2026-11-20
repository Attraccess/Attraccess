import { Button, Card, Chip } from '@heroui/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatterTranslations } from '../i18n';
import { matterTabPath, type MatterTabKey } from '../matterPaths';

export type HealthLevel = 'ok' | 'warning' | 'danger' | 'unknown';

const COLOR = { ok: 'success', warning: 'warning', danger: 'danger', unknown: 'default' } as const;

/**
 * One health overview card: a title, a level chip and the facts. A card that is not healthy links to the tab where it
 * can be fixed (`fix`), so the overview is a starting point, not a dead end.
 */
export function HealthCard({
  title,
  level,
  levelLabel,
  fix,
  children,
  dataCy,
}: Readonly<{
  title: string;
  level: HealthLevel;
  levelLabel: string;
  /** Where to fix it; shown while the level is not `ok`. */
  fix?: { tab: MatterTabKey; label: string };
  children?: ReactNode;
  dataCy: string;
}>) {
  const { t } = useMatterTranslations();
  const navigate = useNavigate();
  return (
    <Card data-cy={dataCy} data-level={level}>
      <Card.Header className="mt:flex mt:flex-wrap mt:items-center mt:justify-between mt:gap-2">
        <Card.Title>{title}</Card.Title>
        <Chip color={COLOR[level]} variant="soft" data-cy={`${dataCy}-level`}>
          {levelLabel}
        </Chip>
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-2 mt:text-sm">
        {children}
        {fix && level !== 'ok' && (
          <div>
            <Button size="sm" variant="secondary" onPress={() => navigate(matterTabPath(fix.tab))} data-cy={`${dataCy}-fix`}>
              {fix.label}
            </Button>
          </div>
        )}
        <span className="mt:sr-only">{t(`health.levels.${level}`)}</span>
      </Card.Content>
    </Card>
  );
}
