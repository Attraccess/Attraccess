import { NodeProps, useNodeId, useNodesData } from '@xyflow/react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Switch,
  useDisclosure,
} from '@heroui/react';

import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useState } from 'react';
import { PageHeader } from '../../../../../../components/pageHeader';
import { Edit2Icon } from 'lucide-react';
import { useFlowContext } from '../../flowContext';
import { BaseNodeCard } from '../base/baseCard';

import de from './de.json';
import en from './en.json';

import nodeTranslationsDe from '../de.json';
import nodeTranslationsEn from '../en.json';

enum ComparisonOperator {
  EQUAL = '=',
  NOT_EQUAL = '!=',
  GREATER_THAN = '>',
  LESS_THAN = '<',
  GREATER_THAN_OR_EQUAL = '>=',
}

interface Props {
  previewMode?: boolean;
}

export function IfNode(
  props: NodeProps & {
    data: unknown;
  } & Props
) {
  const nodeId = useNodeId();
  const node = useNodesData(nodeId as string);
  const { updateNodeData } = useFlowContext();

  const [path, setPath] = useState<string>((node?.data.path as string) ?? '');
  const [comparisonValue, setComparisonValue] = useState<string>((node?.data.comparisonValue as string) ?? '');
  const [comparisonOperator, setComparisonOperator] = useState<ComparisonOperator>(
    (node?.data.comparisonOperator as ComparisonOperator) ?? ComparisonOperator.EQUAL
  );
  const [comparisonValueIsPath, setComparisonValueIsPath] = useState<boolean>(
    (node?.data.comparisonValueIsPath as boolean) ?? false
  );

  const { t } = useTranslations('resource-flows.node.action.util.if.wrapper', {
    de: {
      ...de,
      nodes: nodeTranslationsDe,
    },
    en: {
      ...en,
      nodes: nodeTranslationsEn,
    },
  });

  const {
    isOpen: isEditorOpen,
    onOpen: onOpenEditor,
    onOpenChange: onOpenChangeEditor,
    onClose: onCloseEditor,
  } = useDisclosure();

  const onSave = useCallback(() => {
    if (!nodeId) {
      return;
    }

    updateNodeData(nodeId, {
      path,
      comparisonValue,
      comparisonOperator,
      comparisonValueIsPath,
    });

    onCloseEditor();
  }, [path, comparisonValue, comparisonOperator, comparisonValueIsPath, nodeId, updateNodeData, onCloseEditor]);

  return (
    <BaseNodeCard
      title={t('nodes.processing.if.title')}
      subtitle={t('nodes.processing.if.description')}
      previewMode={props.previewMode}
      inputs={[{ id: 'input' }]}
      outputs={[
        { id: 'output-true', label: t('nodes.processing.if.outputs.output-true.label') },
        { id: 'output-false', label: t('nodes.processing.if.outputs.output-false.label') },
      ]}
      actions={<Button size="sm" isIconOnly startContent={<Edit2Icon size={12} />} onPress={onOpenEditor} />}
    >
      <Input
        label={t('editor.inputs.path.label')}
        isReadOnly
        value={`${node?.data.path ?? ''} ${node?.data.comparisonOperator ?? '='} ${node?.data.comparisonValue ?? ''}`}
      />

      <Modal isOpen={isEditorOpen} onOpenChange={onOpenChangeEditor}>
        <ModalContent>
          <ModalHeader>
            <PageHeader
              title={t('nodes.processing.if.title')}
              subtitle={t('nodes.processing.if.description')}
              noMargin
            />
          </ModalHeader>
          <ModalBody>
            <Input label={t('editor.inputs.path.label')} value={path} onValueChange={(value) => setPath(value)} />
            <Select
              label={t('editor.inputs.comparisonOperator.label')}
              selectedKeys={comparisonOperator}
              onChange={(e) => setComparisonOperator(e.target.value as ComparisonOperator)}
            >
              {Object.values(ComparisonOperator).map((operator) => (
                <SelectItem key={operator}>{t(`editor.inputs.comparisonOperator.operators.${operator}`)}</SelectItem>
              ))}
            </Select>
            <Switch isSelected={comparisonValueIsPath} onValueChange={setComparisonValueIsPath}>
              {t('editor.inputs.comparisonValueIsPath.label')}
            </Switch>
            <Input
              label={t('editor.inputs.comparisonValue.label')}
              value={comparisonValue}
              onValueChange={(value) => setComparisonValue(value)}
            />
          </ModalBody>
          <ModalFooter>
            <Button onPress={onCloseEditor}>{t('editor.buttons.close')}</Button>
            <Button onPress={onSave}>{t('editor.buttons.save')}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </BaseNodeCard>
  );
}
