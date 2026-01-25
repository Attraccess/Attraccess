export interface SigningMaterialContext {
  isSigningEnabled: boolean;
  storedCertificate?: string | null;
  storedKey?: string | null;
  inputCertificate?: string | null;
  inputPrivateKey?: string | null;
}

const trimValue = (value?: string | null): string => value?.trim() ?? '';

export const hasRequiredSamlSigningMaterial = ({
  isSigningEnabled,
  storedCertificate,
  storedKey,
  inputCertificate,
  inputPrivateKey,
}: SigningMaterialContext): boolean => {
  if (!isSigningEnabled) {
    return true;
  }

  const storedCert = trimValue(storedCertificate);
  const storedKeyAvailable = Boolean(storedKey);
  const inputCert = trimValue(inputCertificate);
  const inputKey = trimValue(inputPrivateKey);

  const certificateChanged = Boolean(storedCert) && Boolean(inputCert) && storedCert !== inputCert;
  const requiresNewPair = !storedCert || !storedKeyAvailable || certificateChanged || Boolean(inputKey);

  const hasCertificate = Boolean(storedCert) || Boolean(inputCert);
  const hasKey = storedKeyAvailable || Boolean(inputKey);

  if (!hasCertificate || !hasKey) {
    return false;
  }

  if (!requiresNewPair) {
    return true;
  }

  return Boolean(inputCert) && Boolean(inputKey);
};


