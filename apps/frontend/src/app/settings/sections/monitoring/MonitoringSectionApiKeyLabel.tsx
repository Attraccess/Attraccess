import {
  Alert,
  AlertContent,
  AlertDescription,
  Chip,
  InputGroup,
  NumberField,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldDecrementButton,
  NumberFieldInput,
  TextField,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { ClipboardCopyIcon, KeyIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { SettingsRow } from '../../components/SettingsRow';
import { Button } from '../../../../components/button';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { TOGGLE_ORDER } from './index.toggle-order';
import { useMonitoringSectionState } from './useMonitoringSectionState';
type Props = Pick<
  ReturnType<typeof useMonitoringSectionState>,
  | 'generatedKey'
  | 't'
  | 'copyToClipboard'
  | 'setGeneratedKey'
  | 'isGenerating'
  | 'metricsSettings'
  | 'rerollModal'
  | 'generateApiKey'
  | 'removeModal'
  | 'isUpdatingToggles'
  | 'pendingToggle'
  | 'setPendingToggle'
  | 'updateToggle'
  | 'threshold'
  | 'setThresholdDraft'
>;
export function MonitoringSectionApiKeyLabel({
  generatedKey,
  t,
  copyToClipboard,
  setGeneratedKey,
  isGenerating,
  metricsSettings,
  rerollModal,
  generateApiKey,
  removeModal,
  isUpdatingToggles,
  pendingToggle,
  setPendingToggle,
  updateToggle,
  threshold,
  setThresholdDraft,
}: Props) {
  return (
    <div className="flex flex-col">
      <SettingsRow stacked={!!generatedKey} label={t('apiKeyLabel')} hint={t('description')}>
        {generatedKey ? (
          <div className="flex w-full flex-col gap-2">
            {/* HeroUI's own warning surface, not `text-warning-600` — v2's numbered colour
                  scales compile to nothing under v3 (ATT-858). */}
            <Alert status="warning">
              <AlertStatusIcon status="warning" />
              <AlertContent>
                <AlertDescription>{t('warning')}</AlertDescription>
              </AlertContent>
            </Alert>
            <TextField value={generatedKey} isReadOnly aria-label={t('apiKeyLabel')}>
              <InputGroup>
                <InputGroup.Input className="font-mono text-sm" />
                <InputGroup.Suffix>
                  <Tooltip>
                    <Button
                      variant="ghost"
                      isIconOnly
                      aria-label={t('copyButton')}
                      onPress={() => copyToClipboard(generatedKey, t('copied.title'), t('copied.description'))}
                    >
                      <ClipboardCopyIcon size={16} />
                    </Button>
                    <TooltipContent>{t('copyButton')}</TooltipContent>
                  </Tooltip>
                </InputGroup.Suffix>
              </InputGroup>
            </TextField>
            <Button variant="secondary" size="sm" onPress={() => setGeneratedKey(null)}>
              {t('doneButton')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              isPending={isGenerating}
              onPress={() => (metricsSettings?.apiKeyConfigured ? rerollModal.open() : generateApiKey())}
            >
              {metricsSettings?.apiKeyConfigured ? <RefreshCwIcon size={16} /> : <KeyIcon size={16} />}
              {metricsSettings?.apiKeyConfigured ? t('rerollButton') : t('generateButton')}
            </Button>
            {metricsSettings?.apiKeyConfigured && (
              <Button variant="danger-soft" size="sm" onPress={removeModal.open}>
                <Trash2Icon size={16} />
                {t('removeButton')}
              </Button>
            )}
          </div>
        )}
      </SettingsRow>

      {metricsSettings?.toggles &&
        TOGGLE_ORDER.map((subsystem) => (
          <SettingsRow
            key={subsystem}
            data-testid={`metrics-toggle-row-${subsystem}`}
            label={
              <span className="flex items-center gap-2">
                {t(`toggles.${subsystem}.label`)}
                {subsystem === 'db' && (
                  <Chip size="sm" color="warning">
                    {t('toggles.highCostBadge')}
                  </Chip>
                )}
              </span>
            }
            hint={t(`toggles.${subsystem}.description`)}
          >
            {/* The row owns the layout, so the switch no longer needs the old
                  `contentClassName="w-full items-start"` workaround to stay put. */}
            <LabeledSwitch
              data-testid={`metrics-toggle-${subsystem}`}
              aria-label={t(`toggles.${subsystem}.label`)}
              isSelected={metricsSettings.toggles[subsystem]}
              isDisabled={isUpdatingToggles && pendingToggle !== null}
              onChange={(value) => {
                setPendingToggle(subsystem);
                updateToggle({ requestBody: { toggles: { [subsystem]: value } } });
              }}
            />
          </SettingsRow>
        ))}

      <SettingsRow label={t('slowQueryThreshold.title')} hint={t('slowQueryThreshold.description')}>
        <NumberField
          value={threshold}
          onChange={setThresholdDraft}
          minValue={0}
          step={0.1}
          aria-label={t('slowQueryThreshold.label')}
        >
          <NumberFieldGroup>
            <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
            <NumberFieldInput />
            <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
          </NumberFieldGroup>
        </NumberField>
      </SettingsRow>
    </div>
  );
}
