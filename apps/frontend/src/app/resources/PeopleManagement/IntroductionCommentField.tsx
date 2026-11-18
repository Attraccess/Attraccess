import { useEffect, useState } from 'react';
import { Label, TextArea, TextField } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface IntroductionCommentFieldProps {
  message: string;
  onCommentChange: (comment: string) => void;
}

/** Body of the introduction revoke/re-grant confirmation: the question and an optional comment. */
export function IntroductionCommentField({ message, onCommentChange }: Readonly<IntroductionCommentFieldProps>) {
  const { t } = useTranslations({ en, de });
  const [comment, setComment] = useState('');

  // Every opening of the dialog starts without a comment.
  useEffect(() => onCommentChange(''), [onCommentChange]);

  return (
    <div className="flex flex-col gap-4">
      <p>{message}</p>
      <TextField
        value={comment}
        onChange={(value) => {
          setComment(value);
          onCommentChange(value);
        }}
        className="w-full"
        data-cy="people-introduction-comment"
      >
        <Label>{t('addModal.commentLabel')}</Label>
        <TextArea />
      </TextField>
    </div>
  );
}
