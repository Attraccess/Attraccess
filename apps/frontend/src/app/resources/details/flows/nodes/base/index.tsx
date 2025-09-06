import { useTranslations } from '@attraccess/plugins-frontend-ui';

import nodeTranslationsDe from '../de.json';
import nodeTranslationsEn from '../en.json';
import { BaseNodeCard } from './baseCard';

interface Props {
  nodeType: string;
  inputs?: { id: string; label?: string }[];
  outputs?: { id: string; label?: string }[];
  previewMode?: boolean;
  unsupported?: boolean;
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
      subtitle={
        props.previewMode
          ? t('nodes.' + props.nodeType + '.description')
          : props.unsupported
          ? t('nodes.unsupportedForResourceType')
          : undefined
      }
      previewMode={props.previewMode}
      inputs={props.inputs}
      outputs={props.outputs}
      unsupported={props.unsupported}
    />
  );
}
