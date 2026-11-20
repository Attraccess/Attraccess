import type { NodeProps } from '@xyflow/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useFlowContext } from '../context/flowContext';
import { AttraccessNode } from './index';
import nodesDeTranslations from './de.json';
import nodesEnTranslations from './en.json';

/**
 * The one component React Flow renders for every node type on the canvas. It reads the schema, translations and
 * validation error itself, so its identity never changes: React Flow does not warn about new node types (#002) and
 * nodes keep their state when validation errors change.
 */
export function FlowCanvasNode(props: NodeProps) {
  const { nodeSchemasByType, validationErrors } = useFlowContext();
  const { t, tExists } = useTranslations({ de: nodesDeTranslations, en: nodesEnTranslations });
  const schema = props.type === undefined ? undefined : nodeSchemasByType.get(props.type);

  if (!schema) {
    return null;
  }

  return (
    <AttraccessNode
      tNodeTranslations={t}
      tNodeExists={tExists}
      schema={schema}
      node={props}
      validationErrors={validationErrors[props.id]}
    />
  );
}
