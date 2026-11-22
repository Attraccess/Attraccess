import { Button, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Description, FieldError, Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { CameraScanner } from './CameraScanner';
import { ImageUpload } from './ImageUpload';
import { setupCodeFromScan } from './qrDecode';
import { parseSetupCode } from './setupCode';
import { StepHeading } from './StepHeading';

const SOURCES = ['camera', 'image', 'type'] as const;
type Source = (typeof SOURCES)[number];

/**
 * Step 2: the setup code from the camera, a picture or the keyboard. Every source ends in the same field, so every form
 * leads to the same request. The code is checked locally first (check digit, `MT:` format) and an invalid code never
 * leaves the browser. It lives in this component's state only: no storage, no URL, no cache. `error` is the translated
 * text of a refused start.
 */
export function CodeEntryStep({
  starting,
  error,
  onStart,
}: Readonly<{ starting: boolean; error: string | null; onStart: (code: string) => void }>) {
  const { t } = useMatterTranslations();
  const [source, setSource] = useState<Source>('type');
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const parsed = parseSetupCode(value);
  const invalid = touched && !parsed.ok;

  const received = (text: string) => {
    setValue(setupCodeFromScan(text));
    setTouched(true);
    setSource('type');
  };

  const submit = () => {
    setTouched(true);
    if (parsed.ok) onStart(parsed.code);
  };

  return (
    <form
      className="mt:flex mt:flex-col mt:gap-4"
      noValidate
      onSubmit={(event) => {
        // Enter in the field submits like the button; the page itself never reloads.
        event.preventDefault();
        submit();
      }}
      data-cy="matter-code-step"
    >
      <StepHeading>{t('commissioning.code.title')}</StepHeading>
      <div className="mt:flex mt:flex-wrap mt:gap-2" role="group" aria-label={t('commissioning.code.sources')}>
        {SOURCES.map((entry) => (
          <Button
            key={entry}
            size="sm"
            variant={source === entry ? 'primary' : 'tertiary'}
            aria-pressed={source === entry}
            onPress={() => setSource(entry)}
            data-cy={`matter-code-source-${entry}`}
          >
            {t(`commissioning.code.source.${entry}`)}
          </Button>
        ))}
      </div>
      {source === 'camera' && <CameraScanner onScan={received} />}
      {source === 'image' && <ImageUpload onScan={received} />}
      <TextField
        value={value}
        onChange={(next) => {
          setValue(next);
          setTouched(false);
        }}
        isInvalid={invalid}
        data-cy="matter-code-field"
      >
        <Label>{t('commissioning.code.label')}</Label>
        <Input
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          data-1p-ignore
          placeholder="MT:… / 3497 011 2332"
          data-cy="matter-code-input"
        />
        <Description>{t('commissioning.code.hint')}</Description>
        <FieldError data-cy="matter-code-error">
          {t(`commissioning.code.problem.${parsed.problem ?? 'empty'}`)}
        </FieldError>
      </TextField>
      <div>
        <Button variant="primary" type="submit" isPending={starting} data-cy="matter-code-start">
          {t('commissioning.code.start')}
        </Button>
      </div>
      {error && (
        <StatusAlert status="danger" title={t('commissioning.code.failed')} data-cy="matter-code-request-error">
          {error}
        </StatusAlert>
      )}
    </form>
  );
}
