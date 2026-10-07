import { Props } from './index.props';

export function propertyDescription<TValue>(props: Props<TValue>): React.ReactNode {
  const { schema, nodeType, name, tNodeTranslations: t, tNodeExists } = props;
  const helpTextKey = `nodes.${nodeType}.config.${name}.helpText`;
  const docsUrlKey = `nodes.${nodeType}.config.${name}.docsUrl`;
  const docsLabelKey = `nodes.${nodeType}.config.${name}.docsLabel`;
  const helpText = tNodeExists?.(helpTextKey) ? t(helpTextKey) : undefined;
  const docsUrl = tNodeExists?.(docsUrlKey) ? t(docsUrlKey) : undefined;
  const docsLabel = tNodeExists?.(docsLabelKey) ? t(docsLabelKey) : docsUrl;

  let description: React.ReactNode = schema.description
    ? `${schema.description}${schema.unit ? ` (${schema.unit})` : ''}`
    : schema.unit;
  if (schema.overrideWithInput) {
    description = (
      <>
        {description}
        <br />
        {t('nodes.genericConfig.overridableByInput', { fieldName: schema.overrideWithInput })}
      </>
    );
  }
  if (helpText || docsUrl) {
    description = (
      <span className="flex flex-col gap-0.5">
        {description ? <span>{description}</span> : null}
        {helpText ? <span>{helpText}</span> : null}
        {docsUrl ? (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary-500 hover:underline w-fit"
          >
            {docsLabel}
          </a>
        ) : null}
      </span>
    );
  }

  return description;
}
