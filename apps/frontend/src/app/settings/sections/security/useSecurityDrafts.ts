import { Dispatch, SetStateAction, useState } from 'react';
import { AuthRateLimitSettingsDto, PasswordPolicyDto, TwoFactorPolicy } from '@attraccess/react-query-client';

export interface SecurityDrafts {
  policyDraft: Partial<PasswordPolicyDto>;
  setPolicyDraft: Dispatch<SetStateAction<Partial<PasswordPolicyDto>>>;
  rateDraft: Partial<AuthRateLimitSettingsDto>;
  setRateDraft: Dispatch<SetStateAction<Partial<AuthRateLimitSettingsDto>>>;
  twoFactorDraft: TwoFactorPolicy | undefined;
  setTwoFactorDraft: (policy: TwoFactorPolicy | undefined) => void;
  domainsDraft: string[] | undefined;
  setDomainsDraft: (domains: string[] | undefined) => void;
  domainToAdd: string;
  setDomainToAdd: (value: string) => void;
  discard: () => void;
}

/**
 * The unsaved edits of all four security groups. Shared because each group's form writes its own
 * draft while the single save bar commits and discards them together and the aside preview reads the
 * policy draft. Derived drafts: an untouched field falls back to the server's value, so a background
 * refetch cannot overwrite an edit the operator has not saved yet (ATT-868).
 */
export function useSecurityDrafts(): SecurityDrafts {
  const [policyDraft, setPolicyDraft] = useState<Partial<PasswordPolicyDto>>({});
  const [rateDraft, setRateDraft] = useState<Partial<AuthRateLimitSettingsDto>>({});
  const [twoFactorDraft, setTwoFactorDraft] = useState<TwoFactorPolicy | undefined>();
  const [domainsDraft, setDomainsDraft] = useState<string[] | undefined>();
  const [domainToAdd, setDomainToAdd] = useState('');

  const discard = () => {
    setPolicyDraft({});
    setRateDraft({});
    setTwoFactorDraft(undefined);
    setDomainsDraft(undefined);
    setDomainToAdd('');
  };

  return {
    policyDraft,
    setPolicyDraft,
    rateDraft,
    setRateDraft,
    twoFactorDraft,
    setTwoFactorDraft,
    domainsDraft,
    setDomainsDraft,
    domainToAdd,
    setDomainToAdd,
    discard,
  };
}
