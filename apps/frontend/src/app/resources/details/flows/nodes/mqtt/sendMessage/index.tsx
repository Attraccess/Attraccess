import { NodeProps, useNodeId, useNodesData } from '@xyflow/react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useMemo, useState } from 'react';
import { PageHeader } from '../../../../../../../components/pageHeader';
import { Edit2Icon } from 'lucide-react';
import { useFlowContext } from '../../../flowContext';
import { BaseNodeCard } from '../../base/baseCard';
import { useMqttServiceMqttServersGetAll } from '@attraccess/react-query-client';
import { Select } from '../../../../../../../components/select';

import de from './de.json';
import en from './en.json';

import nodeTranslationsDe from '../../de.json';
import nodeTranslationsEn from '../../en.json';

interface Props {
  previewMode?: boolean;
}

export function MQTTSendMessageNode(
  props: NodeProps & {
    data: unknown;
  } & Props
) {
  const nodeId = useNodeId();
  const node = useNodesData(nodeId as string);
  const { updateNodeData } = useFlowContext();

  const { t } = useTranslations('resource-flows.node.action.mqtt.sendMessage', {
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

  const { data: servers } = useMqttServiceMqttServersGetAll();

  const [serverId, setServerId] = useState<number>(node?.data.serverId as number);
  const [topic, setTopic] = useState<string>(node?.data.topic as string);
  const [payload, setPayload] = useState<string>(node?.data.payload as string);

  const onSave = useCallback(() => {
    if (!nodeId) {
      return;
    }

    updateNodeData(nodeId, { topic, payload, serverId });

    onCloseEditor();
  }, [nodeId, updateNodeData, onCloseEditor, topic, payload, serverId]);

  const shortPayload = useMemo(() => {
    if (!node?.data.payload) {
      return '';
    }

    const payloadString = node?.data.payload as string;
    if (payloadString.length < 20) {
      return payloadString;
    }

    return payloadString.slice(0, 20) + '[...]';
  }, [node?.data.payload]);

  const serverName = useMemo(() => {
    if (!serverId) {
      return '';
    }

    return servers?.find((server) => server.id === node?.data.serverId)?.name ?? '';
  }, [node?.data.serverId, servers, serverId]);

  return (
    <BaseNodeCard
      title={t('nodes.output.mqtt.sendMessage.title')}
      subtitle={t('nodes.output.mqtt.sendMessage.description')}
      previewMode={props.previewMode}
      inputs={[{ id: 'input' }]}
      outputs={[{ id: 'output' }]}
      actions={<Button size="sm" isIconOnly startContent={<Edit2Icon size={12} />} onPress={onOpenEditor} />}
    >
      <div className="flex flex-col gap-2">
        <Input isReadOnly value={serverName} label={t('editor.inputs.serverId.label')} />

        <Input isReadOnly value={String(node?.data.topic)} label={t('editor.inputs.topic.label')} />

        <Textarea isReadOnly value={shortPayload} label={t('editor.inputs.payload.label')} rows={4} />
      </div>

      <Modal isOpen={isEditorOpen} onOpenChange={onOpenChangeEditor}>
        <ModalContent>
          <ModalHeader>
            <PageHeader
              title={t('nodes.output.mqtt.sendMessage.title')}
              subtitle={t('nodes.output.mqtt.sendMessage.description')}
              noMargin
            />
          </ModalHeader>
          <ModalBody>
            <Select
              label={t('editor.inputs.serverId.label')}
              selectedKey={String(serverId)}
              onSelectionChange={(selectedKey) => setServerId(Number(selectedKey))}
              items={
                servers?.map((server) => ({
                  key: String(server.id),
                  label: server.name,
                })) ?? []
              }
            />
            <Input label={t('editor.inputs.topic.label')} value={topic} onChange={(e) => setTopic(e.target.value)} />
            <Textarea
              label={t('editor.inputs.payload.label')}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
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
