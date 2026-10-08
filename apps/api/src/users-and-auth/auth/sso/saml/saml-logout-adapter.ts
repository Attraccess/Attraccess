import { SAML, Profile, SamlConfig } from '@node-saml/node-saml';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { inflateRawSync } from 'node:zlib';
import { BadRequestException } from '@nestjs/common';

const PROTOCOL = 'urn:oasis:names:tc:SAML:2.0:protocol';
const ASSERTION = 'urn:oasis:names:tc:SAML:2.0:assertion';
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
  nameID?: string;
  nameIDFormat?: string;
  nameQualifier?: string;
  spNameQualifier?: string;
  sessionIndexes: string[];
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
    let xml: string;
    if (originalQuery !== null) {
      const params = new URLSearchParams(originalQuery);
      const allowed = new Set(['SAMLRequest', 'SAMLResponse', 'RelayState', 'SigAlg', 'Signature']);
      for (const key of params.keys())
        if (!allowed.has(key) || params.getAll(key).length !== 1)
          throw new BadRequestException('Invalid Redirect parameters');
      if (!container.Signature || container.SigAlg !== RSA_SHA256)
        throw new BadRequestException('Signed SAML Redirect required');
      xml = inflateRawSync(Buffer.from(encoded, 'base64'), { maxOutputLength: 262144 }).toString('utf8');
      // Preserve the exact encoded query when checking the Redirect signature.
      await this.hasValidSignatureForRedirect(container, originalQuery);
    } else {
      xml = Buffer.from(encoded, 'base64').toString('utf8');
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
      xml = verified[0];
      // Exercise the real node-saml request validator as well; its response path lacks issuer/status checks.
      if (request) await this.validatePostRequestAsync(container);
    }
    const root = parse(xml).documentElement;
    if (
      root.namespaceURI !== PROTOCOL ||
      root.localName !== (request ? 'LogoutRequest' : 'LogoutResponse') ||
      root.getAttribute('Version') !== '2.0'
    )
      throw new BadRequestException('Invalid SAML logout root');
    const issuer = children(root, ASSERTION, 'Issuer');
    const id = root.getAttribute('ID');
    const issueInstant = Date.parse(root.getAttribute('IssueInstant') || '');
    const now = Date.now();
    if (
      !id ||
      id.length > 256 ||
      issuer.length !== 1 ||
      issuer[0].textContent !== this.options.idpIssuer ||
      root.getAttribute('Destination') !== destination ||
      !Number.isFinite(issueInstant) ||
      issueInstant > now + 30000 ||
      issueInstant < now - 300000
    )
      throw new BadRequestException('Invalid SAML logout identity, destination or time');
    for (const attribute of ['NotBefore', 'NotOnOrAfter']) {
      const value = root.getAttribute(attribute);
      if (
        value &&
        (!Number.isFinite(Date.parse(value)) ||
          (attribute === 'NotBefore' ? Date.parse(value) > now + 30000 : Date.parse(value) <= now - 30000))
      )
        throw new BadRequestException('Expired SAML logout message');
    }
    const message: SamlLogoutMessage = {
      kind: request ? 'request' : 'response',
      id,
      issuer: issuer[0].textContent,
      issueInstant,
      sessionIndexes: [],
    };
    if (request) {
      const names = children(root, ASSERTION, 'NameID');
      if (names.length !== 1 || !names[0].textContent)
        throw new BadRequestException('SAML LogoutRequest requires NameID');
      const name = names[0];
      message.nameID = name.textContent;
      message.nameIDFormat = name.getAttribute('Format') || undefined;
      message.nameQualifier = name.getAttribute('NameQualifier') || undefined;
      message.spNameQualifier = name.getAttribute('SPNameQualifier') || undefined;
      message.sessionIndexes = children(root, PROTOCOL, 'SessionIndex').map((node) => node.textContent || '');
      if (message.sessionIndexes.some((index) => !index)) throw new BadRequestException('Invalid SAML SessionIndex');
    } else {
      message.inResponseTo = root.getAttribute('InResponseTo') || undefined;
      const statuses = children(root, PROTOCOL, 'Status');
      const codes = statuses.length === 1 ? children(statuses[0], PROTOCOL, 'StatusCode') : [];
      if (!message.inResponseTo || codes.length !== 1 || !codes[0].getAttribute('Value'))
        throw new BadRequestException('SAML LogoutResponse requires correlation and status');
      const nested = children(codes[0], PROTOCOL, 'StatusCode');
      message.status = nested[0]?.getAttribute('Value') || codes[0].getAttribute('Value') || undefined;
    }
    return message;
  }
}
