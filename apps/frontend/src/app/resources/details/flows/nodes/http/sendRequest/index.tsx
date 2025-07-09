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
  Textarea,
  useDisclosure,
  Card,
  CardBody,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useMemo, useState } from 'react';
import { PageHeader } from '../../../../../../../components/pageHeader';
import { Edit2Icon, Plus, X } from 'lucide-react';
import { useFlowContext } from '../../../flowContext';
import { BaseNodeCard } from '../../base/baseCard';

import de from './de.json';
import en from './en.json';

import nodeTranslationsDe from '../../de.json';
import nodeTranslationsEn from '../../en.json';

interface Props {
  previewMode?: boolean;
}

export function HTTPRequestNode(
  props: NodeProps & {
    data: unknown;
  } & Props
) {
  const nodeId = useNodeId();
  const node = useNodesData(nodeId as string);
  const { updateNodeData } = useFlowContext();

  const { t } = useTranslations('resource-flows.node.action.http.sendRequest', {
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

  const [url, setUrl] = useState<string>(node?.data.url as string);
  const [method, setMethod] = useState<string>(node?.data.method as string);
  const [headers, setHeaders] = useState<Record<string, string>>(() => {
    const nodeHeaders = node?.data.headers;
    // Handle backwards compatibility - if headers is a string, try to parse it as JSON
    if (typeof nodeHeaders === 'string') {
      try {
        return JSON.parse(nodeHeaders || '{}');
      } catch {
        return {};
      }
    }
    return (nodeHeaders as Record<string, string>) || {};
  });
  const [body, setBody] = useState<string>(node?.data.body as string);

  const addHeader = useCallback(() => {
    const newKey = `header-${Object.keys(headers).length + 1}`;
    setHeaders((prev) => ({ ...prev, [newKey]: '' }));
  }, [headers]);

  const updateHeaderKey = useCallback((oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    setHeaders((prev) => {
      const newHeaders = { ...prev };
      newHeaders[newKey] = newHeaders[oldKey];
      delete newHeaders[oldKey];
      return newHeaders;
    });
  }, []);

  const updateHeaderValue = useCallback((key: string, value: string) => {
    setHeaders((prev) => ({ ...prev, [key]: value }));
  }, []);

  const removeHeader = useCallback((key: string) => {
    setHeaders((prev) => {
      const newHeaders = { ...prev };
      delete newHeaders[key];
      return newHeaders;
    });
  }, []);

  const onSave = useCallback(() => {
    if (!nodeId) {
      return;
    }

    updateNodeData(nodeId, { url, method, headers, body });

    onCloseEditor();
  }, [nodeId, updateNodeData, onCloseEditor, url, method, headers, body]);

  const urlObject = useMemo(() => {
    const urlString = node?.data.url as string;
    if (!urlString) return null;
    return new URL(urlString);
  }, [node?.data.url]);

  return (
    <BaseNodeCard
      title={t('nodes.action.http.sendRequest.title')}
      subtitle={t('nodes.action.http.sendRequest.description')}
      previewMode={props.previewMode}
      hasTarget={true}
      hasSource={false}
      actions={<Button size="sm" isIconOnly startContent={<Edit2Icon size={12} />} onPress={onOpenEditor} />}
    >
      <div className="flex flex-col gap-2">
        <Input label={t('editor.inputs.method.label')} isReadOnly value={node?.data.method as string} />
        <Input
          label={t('editor.inputs.url.origin.label')}
          isReadOnly
          value={urlObject?.origin}
          title={urlObject?.toString()}
        />
      </div>

      <Modal isOpen={isEditorOpen} onOpenChange={onOpenChangeEditor}>
        <ModalContent>
          <ModalHeader>
            <PageHeader
              title={t('nodes.action.http.sendRequest.title')}
              subtitle={t('nodes.action.http.sendRequest.description')}
              noMargin
            />
          </ModalHeader>
          <ModalBody>
            <Input label={t('editor.inputs.url.label')} value={url} onChange={(e) => setUrl(e.target.value)} />
            <Select label={t('editor.inputs.method.label')} value={method} onChange={(e) => setMethod(e.target.value)}>
              <SelectItem key="GET">GET</SelectItem>
              <SelectItem key="POST">POST</SelectItem>
              <SelectItem key="PUT">PUT</SelectItem>
              <SelectItem key="PATCH">PATCH</SelectItem>
              <SelectItem key="DELETE">DELETE</SelectItem>
              <SelectItem key="HEAD">HEAD</SelectItem>
              <SelectItem key="OPTIONS">OPTIONS</SelectItem>
            </Select>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t('editor.inputs.headers.label')}</label>
                <Button size="sm" variant="flat" startContent={<Plus size={16} />} onPress={addHeader}>
                  Add Header
                </Button>
              </div>
              {Object.entries(headers).length === 0 ? (
                <Card>
                  <CardBody>
                    <p className="text-sm text-gray-500">No headers configured</p>
                  </CardBody>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {Object.entries(headers).map(([key, value], index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        size="sm"
                        placeholder="Header name"
                        value={key}
                        onChange={(e) => updateHeaderKey(key, e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        size="sm"
                        placeholder="Header value"
                        value={value}
                        onChange={(e) => updateHeaderValue(key, e.target.value)}
                        className="flex-1"
                      />
                      <Button size="sm" isIconOnly variant="flat" color="danger" onPress={() => removeHeader(key)}>
                        <X size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Textarea label={t('editor.inputs.body.label')} value={body} onChange={(e) => setBody(e.target.value)} />
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
