import { SAML, Profile, SamlConfig } from '@node-saml/node-saml';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { inflateRawSync } from 'node:zlib';
import { BadRequestException } from '@nestjs/common';

const PROTOCOL = 'urn:oasis:names:tc:SAML:2.0:protocol';
const ASSERTION = 'urn:oasis:names:tc:SAML:2.0:assertion';
const STATUS = 'urn:oasis:names:tc:SAML:2.0:status:';
const TOP_LEVEL_STATUSES = new Set(
  ['Success', 'Requester', 'Responder', 'VersionMismatch'].map((code) => STATUS + code),
);
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';

function parse(xml: string): Document {
  if (Buffer.byteLength(xml) > 262144 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new BadRequestException('Invalid SAML XML');
  return new DOMParser({
    errorHandler: {
      warning: () => {
        throw new Error('Invalid XML');
      },
      error: () => {
        throw new Error('Invalid XML');
      },
      fatalError: () => {
        throw new Error('Invalid XML');
      },
    },
  }).parseFromString(xml, 'text/xml') as unknown as Document;
}

function children(root: Element, namespace: string, name: string): Element[] {
  return Array.from(root.childNodes).filter(
    (node): node is Element =>
      node.nodeType === 1 && (node as Element).namespaceURI === namespace && (node as Element).localName === name,
  );
}

export interface SamlLogoutMessage {
  kind: 'request' | 'response';
  issuer: string;
  id: string;
  inResponseTo?: string;
  issueInstant: number;
  status?: string;
  subStatusCodes?: string[];
  nameID?: string;
  nameIDFormat?: string;
  nameQualifier?: string;
  spNameQualifier?: string;
  sessionIndexes: string[];
}

function assertLogoutRoot(root: Element, request: boolean): void {
  if (
    root.namespaceURI !== PROTOCOL ||
    root.localName !== (request ? 'LogoutRequest' : 'LogoutResponse') ||
    root.getAttribute('Version') !== '2.0'
  )
    throw new BadRequestException('Invalid SAML logout root');
}

function assertValidityWindow(root: Element, now: number): void {
  for (const attribute of ['NotBefore', 'NotOnOrAfter']) {
    const value = root.getAttribute(attribute);
    if (
      value &&
      (!Number.isFinite(Date.parse(value)) ||
        (attribute === 'NotBefore' ? Date.parse(value) > now + 30000 : Date.parse(value) <= now - 30000))
    )
      throw new BadRequestException('Expired SAML logout message');
  }
}

/** Checks the protocol envelope shared by LogoutRequest and LogoutResponse. */
function readLogoutEnvelope(
  root: Element,
  request: boolean,
  idpIssuer: string | undefined,
  destination: string,
): SamlLogoutMessage {
  assertLogoutRoot(root, request);
  const issuer = children(root, ASSERTION, 'Issuer');
  const id = root.getAttribute('ID');
  const issueInstant = Date.parse(root.getAttribute('IssueInstant') || '');
  const now = Date.now();
  if (
    !id ||
    id.length > 256 ||
    issuer.length !== 1 ||
    issuer[0].textContent !== idpIssuer ||
    root.getAttribute('Destination') !== destination ||
    !Number.isFinite(issueInstant) ||
    issueInstant > now + 30000 ||
    issueInstant < now - 300000
  )
    throw new BadRequestException('Invalid SAML logout identity, destination or time');
  assertValidityWindow(root, now);
  return {
    kind: request ? 'request' : 'response',
    id,
    issuer: issuer[0].textContent,
    issueInstant,
    sessionIndexes: [],
  };
}

function readLogoutRequest(root: Element, message: SamlLogoutMessage): void {
  const names = children(root, ASSERTION, 'NameID');
  if (names.length !== 1 || !names[0].textContent) throw new BadRequestException('SAML LogoutRequest requires NameID');
  const name = names[0];
  message.nameID = name.textContent;
  message.nameIDFormat = name.getAttribute('Format') || undefined;
  message.nameQualifier = name.getAttribute('NameQualifier') || undefined;
  message.spNameQualifier = name.getAttribute('SPNameQualifier') || undefined;
  message.sessionIndexes = children(root, PROTOCOL, 'SessionIndex').map((node) => node.textContent || '');
  if (message.sessionIndexes.some((index) => !index)) throw new BadRequestException('Invalid SAML SessionIndex');
}

function readSubordinateStatuses(code: Element): string[] {
  const subStatusCodes: string[] = [];
  let nested = children(code, PROTOCOL, 'StatusCode');
  while (nested.length) {
    const value = nested[0].getAttribute('Value');
    if (nested.length !== 1 || !value || TOP_LEVEL_STATUSES.has(value))
      throw new BadRequestException('Invalid SAML subordinate status');
    subStatusCodes.push(value);
    nested = children(nested[0], PROTOCOL, 'StatusCode');
  }
  return subStatusCodes;
}

function readLogoutResponse(root: Element, message: SamlLogoutMessage): void {
  message.inResponseTo = root.getAttribute('InResponseTo') || undefined;
  const statuses = children(root, PROTOCOL, 'Status');
  const codes = statuses.length === 1 ? children(statuses[0], PROTOCOL, 'StatusCode') : [];
  if (!message.inResponseTo || codes.length !== 1 || !codes[0].getAttribute('Value'))
    throw new BadRequestException('SAML LogoutResponse requires correlation and status');
  const status = codes[0].getAttribute('Value') || '';
  if (!TOP_LEVEL_STATUSES.has(status)) throw new BadRequestException('Invalid SAML top-level status');
  message.status = status;
  message.subStatusCodes = readSubordinateStatuses(codes[0]);
  // SAML Core 3.7.3.2: Success describes the authority's session; PartialLogout
  // is a second-level status describing incomplete propagation to participants.
  if (
    message.status === STATUS + 'Success' &&
    message.subStatusCodes.length &&
    message.subStatusCodes[0] !== STATUS + 'PartialLogout'
  )
    throw new BadRequestException('Contradictory SAML logout status');
}

/** Adapter for node-saml 5.1.0. Adds the mandatory SLO checks that its login-oriented methods omit. */
export class SamlLogoutAdapter extends SAML {
  constructor(config: SamlConfig) {
    super({ ...config, signatureAlgorithm: 'sha256', digestAlgorithm: 'sha256', acceptedClockSkewMs: 30000 });
  }

  async request(
    context: {
      nameID: string;
      nameIDFormat?: string;
      nameQualifier?: string;
      spNameQualifier?: string;
      sessionIndexes: string[];
    },
    relayState: string,
  ): Promise<string> {
    // The installed library emits one SessionIndex. Build its request, then include every index before Redirect signing.
    let xml = await this._generateLogoutRequest({
      issuer: this.options.issuer,
      ...context,
      sessionIndex: context.sessionIndexes[0],
    } as Profile);
    if (context.sessionIndexes.length > 1) {
      const dom = parse(xml);
      const root = dom.documentElement;
      for (const index of context.sessionIndexes.slice(1)) {
        const element = dom.createElementNS(PROTOCOL, 'samlp:SessionIndex');
        element.textContent = index;
        root.appendChild(element);
      }
      xml = new XMLSerializer().serializeToString(dom as never);
    }
    return this._requestToUrlAsync(xml, null, 'logout', { RelayState: relayState });
  }

  async response(id: string, relayState?: string): Promise<string> {
    return this.getLogoutResponseUrlAsync({ ID: id } as Profile, relayState || '', {}, true);
  }

  async validateMessage(
    container: Record<string, string>,
    originalQuery: string | null,
    destination: string,
  ): Promise<SamlLogoutMessage> {
    const request = !!container.SAMLRequest;
    if (request === !!container.SAMLResponse) throw new BadRequestException('Expected one SAML logout message');
    const encoded = request ? container.SAMLRequest : container.SAMLResponse;
    if (encoded.length > 350000) throw new BadRequestException('SAML message too large');
    const xml =
      originalQuery !== null
        ? await this.verifyRedirect(container, encoded, originalQuery)
        : await this.verifyPost(container, encoded, request);
    const root = parse(xml).documentElement;
    const message = readLogoutEnvelope(root, request, this.options.idpIssuer, destination);
    if (request) readLogoutRequest(root, message);
    else readLogoutResponse(root, message);
    return message;
  }

  /** Returns the inflated XML of a Redirect message whose exact query signature verified. */
  protected async verifyRedirect(
    container: Record<string, string>,
    encoded: string,
    originalQuery: string,
  ): Promise<string> {
    const params = new URLSearchParams(originalQuery);
    const allowed = new Set(['SAMLRequest', 'SAMLResponse', 'RelayState', 'SigAlg', 'Signature']);
    for (const key of params.keys())
      if (!allowed.has(key) || params.getAll(key).length !== 1)
        throw new BadRequestException('Invalid Redirect parameters');
    if (!container.Signature || container.SigAlg !== RSA_SHA256)
      throw new BadRequestException('Signed SAML Redirect required');
    const xml = inflateRawSync(Buffer.from(encoded, 'base64'), { maxOutputLength: 262144 }).toString('utf8');
    // Preserve the exact encoded query when checking the Redirect signature.
    await this.hasValidSignatureForRedirect(container, originalQuery);
    return xml;
  }

  /** Returns only the signed XML of a POST message with exactly one enveloped root signature. */
  protected async verifyPost(container: Record<string, string>, encoded: string, request: boolean): Promise<string> {
    const xml = Buffer.from(encoded, 'base64').toString('utf8');
    const dom = parse(xml);
    const root = dom.documentElement;
    const signatures = root.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature');
    if (signatures.length !== 1) throw new BadRequestException('One signed SAML document required');
    const verifier = new SignedXml({ publicCert: this.options.idpCert as string, getCertFromKeyInfo: () => null });
    verifier.loadSignature(signatures[0] as never);
    const references = verifier.getReferences();
    if (
      verifier.signatureAlgorithm !== RSA_SHA256 ||
      references.length !== 1 ||
      references[0].uri !== `#${root.getAttribute('ID')}` ||
      references[0].digestAlgorithm !== SHA256 ||
      !verifier.checkSignature(xml)
    ) {
      throw new BadRequestException('Invalid SAML document signature');
    }
    const verified = verifier.getSignedReferences();
    if (verified.length !== 1) throw new BadRequestException('Invalid SAML signed reference');
    // Exercise the real node-saml request validator as well; its response path lacks issuer/status checks.
    if (request) await this.validatePostRequestAsync(container);
    return verified[0];
  }
}
