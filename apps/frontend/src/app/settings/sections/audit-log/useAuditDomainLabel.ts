import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { humanize, pluginDomainLabel, pluginDomains } from './audit-log-model';
import { useAuditLogMeta } from './useAuditLogMeta';
import en from './en.json';
import de from './de.json';

/** Returns a function that renders an audit domain id as a label (plugin label, translation, or humanized id). */
export function useAuditDomainLabel() {
  const { t, language } = useTranslations({ en, de });
  const meta = useAuditLogMeta();
  const pluginDomainEntries = pluginDomains(meta.data);
  return (domain: string) =>
    pluginDomainLabel(pluginDomainEntries.find((entry) => entry.id === domain)?.labels, language) ??
    (Object.hasOwn(en.domains, domain) ? t(`domains.${domain}`) : humanize(domain));
}
