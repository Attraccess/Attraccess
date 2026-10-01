import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import commissioningEn from './commissioning.en.json';
import commissioningDe from './commissioning.de.json';
import editorEn from './editor.en.json';
import editorDe from './editor.de.json';
import revisionsEn from './revisions.en.json';
import revisionsDe from './revisions.de.json';
import artifactsEn from './artifacts.en.json';
import artifactsDe from './artifacts.de.json';
import diagnosticsEn from './diagnostics.en.json';
import diagnosticsDe from './diagnostics.de.json';
import channelsEn from './channels.en.json';
import channelsDe from './channels.de.json';
import modbusEn from './modbus.en.json';
import modbusDe from './modbus.de.json';
import securityEn from './security.en.json';
import securityDe from './security.de.json';
import presetsEn from './presets.en.json';
import presetsDe from './presets.de.json';
import fieldsEn from './fields.en.json';
import fieldsDe from './fields.de.json';
import serverMessagesDe from './server-messages.de.json';
import panelEn from './panel.en.json';
import panelDe from './panel.de.json';

// Legacy API message IDs are English strings. Translate known IDs without
// changing persisted diagnostics or the wire contract. Unknown text stays literal.
const serverMessagesEn = Object.fromEntries(Object.keys(serverMessagesDe).map((message) => [message, message]));

// Recognize only templates emitted by our legacy API. Captured identifiers and
// values remain data; the surrounding message follows the core language.
const serverMessagePatterns: {
  pattern: RegExp;
  key: string;
  parameters: string[];
  referenceParameter?: string;
}[] = [
  {
    pattern: /^Uploading runtime bundle: (\d+(?:\.\d+)?)%\.$/,
    key: 'Uploading runtime bundle: {{percent}}%.',
    parameters: ['percent'],
  },
  { pattern: /^version must be (\d+)$/, key: 'version must be {{version}}', parameters: ['version'] },
  { pattern: /^duplicate id (.+)$/, key: 'duplicate id {{id}}', parameters: ['id'] },
  { pattern: /^must be one of: (.+)$/, key: 'must be one of: {{values}}', parameters: ['values'] },
  { pattern: /^duplicate capability (.+)$/, key: 'duplicate capability {{capability}}', parameters: ['capability'] },
  { pattern: /^(.+) must be an (array|object)$/, key: '{{path}} must be an {{type}}', parameters: ['path', 'type'] },
  {
    pattern: /^(logical channel|physical point) (.*) does not exist in this snapshot$/,
    key: '{{type}} {{id}} does not exist in this snapshot',
    parameters: ['type', 'id'],
    referenceParameter: 'id',
  },
  {
    pattern: /^(D[IO]\d+) requires an (input|output) channel$/,
    key: '{{terminal}} requires an {{direction}} channel',
    parameters: ['terminal', 'direction'],
  },
  {
    pattern: /^configure (pulse|guard|feedback|measurement) settings for this capability$/,
    key: 'configure {{capability}} settings for this capability',
    parameters: ['capability'],
  },
  {
    pattern: /^(.+); controller (.+); application (.+); skew (.+)s; action (.+)\.$/,
    key: '{{result}}; controller {{controller}}; application {{application}}; skew {{skew}}s; action {{action}}.',
    parameters: ['result', 'controller', 'application', 'skew', 'action'],
  },
];

export const wagoTranslations = {
  en: {
    ...serverMessagesEn,
    ...en,
    commissioningUI: commissioningEn,
    editor: editorEn,
    revisions: revisionsEn,
    artifacts: artifactsEn,
    diagnostics: diagnosticsEn,
    channels: channelsEn,
    modbus: modbusEn,
    security: securityEn,
    presets: presetsEn,
    fields: fieldsEn,
    panel: panelEn,
  },
  de: {
    ...serverMessagesDe,
    ...de,
    commissioningUI: commissioningDe,
    editor: editorDe,
    revisions: revisionsDe,
    artifacts: artifactsDe,
    diagnostics: diagnosticsDe,
    channels: channelsDe,
    modbus: modbusDe,
    security: securityDe,
    presets: presetsDe,
    fields: fieldsDe,
    panel: panelDe,
  },
};

export const useWagoTranslations = () => {
  const translations = useTranslations(wagoTranslations, { escapeValues: false });
  const translateBackendMessage = (message: string | null | undefined, referenceNames?: Record<string, string>) => {
    if (!message) return '';
    for (const { pattern, key, parameters, referenceParameter } of serverMessagePatterns) {
      const match = message.match(pattern);
      if (!match) continue;
      const data = Object.fromEntries(
        parameters.map((parameter, index) => {
          const value = match[index + 1];
          const label = ['type', 'direction', 'capability', 'result', 'action'].includes(parameter);
          return [
            parameter,
            parameter === referenceParameter && referenceNames?.[value]
              ? referenceNames[value]
              : label && translations.tExists(value)
                ? translations.t(value)
                : value,
          ];
        }),
      );
      return translations.t(key, data);
    }
    return translations.tExists(message) ? translations.t(message) : message;
  };
  return {
    ...translations,
    tBackendMessage: (message: string | null | undefined) => translateBackendMessage(message),
    tValidationMessage: translateBackendMessage,
  };
};
