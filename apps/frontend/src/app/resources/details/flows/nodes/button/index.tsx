import { NodeProps, useNodeId, useNodesData } from '@xyflow/react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from '@heroui/react';

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

interface Props {
  previewMode?: boolean;
}

export function ButtonNode(
  props: NodeProps & {
    data: unknown;
  } & Props
) {
  const nodeId = useNodeId();
  const node = useNodesData(nodeId as string);
  const { updateNodeData } = useFlowContext();
  const { resourceType } = useFlowContext();

  const [label, setLabel] = useState<string>((node?.data.label as string) ?? '');

  const { t } = useTranslations('resource-flows.node.action.util.button.wrapper', {
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
      label,
    });

    onCloseEditor();
  }, [label, nodeId, updateNodeData, onCloseEditor]);

  return (
    <BaseNodeCard
      title={t('nodes.input.button.title')}
      subtitle={t('nodes.input.button.description')}
      previewMode={props.previewMode}
      outputs={[{ id: 'output' }]}
      unsupported={resourceType !== 'machine'}
      actions={<Button size="sm" isIconOnly startContent={<Edit2Icon size={12} />} onPress={onOpenEditor} />}
    >
      <Input label={t('editor.inputs.label.label')} isReadOnly value={label} />

      <Modal isOpen={isEditorOpen} onOpenChange={onOpenChangeEditor}>
        <ModalContent>
          <ModalHeader>
            <PageHeader title={t('nodes.input.button.title')} subtitle={t('nodes.input.button.description')} noMargin />
          </ModalHeader>
          <ModalBody>
            <Input label={t('editor.inputs.label.label')} value={label} onValueChange={(value) => setLabel(value)} />
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
