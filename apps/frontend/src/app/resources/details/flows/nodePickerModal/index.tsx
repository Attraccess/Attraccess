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

interface NodeEntry {
  key: string;
  node: AttraccessNode;
}

interface NodeGroup {
  type: AttraccessNodeType;
  nodes: NodeEntry[];
}

export function NodePickerModal(props: Props) {
  const { isOpen, onOpenChange, onClose, onOpen } = useDisclosure();

  const { t } = useTranslations('nodePicker', {
    de,
    en,
  });

  // Convert nodes object to array format upfront
  const allNodesArray = useMemo((): NodeEntry[] => {
    return Object.entries(AttraccessNodes).map(([key, node]) => ({
      key,
      node,
    }));
  }, []);

  // Filter nodes by allowed types if specified
  const availableNodes = useMemo((): NodeEntry[] => {
    if (!Array.isArray(props.nodeTypes) || props.nodeTypes.length === 0) {
      return allNodesArray;
    }

    return allNodesArray.filter((nodeEntry) => (props.nodeTypes as AttraccessNodeType[]).includes(nodeEntry.node.type));
  }, [allNodesArray, props.nodeTypes]);

  // Group nodes by their type
  const nodeGroups = useMemo((): NodeGroup[] => {
    // Initialize groups array
    const groups: NodeGroup[] = [
      { type: AttraccessNodeType.input, nodes: [] },
      { type: AttraccessNodeType.output, nodes: [] },
      { type: AttraccessNodeType.inputOutput, nodes: [] },
    ];

    // Group nodes by type
    availableNodes.forEach((nodeEntry) => {
      const group = groups.find((g) => g.type === nodeEntry.node.type);
      if (group) {
        group.nodes.push(nodeEntry);
      }
    });

    // Return only groups that have nodes
    return groups.filter((group) => group.nodes.length > 0);
  }, [availableNodes]);

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
            <Accordion defaultExpandedKeys={nodeGroups.map((_, index) => index.toString())}>
              {nodeGroups.map((group, index) => (
                <AccordionItem key={index} title={t('nodeType.' + group.type)}>
                  <div className="flex flex-row flex-wrap gap-4">
                    {group.nodes.map((nodeEntry) => (
                      <div
                        key={nodeEntry.key}
                        onClick={() => onSelect(nodeEntry.key)}
                        className="cursor-pointer hover:scale-105 transition-all"
                      >
                        <nodeEntry.node.component {...({ previewMode: true } as unknown as NodeProps)} />
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
