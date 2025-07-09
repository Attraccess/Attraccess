import { useTranslations } from '@attraccess/plugins-frontend-ui';

import nodeTranslationsDe from '../de.json';
import nodeTranslationsEn from '../en.json';
import { BaseNodeCard } from './baseCard';

interface Props {
  nodeType: string;
  hasTarget?: boolean;
  hasSource?: boolean;
  previewMode?: boolean;
}

export function AttraccessBaseNode(props: Props) {
  const { t } = useTranslations('resource-flows.node.' + props.nodeType, {
    de: {
      nodes: nodeTranslationsDe,
    },
    en: {
      nodes: nodeTranslationsEn,
    },
  });

  return (
    <BaseNodeCard
      title={t('nodes.' + props.nodeType + '.title')}
      subtitle={props.previewMode ? t('nodes.' + props.nodeType + '.description') : undefined}
      previewMode={props.previewMode}
      hasTarget={props.hasTarget}
      hasSource={props.hasSource}
    />
  );
}
