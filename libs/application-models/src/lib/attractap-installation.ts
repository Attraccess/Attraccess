/** The installation identity: CA and server certificate. Private keys are stored encrypted. */
export interface AttractapInstallationRecord {
  installationId: string;
  caCertificatePem: string;
  caPrivateKeyEncrypted: string;
  serverCertificatePem: string;
  serverPrivateKeyEncrypted: string;
  serverCertificateNotAfter: Date;
}
