import {
  Description,
  Input,
  InputGroup,
  Label,
  TextArea,
  TextField,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../../../../components/button';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PermissionMappingsSection } from './PermissionMappingsSection';
import { SSOProviderFormApi } from '../useSSOProviderForm';
import en from '../en.json';
import de from '../de.json';

interface SAMLConfigFormProps {
  form: SSOProviderFormApi;
}

export const SAMLConfigForm = ({ form }: SAMLConfigFormProps) => {
  const { t } = useTranslations({ en, de });
  const {
    formValues,
    setSaml,
    emailAttributeKeysInput,
    setEmailAttributeKeysInput,
    showSamlProvisioningSecret,
    setShowSamlProvisioningSecret,
    samlPermissionMappingsInput,
    setSamlPermissionMappingsInput,
    handleSamlToggleChange,
    providerDetails,
    roles,
    isLoadingRoles,
  } = form;

  return (
    <>
      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('sections.samlIdentityProvider')}
        </h3>
        <TextField
          isRequired
          value={formValues.samlConfiguration?.entryPoint ?? ''}
          onChange={(v) => setSaml('entryPoint', v)}
        >
          <Label>{t('entryPoint')}</Label>
          <Input
            placeholder="https://idp.example.com/realms/master/protocol/saml"
            data-cy="sso-provider-form-saml-entry-point-input"
          />
        </TextField>

        <TextField
          isRequired
          value={formValues.samlConfiguration?.issuer ?? ''}
          onChange={(v) => setSaml('issuer', v)}
        >
          <Label>{t('issuer')}</Label>
          <Input placeholder={window.location.origin ?? ''} data-cy="sso-provider-form-saml-issuer-input" />
        </TextField>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t('certificate')}</label>
          <TextArea
            name="samlConfiguration.certificate"
            value={formValues.samlConfiguration?.certificate ?? ''}
            onChange={(e) => setSaml('certificate', e.target.value)}
            placeholder="MIICmzCCAYMCBg..."
            required
            data-cy="sso-provider-form-saml-certificate-input"
          />
          <p className="text-xs text-default-500">{t('certificateHint')}</p>
        </div>

        <TextField value={formValues.samlConfiguration?.audience ?? ''} onChange={(v) => setSaml('audience', v)}>
          <Label>{t('audience')}</Label>
          <Input placeholder={window.location.origin ?? ''} data-cy="sso-provider-form-saml-audience-input" />
        </TextField>
      </section>

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('sections.samlAttributes')}
        </h3>
        <TextField value={emailAttributeKeysInput} onChange={setEmailAttributeKeysInput}>
          <Label>{t('emailAttributeKeys')}</Label>
          <Input
            placeholder="email, mail, urn:oid:1.2.840.113549.1.9.1"
            data-cy="sso-provider-form-saml-email-attribute-keys-input"
          />
          <Description>{t('emailAttributeKeysHint')}</Description>
        </TextField>
      </section>

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('sections.samlProvisioning')}
        </h3>
        <TextField
          value={formValues.samlConfiguration?.provisioningSecret ?? ''}
          onChange={(v) => setSaml('provisioningSecret', v)}
        >
          <Label>{t('samlProvisioningSecret')}</Label>
          <InputGroup>
            <Input
              type={showSamlProvisioningSecret ? 'text' : 'password'}
              placeholder="••••••••••••••••"
              data-cy="sso-provider-form-saml-provisioning-secret-input"
            />
            <Tooltip>
              <Button
                variant="ghost"
                isIconOnly
                onPress={() => setShowSamlProvisioningSecret(!showSamlProvisioningSecret)}
                data-cy="sso-provider-form-saml-provisioning-secret-toggle-button"
              >
                {showSamlProvisioningSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
              <TooltipContent>
                {showSamlProvisioningSecret ? t('hideSamlProvisioningSecret') : t('showSamlProvisioningSecret')}
              </TooltipContent>
            </Tooltip>
          </InputGroup>
          <Description>{t('samlProvisioningSecretHint')}</Description>
        </TextField>
      </section>

      <PermissionMappingsSection
        variant="saml"
        roles={roles}
        isLoadingRoles={isLoadingRoles}
        values={samlPermissionMappingsInput}
        onChange={(key, value) => setSamlPermissionMappingsInput((prev) => ({ ...prev, [key]: value }))}
      />

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.samlSigning')}</h3>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t('spSigningCertificate')}</label>
          <TextArea
            name="samlConfiguration.spSigningCertificate"
            value={formValues.samlConfiguration?.spSigningCertificate ?? ''}
            onChange={(e) => setSaml('spSigningCertificate', e.target.value)}
            placeholder="MIICmzCCAYMCBg..."
            data-cy="sso-provider-form-saml-sp-certificate-input"
          />
          <p className="text-xs text-default-500">{t('spSigningCertificateHint')}</p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t('spSigningPrivateKey')}</label>
          <TextArea
            name="samlConfiguration.spSigningPrivateKey"
            value={formValues.samlConfiguration?.spSigningPrivateKey ?? ''}
            onChange={(e) => setSaml('spSigningPrivateKey', e.target.value)}
            placeholder="-----BEGIN PRIVATE KEY-----"
            data-cy="sso-provider-form-saml-sp-private-key-input"
          />
          <p className="text-xs text-default-500">
            {providerDetails?.samlConfiguration?.spSigningKeyEncrypted
              ? t('spSigningPrivateKeyHintExisting')
              : t('spSigningPrivateKeyHint')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LabeledSwitch
            isSelected={formValues.samlConfiguration?.signRequest ?? false}
            onChange={(value) => handleSamlToggleChange('signRequest', value)}
            data-cy="sso-provider-form-saml-sign-request-switch"
          >
            {t('signRequest')}
          </LabeledSwitch>
          <LabeledSwitch
            isSelected={formValues.samlConfiguration?.wantAssertionsSigned ?? false}
            onChange={(value) => handleSamlToggleChange('wantAssertionsSigned', value)}
            data-cy="sso-provider-form-saml-assertions-signed-switch"
          >
            {t('wantAssertionsSigned')}
          </LabeledSwitch>
          <LabeledSwitch
            isSelected={formValues.samlConfiguration?.wantAuthnResponseSigned ?? true}
            onChange={(value) => handleSamlToggleChange('wantAuthnResponseSigned', value)}
            data-cy="sso-provider-form-saml-response-signed-switch"
          >
            {t('wantAuthnResponseSigned')}
          </LabeledSwitch>
          <LabeledSwitch
            isSelected={formValues.samlConfiguration?.forceAuthn ?? false}
            onChange={(value) => handleSamlToggleChange('forceAuthn', value)}
            data-cy="sso-provider-form-saml-force-authn-switch"
          >
            {t('forceAuthn')}
          </LabeledSwitch>
        </div>
      </section>
    </>
  );
};
