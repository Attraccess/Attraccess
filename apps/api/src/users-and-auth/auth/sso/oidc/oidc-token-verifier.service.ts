import { BadRequestException, Injectable } from '@nestjs/common';
import { SSOProviderOIDCConfiguration } from '@attraccess/database-entities';
import axios from 'axios';
import { createLocalJWKSet, jwtVerify, JWTPayload, JSONWebKeySet } from 'jose';
import { OIDC_SIGNING_ALGORITHMS, trustedEndpoint } from '../logout-endpoints';

const CACHE_MS = 300_000;
interface Metadata {
  issuer: string;
  jwks_uri?: string;
  end_session_endpoint?: string;
}

/** Only unavailable optional metadata permits the legacy OAuth login path. */
export class OidcVerificationUnavailableError extends Error {}

@Injectable()
export class OidcTokenVerifier {
  private readonly cache = new Map<string, { expires: number; value: unknown }>();

  private configKey(config: SSOProviderOIDCConfiguration): string {
    return (
      JSON.stringify([
        config.ssoProviderId,
        config.updatedAt,
        config.issuer,
        config.jwksURL,
        config.endSessionURL,
        config.signingAlgorithms,
      ]) + ':'
    );
  }

  private async fetchJson<T>(url: string, refresh = false, scope = ''): Promise<T> {
    trustedEndpoint(url);
    const cacheKey = scope + url;
    const cached = this.cache.get(cacheKey);
    if (!refresh && cached && cached.expires > Date.now()) return cached.value as T;
    const response = await axios.get<T>(url, {
      timeout: 4000,
      maxContentLength: 262144,
      maxBodyLength: 262144,
      maxRedirects: 0,
      responseType: 'json',
    });
    if (!response.data || typeof response.data !== 'object') throw new BadRequestException('Invalid provider metadata');
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(cacheKey, { expires: Date.now() + CACHE_MS, value: response.data });
    return response.data;
  }

  async metadata(
    config: SSOProviderOIDCConfiguration,
    includeEndSession = false,
  ): Promise<{ jwksURL: string; endSessionURL?: string }> {
    // Configuration is read afresh per call. Changing explicit endpoints takes effect immediately.
    let discovered: Metadata | undefined;
    if (!config.jwksURL || (includeEndSession && !config.endSessionURL)) {
      const issuer = trustedEndpoint(config.issuer);
      issuer.pathname = issuer.pathname.replace(/\/$/, '') + '/.well-known/openid-configuration';
      issuer.search = '';
      try {
        discovered = await this.fetchJson<Metadata>(issuer.toString(), false, this.configKey(config));
      } catch (error) {
        if (axios.isAxiosError(error) && !config.jwksURL)
          throw new OidcVerificationUnavailableError('OIDC verification metadata unavailable');
        throw error;
      }
      if (discovered.issuer !== config.issuer) throw new BadRequestException('OIDC discovery issuer mismatch');
    }
    const jwksURL = config.jwksURL || discovered?.jwks_uri;
    const endSessionURL = config.endSessionURL || discovered?.end_session_endpoint;
    if (!jwksURL) throw new OidcVerificationUnavailableError('Provider JWKS endpoint unavailable');
    trustedEndpoint(jwksURL);
    if (endSessionURL) trustedEndpoint(endSessionURL);
    return { jwksURL, endSessionURL };
  }

  async verify(token: string, config: SSOProviderOIDCConfiguration, logout = false): Promise<JWTPayload> {
    if (typeof token !== 'string' || token.length > 32768) throw new BadRequestException('Invalid OIDC token');
    const algorithms = config.signingAlgorithms?.length ? config.signingAlgorithms : ['RS256'];
    if (algorithms.some((algorithm) => !OIDC_SIGNING_ALGORITHMS.includes(algorithm)))
      throw new BadRequestException('Unsupported OIDC signing algorithm');
    let jwksURL: string;
    try {
      ({ jwksURL } = await this.metadata(config));
    } catch (error) {
      // Optional verification metadata was not usable. Existing OAuth/userinfo
      // logins may continue without recording any token claims or SSO context.
      if (!config.jwksURL) throw new OidcVerificationUnavailableError('OIDC verification metadata unavailable');
      throw error;
    }
    const options = {
      issuer: config.issuer,
      audience: config.clientId,
      algorithms,
      clockTolerance: 30,
      requiredClaims: logout ? ['iss', 'aud', 'iat', 'exp', 'jti', 'events'] : ['iss', 'sub', 'aud', 'iat', 'exp'],
      ...(logout ? { maxTokenAge: '5m' } : {}),
    };
    let keys: JSONWebKeySet;
    try {
      keys = await this.fetchJson<JSONWebKeySet>(jwksURL, false, this.configKey(config));
    } catch (error) {
      if (axios.isAxiosError(error) && !config.jwksURL)
        throw new OidcVerificationUnavailableError('OIDC verification keys unavailable');
      throw error;
    }
    try {
      return (await jwtVerify(token, createLocalJWKSet(keys), options)).payload;
    } catch (error) {
      // Key rotation: retry only when the trusted JWKS lacks the token's key; never fetch token-provided URLs.
      if ((error as { code?: string }).code !== 'ERR_JWKS_NO_MATCHING_KEY') throw error;
      const receipt = `${this.configKey(config)}${jwksURL}:refresh`;
      if ((this.cache.get(receipt)?.expires ?? 0) > Date.now()) throw error;
      this.cache.set(receipt, { expires: Date.now() + 5000, value: true });
      keys = await this.fetchJson<JSONWebKeySet>(jwksURL, true, this.configKey(config));
      return (await jwtVerify(token, createLocalJWKSet(keys), options)).payload;
    }
  }
}
