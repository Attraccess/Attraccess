#!/usr/bin/env python3
"""Verify independently signed hardware qualification against exact artifacts.

The reviewer private key must remain outside the provisioning/API account.
Public-key trust is installed locally by an operator, never supplied by a reader
or inferred from the receipt. Simulated results cannot authorize deployment.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import time
from provision_reader import protected_read

DOMAIN = b'ATTR-QUAL-V1\n'


def verify_qualification(receipt_file, trust_file, artifacts, inventory_digest=None, now=None):
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    receipt = json.loads(protected_read(receipt_file, 16384))
    public = serialization.load_pem_public_key(protected_read(trust_file))
    if not isinstance(public, rsa.RSAPublicKey) or public.key_size < 3072:
        raise ValueError('Qualification trust must use RSA-3072 or stronger')
    if not isinstance(receipt, dict) or set(receipt) != {'payload', 'signature'}:
        raise ValueError('Invalid qualification receipt')
    payload = receipt['payload']
    required = {'version', 'model', 'evidenceClass', 'result', 'reviewer', 'qualifiedAt', 'expiresAt',
                'inventoryDigest', 'evidenceDigest', 'artifacts'}
    now = int(time.time()) if now is None else now
    if not isinstance(payload, dict) or set(payload) != required or payload['version'] != 1 or \
       payload['model'] != 'existing-board-v1' or payload['evidenceClass'] != 'hardware' or payload['result'] != 'passed' or \
       not isinstance(payload['reviewer'], str) or not re.fullmatch(r'[A-Za-z0-9@._ -]{1,100}', payload['reviewer']):
        raise ValueError('Hardware qualification is required')
    if type(payload['qualifiedAt']) is not int or type(payload['expiresAt']) is not int or \
       not 0 <= payload['qualifiedAt'] <= now < payload['expiresAt'] <= payload['qualifiedAt'] + 366 * 86400:
        raise ValueError('Qualification is not current')
    for field in ['inventoryDigest', 'evidenceDigest']:
        if not isinstance(payload[field], str) or not re.fullmatch(r'[a-f0-9]{64}', payload[field]):
            raise ValueError('Invalid qualification binding')
    if inventory_digest is not None and inventory_digest != payload['inventoryDigest']:
        raise ValueError('Qualification inventory does not match')
    if not isinstance(payload['artifacts'], dict) or not payload['artifacts'] or any(
       not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', name) or not isinstance(digest, str) or
       not re.fullmatch(r'[a-f0-9]{64}', digest) for name, digest in payload['artifacts'].items()):
        raise ValueError('Invalid qualification artifacts')
    if not artifacts or any(payload['artifacts'].get(name) != digest for name, digest in artifacts.items()):
        raise ValueError('Qualification artifacts do not match')
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')
    try:
        signature = base64.b64decode(receipt['signature'], validate=True)
        public.verify(signature, DOMAIN + canonical, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32), hashes.SHA256())
    except (Exception, TypeError):
        raise ValueError('Qualification signature is invalid') from None
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--trusted-public-key', required=True)
    parser.add_argument('--artifact', action='append', required=True, help='NAME=PATH; actual bytes are hashed')
    parser.add_argument('--inventory-digest')
    args = parser.parse_args()
    try:
        artifacts = {}
        for item in args.artifact:
            name, path = item.split('=', 1)
            artifacts[name] = hashlib.sha256(Path(path).read_bytes()).hexdigest()
        verify_qualification(args.receipt, args.trusted_public_key, artifacts, args.inventory_digest)
    except (ValueError, OSError, KeyError, TypeError):
        parser.exit(1, 'Production is blocked: missing, invalid or mismatched hardware qualification.\n')
    print('Hardware qualification signature and artifact bindings verified; no device was accessed.')


if __name__ == '__main__':
    main()
