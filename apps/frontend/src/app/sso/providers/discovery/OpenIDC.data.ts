export interface OpenIDConfiguration {
  issuer: string;
  end_session_endpoint?: string;
  jwks_uri?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  [key: string]: unknown;
}
