import { useState } from 'react';
import { Button, FieldError, Input, TextField } from '@heroui/react';
import { PlusIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { containsRange, isValidRange, splitRangeInput } from './networkRange';
import en from './en.json';
import de from './de.json';

interface AllowedRangesInputProps {
  existing: readonly string[];
  onAdd: (entries: string[]) => void;
  isInvalid?: boolean;
}

/** One input plus Add for allowed ranges. A bad or duplicate entry is named inline and nothing is added. */
export function AllowedRangesInput({ existing, onAdd, isInvalid = false }: Readonly<AllowedRangesInputProps>) {
  const { t } = useTranslations({ en, de });
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const entries = splitRangeInput(text);
    if (entries.length === 0) return;
    const bad = entries.find((entry) => !isValidRange(entry));
    if (bad !== undefined) {
      setProblem(t('ranges.invalid', { entry: bad }));
      return;
    }
    const fresh = entries.filter(
      (entry, index) => !containsRange(existing, entry) && !containsRange(entries.slice(0, index), entry),
    );
    if (fresh.length === 0) {
      setProblem(t('ranges.duplicate', { entry: entries[0] }));
      return;
    }
    onAdd(fresh);
    setText('');
    setProblem(null);
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-start gap-2">
        <TextField
          fullWidth
          value={text}
          onBlur={() => {
            // Text left in the field would be lost with the page: add it if it is valid, otherwise leave the error for later.
            if (text.trim() !== '' && splitRangeInput(text).every(isValidRange)) submit();
          }}
          onChange={(next) => {
            setText(next);
            setProblem(null);
          }}
          isInvalid={problem !== null || isInvalid}
          aria-label={t('ranges.inputLabel')}
          className="min-w-0 flex-1"
        >
          <Input
            fullWidth
            placeholder={t('ranges.placeholder')}
            data-testid="network-range-input"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              submit();
            }}
          />
          {problem !== null && <FieldError>{problem}</FieldError>}
        </TextField>
        <Button variant="secondary" onPress={submit} isDisabled={text.trim() === ''}>
          <PlusIcon className="h-4 w-4" />
          {t('ranges.add')}
        </Button>
      </div>
    </div>
  );
}
