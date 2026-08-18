export enum AuthenticationType {
  LOCAL_PASSWORD = 'local_password',
  SSO = 'sso',
  TOTP = 'totp',
  /**
   * Guest TOTP credential. Kept distinct from the member 2FA `TOTP` type so the
   * second-factor gate never treats a guest's primary credential as a second factor.
   */
  GUEST_OTP = 'guest_otp',
}
