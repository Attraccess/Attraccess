import {
  Accordion,
  AccordionItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from '@heroui/react';
import { AttraccessNode, AttraccessNodes, AttraccessNodeType } from '../nodes';
import { useCallback, useMemo } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';
import { NodeProps } from '@xyflow/react';

interface Props {
  onSelect: (nodeType: string) => void;
  children: (open: () => void) => React.ReactNode;
  nodeTypes?: AttraccessNodeType[];
}

export function NodePickerModal(props: Props) {
  const { isOpen, onOpenChange, onClose, onOpen } = useDisclosure();

  const { t } = useTranslations('nodePicker', {
    de,
    en,
  });

  const nodesToShow = useMemo(() => {
    if (!props.nodeTypes) {
      return Object.entries(AttraccessNodes);
    }

    return Object.entries(AttraccessNodes).filter(([, nodeData]) =>
      (props.nodeTypes as AttraccessNodeType[]).includes(nodeData.type)
    );
  }, [props.nodeTypes]);

  const nodesByType = useMemo(() => {
    return nodesToShow.reduce((acc, [key, nodeData]) => {
      if (!acc[nodeData.type]) {
        acc[nodeData.type] = [];
      }
      acc[nodeData.type].push([key, nodeData]);
      return acc;
    }, {} as Record<AttraccessNodeType, Array<[string, AttraccessNode]>>);
  }, [nodesToShow]);

  const onSelect = useCallback(
    (nodeType: string) => {
      props.onSelect(nodeType);
      onClose();
    },
    [props, onClose]
  );

  return (
    <>
      {props.children(onOpen)}
      <Modal scrollBehavior="inside" isOpen={isOpen} onOpenChange={onOpenChange} size="4xl">
        <ModalContent>
          <ModalHeader>{t('title')}</ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <Accordion defaultExpandedKeys={Object.keys(nodesByType)}>
              {Object.entries(nodesByType).map(([type, nodes]) => (
                <AccordionItem key={type} title={t('nodeType.' + type)}>
                  <div className="flex flex-row flex-wrap gap-4">
                    {nodes.map(([key, node]) => (
                      <div
                        key={key}
                        onClick={() => onSelect(key)}
                        className="cursor-pointer hover:scale-105 transition-all"
                      >
                        <node.component {...({ previewMode: true } as unknown as NodeProps)} />
                      </div>
                    ))}
                  </div>
                </AccordionItem>
              ))}
            </Accordion>
          </ModalBody>
          <ModalFooter></ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
