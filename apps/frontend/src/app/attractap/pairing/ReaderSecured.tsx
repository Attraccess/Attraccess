import { Chip } from '@heroui/react';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Attractap } from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';

/** Readers of the plain build take no part in the secure profile: nothing is shown for them. */
export const showsSecuredState = (reader: Pick<Attractap, 'firmwareProfile'>) =>
  reader.firmwareProfile === 'secure' || reader.firmwareProfile === 'secure-lab';

/** The server's verdict on the reader's eFuse report: secured, or what does not match the secure profile. */
export function ReaderSecured(props: Readonly<{ reader: Attractap }>) {
  const { reader } = props;
  const { t } = useTranslations({ de, en });
  const format = useDateTimeFormatter();
  if (!showsSecuredState(reader)) return null;
  const problems = reader.securityReportProblems ?? [];
  const checked = reader.securityReportCheckedAt !== null;

  return (
    <div className="flex flex-col gap-2" data-cy="attractap-secured">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('secured.title')}</h3>
        <Chip color={reader.secured ? 'success' : 'default'} data-cy={`attractap-secured-${reader.secured}`}>
          {reader.secured
            ? t('secured.secured')
            : reader.firmwareProfile === 'secure-lab'
              ? t('secured.labKey')
              : t('secured.notSecured')}
        </Chip>
      </div>
      <p className="text-sm text-default-500">
        {t(`secured.profile.${reader.firmwareProfile as 'secure' | 'secure-lab'}`)}
      </p>
      <p className="text-sm text-default-500">{t('secured.hint')}</p>
      {checked ? (
        <p className="text-sm">
          {t('secured.checkedAt')}: {format(reader.securityReportCheckedAt as string)}
        </p>
      ) : (
        <p className="text-sm text-default-500">{t('secured.notChecked')}</p>
      )}
      {problems.length > 0 && (
        <div className="flex flex-col gap-1" data-cy="attractap-secured-problems">
          <h4 className="text-sm font-medium">{t('secured.problems')}</h4>
          <ul className="list-disc pl-5 text-sm">
            {problems.map((problem) => (
              <li key={problem}>{t(`secured.problem.${problem}`)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
