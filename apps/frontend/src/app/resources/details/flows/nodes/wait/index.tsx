import { NodeProps, useNodeId, useNodesData } from '@xyflow/react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from '@heroui/react';
import { Select } from '../../../../../../components/select';
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

export function WaitNode(
  props: NodeProps & {
    data: unknown;
  } & Props
) {
  const nodeId = useNodeId();
  const node = useNodesData(nodeId as string);
  const { updateNodeData } = useFlowContext();

  const [duration, setDuration] = useState<number>((node?.data.duration as number) ?? 0);
  const [unit, setUnit] = useState<string>((node?.data.unit as string) ?? 'seconds');

  const { t } = useTranslations('resource-flows.node.action.util.wait.wrapper', {
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
      duration,
      unit,
    });

    onCloseEditor();
  }, [duration, unit, nodeId, updateNodeData, onCloseEditor]);

  return (
    <BaseNodeCard
      title={t('nodes.action.util.wait.title')}
      subtitle={t('nodes.action.util.wait.description')}
      previewMode={props.previewMode}
      hasTarget={true}
      hasSource={true}
      actions={<Button size="sm" isIconOnly startContent={<Edit2Icon size={12} />} onPress={onOpenEditor} />}
    >
      <Input
        label={t('editor.inputs.duration.label')}
        isReadOnly
        value={`${String(node?.data.duration ?? 0)} ${t('units.' + String(node?.data.unit ?? 'seconds'))}`}
      />

      <Modal isOpen={isEditorOpen} onOpenChange={onOpenChangeEditor}>
        <ModalContent>
          <ModalHeader>
            <PageHeader
              title={t('nodes.action.util.wait.title')}
              subtitle={t('nodes.action.util.wait.description')}
              noMargin
            />
          </ModalHeader>
          <ModalBody>
            <Input
              type="number"
              label={t('editor.inputs.duration.label')}
              value={String(duration)}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
            <Select
              label={t('editor.inputs.unit.label')}
              selectedKey={unit}
              onSelectionChange={(key) => setUnit(key)}
              items={[
                { key: 'seconds', label: t('units.seconds') },
                { key: 'minutes', label: t('units.minutes') },
                { key: 'hours', label: t('units.hours') },
              ]}
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
