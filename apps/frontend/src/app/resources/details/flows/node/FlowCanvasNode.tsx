import type { NodeProps, NodeTypes } from '@xyflow/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useFlowContext } from '../context/flowContext';
import { useFlowNodeSchemasQuery } from '../flowOwner';
import { AttraccessNode } from './index';
import nodesDeTranslations from './de.json';
import nodesEnTranslations from './en.json';

/**
 * The one component React Flow renders for every node type on the canvas. It reads the schema, translations and
 * validation error itself, so its identity never changes: React Flow does not warn about new node types (#002) and
 * nodes keep their state when validation errors change.
 */
export function FlowCanvasNode(props: NodeProps) {
  const { owner, validationErrors } = useFlowContext();
  const { data: nodeSchemas } = useFlowNodeSchemasQuery(owner);
  const { t, tExists } = useTranslations({ de: nodesDeTranslations, en: nodesEnTranslations });
  const schema = nodeSchemas?.find((candidate) => candidate.type === props.type);

  if (!schema) {
    return null;
  }

  return (
    <AttraccessNode
      tNodeTranslations={t}
      tNodeExists={tExists}
      schema={schema}
      node={props}
      validationError={validationErrors[props.id]}
    />
  );
}

/** Maps each node type to FlowCanvasNode. Same keys give equal values, whatever object holds them. */
export function buildFlowNodeTypes(types: readonly string[]): NodeTypes {
  return Object.fromEntries(types.map((type) => [type, FlowCanvasNode]));
}
