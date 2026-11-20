import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import type { MatterNodeDetail } from './api';

const hex = (id: number) => `0x${id.toString(16).toUpperCase().padStart(4, '0')}`;

function raw(node: MatterNodeDetail): string {
  return JSON.stringify(
    {
      id: node.id,
      nodeId: node.nodeId,
      fabric: node.fabric,
      identity: {
        vendorId: node.identity.vendorId,
        productId: node.identity.productId,
        uniqueId: node.identity.uniqueId,
      },
      endpoints: node.endpoints.map((endpoint) => ({
        id: endpoint.id,
        endpointId: endpoint.endpointId,
        parentEndpointId: endpoint.parentEndpointId,
        deviceTypes: endpoint.deviceTypes.map((type) => ({
          deviceTypeId: hex(type.deviceTypeId),
          revision: type.revision,
        })),
        clusters: endpoint.clusters.map((cluster) => ({
          clusterId: hex(cluster.clusterId),
          role: cluster.role,
          revision: cluster.revision,
          featureMap: cluster.featureMap,
          attributeIds: cluster.attributeIds.map(hex),
          acceptedCommandIds: cluster.acceptedCommandIds.map(hex),
        })),
        capabilities: endpoint.capabilities,
      })),
    },
    null,
    2,
  );
}

/**
 * Raw device types, cluster, attribute and command IDs and the capabilities JSON: for support and development, never
 * part of a normal workflow. Collapsed by default, and the content is not even rendered until it is opened.
 */
export function DiagnosticsSection({ node }: Readonly<{ node: MatterNodeDetail }>) {
  const { t } = useMatterTranslations();
  const [open, setOpen] = useState(false);
  return (
    <section data-cy="matter-diagnostics">
      <Accordion
        expandedKeys={open ? new Set(['diagnostics']) : new Set()}
        onExpandedChange={(keys) => setOpen(keys.has('diagnostics'))}
      >
        <AccordionItem id="diagnostics">
          <AccordionHeading>
            <AccordionTrigger data-cy="matter-diagnostics-toggle">{t('devices.diagnostics.title')}</AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <AccordionBody>
              {open && (
                <div className="mt:flex mt:flex-col mt:gap-2">
                  <p className="mt:text-sm mt:text-muted">{t('devices.diagnostics.text')}</p>
                  <pre
                    className="mt:max-h-96 mt:overflow-auto mt:rounded-lg mt:bg-surface-secondary mt:p-3 mt:text-xs"
                    data-cy="matter-diagnostics-json"
                  >
                    {raw(node)}
                  </pre>
                </div>
              )}
            </AccordionBody>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
