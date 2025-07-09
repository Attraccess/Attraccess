import { Card, Accordion, AccordionItem, CardBody, Snippet, Link, Alert } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import * as en from './translations/en';
import * as de from './translations/de';
import { useMemo, useState } from 'react';
import { ExternalLink, InfoIcon } from 'lucide-react';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { getBaseUrl } from '../../../../api';

function useEspHomeConfigSnippet(resourceId: number) {
  // Get the resource details to use in the configuration
  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });

  // Generate the API base URL from the window location
  const apiBaseUrl = getBaseUrl();

  // Helper function to format resource name for ESPHome component IDs
  const formatEspHomeId = (name?: string, fallback = 'resource') => {
    if (!name) return fallback;

    // Convert to lowercase, replace spaces and special chars with underscores
    // ESPHome IDs must be lowercase, numbers, and underscores only
    return (
      'resource_' +
      name
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_{2,}/g, '_') // Replace multiple underscores with single
        .replace(/^_|_$/g, '')
    ); // Remove leading/trailing underscores
  };

  return useMemo(() => {
    return `external_components:
    - source:
        type: git
        url: https://github.com/Attraccess/Attraccess-esphome-components.git
      components: [attraccess_resource]
  
  attraccess_resource:
    id: ${formatEspHomeId(resource?.name)}
    api_url: ${apiBaseUrl}
    resource_id: "${resource?.id || 'resource_id'}"
  
  # Add text sensor to show human-readable status
  text_sensor:
    - platform: attraccess_resource
      resource: ${formatEspHomeId(resource?.name)}
      name: "${resource?.name || 'Resource'} Status"
      id: ${formatEspHomeId(resource?.name)}_status
  
  
  binary_sensor:
    - platform: attraccess_resource
      resource: ${formatEspHomeId(resource?.name)}
  
      # Monitor if API connection is available
      availability:
        name: "Attraccess API Availability"
        id: attraccess_api_availability
  
      # Monitor actual resource usage
      in_use:
        name: "${resource?.name || 'Resource'} In Use"
        id: ${formatEspHomeId(resource?.name)}_in_use
        on_press:
          - logger.log:
              level: INFO
              format: "The resource is in use, replace this with some automations"
        on_release:
          - logger.log:
              level: INFO
              format: "The resource is available, replace this with some automations"`;
  }, [resource?.name, apiBaseUrl, resource?.id]);
}

interface ESPHomeConfigurationPanelProps {
  resourceId: number;
}

export function ESPHomeConfigurationPanel(props: ESPHomeConfigurationPanelProps) {
  const { resourceId } = props;
  const { t } = useTranslations('esphome', { en, de });
  const [isOpen, setIsOpen] = useState(false);

  const esphomeConfig = useEspHomeConfigSnippet(resourceId);

  return (
    <Card>
      <Accordion
        selectedKeys={isOpen ? ['esphome'] : []}
        onSelectionChange={(keys) => {
          // @ts-expect-error - The types are incorrect for the Accordion component
          setIsOpen(keys.size > 0 && keys.has('esphome'));
        }}
      >
        <AccordionItem
          key="esphome"
          aria-label="ESPHome Configuration"
          title={<span className="mx-4">{t('title')}</span>}
          data-cy="esphome-config-accordion-item"
        >
          <CardBody className="pt-4">
            <div className="flex flex-col gap-4">
              <Alert color="secondary">
                <p>{t('description')}</p>
                <p>{t('integrationInfo')}</p>
              </Alert>

              <div className="mt-2">
                <h3 className="text-md font-medium mb-2">{t('setupInstructions')}</h3>

                <Snippet className="w-full" hideSymbol data-cy="esphome-config-snippet">
                  {esphomeConfig.split('\n').map((line, index) => (
                    <div key={index} className="whitespace-pre-wrap min-h-[1em] min-w-[1em]">
                      {line}
                    </div>
                  ))}
                </Snippet>
              </div>

              <Alert color="secondary">{t('automationTips')}</Alert>

              <div className="flex items-center mt-2 text-sm">
                <InfoIcon className="w-4 h-4 mr-2 text-blue-500" />
                <Link
                  href="https://github.com/Attraccess/Attraccess-esphome-components"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-500"
                  data-cy="esphome-config-learn-more-link"
                >
                  {t('learnMore')}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </CardBody>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
