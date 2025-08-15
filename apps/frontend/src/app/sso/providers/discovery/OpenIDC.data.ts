export interface OpenIDConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  [key: string]: unknown;
}
