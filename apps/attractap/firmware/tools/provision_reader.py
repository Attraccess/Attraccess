#!/usr/bin/env python3
"""Protected reader provisioning. Preparation is offline; inventory is read-only.

Apply defaults to dry-run and requires independent hardware qualification before writes.

Run with .tools/reader-provisioning/bin/python. The encrypted DS representation
matches esp_ds_data_t in ESP-IDF v6.0.2 for ESP32-S3 (not vendor TLV storage).
"""
import argparse
import contextlib
import csv
import hashlib
import importlib.metadata
import io
import json
import os
from pathlib import Path
import stat
import struct
import tempfile
import shutil
import subprocess
import sys
import re
import uuid
import zlib

TOOL_VERSION = '2.6.1'
DS_C_BYTES = 1584  # 3 * 4096/8 + SHA256 + M_prime + length + padding
DS_DATA_BYTES = 4 + 16 + DS_C_BYTES


def protected_read(path, maximum=65536):
    path = Path(path)
    parent = path.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700:
        raise ValueError('Input directory must be owned by the operator with mode 0700')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('Input must be an operator-owned regular 0600 file')
        data = source.read(maximum + 1)
        if len(data) > maximum:
            raise ValueError('Input exceeds limit')
        return data


def prepare_ds(private_key_file, hmac_key_file, output_file, password_file=None, target='esp32s3'):
    # Check the distribution before importing any vendor preparation code.
    if importlib.metadata.version('esp-secure-cert-tool') != TOOL_VERSION:
        raise ValueError('Unsupported DS preparation tool version')
    if target != 'esp32s3':
        raise ValueError('Only ESP32-S3 is supported')
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from esp_secure_cert.configure_ds import calculate_rsa_ds_params
    key = protected_read(private_key_file)
    hmac = protected_read(hmac_key_file, 32)
    password = protected_read(password_file, 4096) if password_file else None
    if len(hmac) != 32:
        raise ValueError('DS root must be exactly 32 bytes')
    try:
        private = serialization.load_pem_private_key(key, password=password)
    except ValueError:
        raise ValueError('Invalid protected PEM identity') from None
    if not isinstance(private, rsa.RSAPrivateKey) or private.key_size != 3072:
        raise ValueError('Identity must be RSA-3072')
    output = Path(output_file)
    parent = output.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700:
        raise ValueError('Output directory must be operator-owned with mode 0700')
    # The vendor function opens a filename. Give it a private snapshot instead
    # of re-opening the operator's original input after validation.
    with tempfile.TemporaryDirectory(prefix='.reader-ds-', dir=output.parent) as scratch:
        snapshot = Path(scratch) / 'identity.pem'
        fd = os.open(snapshot, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as destination:
            destination.write(key)
        try:
            # Do not expose vendor diagnostics containing input paths or material.
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                ciphertext, iv, bits = calculate_rsa_ds_params(str(snapshot), password, hmac, target)
        except (Exception, SystemExit):
            raise ValueError('Offline DS calculation failed') from None
        if bits != 3072 or len(iv) != 16 or len(ciphertext) != DS_C_BYTES:
            raise ValueError('Unexpected vendor DS output')
        representation = struct.pack('<I', bits // 32 - 1) + iv + ciphertext
        assert len(representation) == DS_DATA_BYTES
        # Publish complete data only; never follow a link or replace prior material.
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, 'wb') as destination:
                destination.write(representation)
                destination.flush()
                os.fsync(destination.fileno())
        except BaseException:
            output.unlink(missing_ok=True)
            raise
    public = private.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return {'target': target, 'rsaBits': bits, 'format': 'idf-v6.0.2-esp_ds_data_t-le',
            'bytes': len(representation), 'sha256': hashlib.sha256(representation).hexdigest(),
            'publicKeyFingerprint': hashlib.sha256(public).hexdigest(), 'hmacFingerprint': hashlib.sha256(hmac).hexdigest(), 'toolVersion': TOOL_VERSION}



BOARDS = {'attractap-touch', 'attractap-touch-v2', 'attractap-lite-ethernet', 'attractap-touch-ethernet'}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def protected_write(path, data):
    path = Path(path)
    info = path.parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('Unsafe output directory')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as target:
            target.write(data)
            target.flush()
            os.fsync(target.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def run_tool(module, arguments):
    # Never invoke vendor automatic device configuration or shell commands.
    result = subprocess.run([sys.executable, '-m', module, *arguments], capture_output=True, timeout=120)
    if result.returncode:
        raise ValueError('Protection tool failed; reconcile device state before retry')
    return result.stdout.decode('utf8')


def inventory_reader(port, board, module):
    if board not in BOARDS or not re.fullmatch(r'[A-Za-z0-9._-]{1,80}', module):
        raise ValueError('Unknown board/module')
    if importlib.metadata.version('esptool') != '5.6.0':
        raise ValueError('Unsupported inventory tool')
    with tempfile.TemporaryDirectory(prefix='reader-inventory-') as directory:
        output = Path(directory) / 'efuses.json'
        run_tool('espefuse', ['--chip', 'esp32s3', '--port', port, '--before', 'no-reset', '--after', 'no-reset',
                             'summary', '--format', 'json', '--file', str(output)])
        efuses = json.loads(output.read_bytes())
        flash = run_tool('esptool', ['--chip', 'esp32s3', '--port', port, '--before', 'no-reset', '--after', 'no-reset',
                                    '--no-stub', 'flash-id'])
    if not re.search(r'Detected flash size:\s*16\s*MB', flash):
        raise ValueError('Only verified 16 MiB flash is eligible')
    required = ['MAC', 'WAFER_VERSION_MAJOR', 'WAFER_VERSION_MINOR', 'SECURE_BOOT_EN', 'SPI_BOOT_CRYPT_CNT',
                'ENABLE_SECURITY_DOWNLOAD', 'DIS_DOWNLOAD_MODE', 'SOFT_DIS_JTAG', 'DIS_PAD_JTAG', 'DIS_USB_JTAG']
    required += [f'KEY_PURPOSE_{index}' for index in range(6)]
    required += [f'BLOCK_KEY{index}' for index in range(6)]
    if not isinstance(efuses, dict) or any(name not in efuses for name in required):
        raise ValueError('Incomplete device inventory')
    # Never retain readable eFuse key bytes in an inventory or manifest.
    # Only the documented identity/security fields enter the public binding.
    public = {}
    extra = ['SECURE_VERSION', 'RD_DIS', 'WR_DIS', 'SECURE_BOOT_KEY_REVOKE0', 'SECURE_BOOT_KEY_REVOKE1',
             'SECURE_BOOT_KEY_REVOKE2', 'DIS_DOWNLOAD_MANUAL_ENCRYPT', 'DIS_DOWNLOAD_ICACHE', 'DIS_DOWNLOAD_DCACHE']
    for name in required + [name for name in extra if name in efuses]:
        value = efuses[name]
        public[name] = {key: value[key] for key in ['value', 'raw_value', 'readable', 'writeable']}
        if name.startswith('BLOCK_KEY'):
            raw = str(value['raw_value']).replace('0x', '').replace(' ', '')
            state = 'empty' if value['readable'] and len(raw) == 64 and set(raw) == {'0'} else 'occupied'
            public[name]['raw_value'] = public[name]['value'] = state
    return {'target': 'esp32s3', 'board': board, 'module': module, 'flashBytes': 0x1000000,
            'toolVersion': '5.6.0', 'efuses': public}


def preflight_inventory(inventory, hmac_id):
    if inventory.get('target') != 'esp32s3' or inventory.get('board') not in BOARDS or \
       inventory.get('flashBytes') != 0x1000000 or inventory.get('toolVersion') != '5.6.0' or type(hmac_id) is not int or not 0 <= hmac_id < 6:
        raise ValueError('Ineligible inventory')
    module = inventory.get('module')
    if not isinstance(module, str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,80}', module) or module.lower() in {'unknown', 'none', 'null'}:
        raise ValueError('Unknown board/module')
    efuses = inventory.get('efuses', {})
    # esptool 5.6.0 exposes a two-bit major and calculated four-bit minor.
    for name, maximum in [('WAFER_VERSION_MAJOR', 3), ('WAFER_VERSION_MINOR', 15)]:
        revision = efuses.get(name, {})
        value = revision.get('value')
        if revision.get('readable') is not True or type(value) is not int or not 0 <= value <= maximum:
            raise ValueError('Unknown silicon revision')
    # This initial provisioning path accepts only unlocked blank security state.
    # Locked devices need a separately qualified recovery, never a force override.
    for name in ['SECURE_BOOT_EN', 'SPI_BOOT_CRYPT_CNT', 'ENABLE_SECURITY_DOWNLOAD', 'DIS_DOWNLOAD_MODE',
                 'SOFT_DIS_JTAG', 'DIS_PAD_JTAG', 'DIS_USB_JTAG']:
        value = efuses[name]
        if not value['readable'] or not value['writeable'] or value['value'] not in [False, 0]:
            raise ValueError('Conflicting existing protections')
    free = []
    for index in range(6):
        purpose, block = efuses[f'KEY_PURPOSE_{index}'], efuses[f'BLOCK_KEY{index}']
        empty = block['raw_value'] == 'empty' and block['value'] == 'empty'
        if purpose['value'] == 'USER' and purpose['writeable'] and block['readable'] and block['writeable'] and \
           empty:
            free.append(index)
    if hmac_id not in free or len(free) < 3:
        raise ValueError('Insufficient independent free key-purpose blocks')


def validate_partition_image(data):
    expected = {'nvs': (1, 2, 0x9000, 0x5000), 'otadata': (1, 0, 0xe000, 0x2000),
                'app0': (0, 0x10, 0x10000, 0x640000), 'app1': (0, 0x11, 0x650000, 0x640000),
                'spiffs': (1, 0x82, 0xc90000, 0x350000), 'nvs_keys': (1, 4, 0xfe0000, 0x1000),
                'identity': (1, 2, 0xfe1000, 0x1f000)}
    found = {}
    for offset in range(0, len(data) - 31, 32):
        magic, kind, subtype, start, size, label, flags = struct.unpack('<HBBII16sI', data[offset:offset + 32])
        if magic != 0x50aa:
            break
        name = label.split(b'\0')[0].decode('ascii')
        if name in found or (name == 'nvs_keys' and flags != 1) or (name != 'nvs_keys' and flags != 0):
            raise ValueError('Conflicting partition flags')
        found[name] = (kind, subtype, start, size)
    if found != expected:
        raise ValueError('Partition layout differs from the reviewed 16 MiB layout')


def prepare_bundle(request_file, output_directory):
    if importlib.metadata.version('esp-idf-nvs-partition-gen') != '0.3.0':
        raise ValueError('Unsupported NVS preparation tool')
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization
    from esp_idf_nvs_partition_gen import nvs_partition_gen as nvs
    request = json.loads(protected_read(request_file))
    required = {'readerId', 'installationId', 'inventoryFile', 'hmacId', 'dsFile', 'certificateFile',
                'dsMetadataFile', 'serverCaFiles', 'timeKeys', 'applicationFile', 'bootloaderFile', 'partitionFile', 'qualificationFile'}
    if set(request) != required or type(request['readerId']) is not int or request['readerId'] < 1 or \
       str(uuid.UUID(request['installationId'])) != request['installationId'] or \
       not isinstance(request['serverCaFiles'], list) or len(request['serverCaFiles']) != 1 or \
       not isinstance(request['timeKeys'], list) or not 1 <= len(request['timeKeys']) <= 2:
        raise ValueError('Invalid provisioning request; initial provisioning requires one server root')
    inventory = json.loads(protected_read(request['inventoryFile']))
    preflight_inventory(inventory, request['hmacId'])
    ds = protected_read(request['dsFile'])
    if len(ds) != DS_DATA_BYTES or struct.unpack('<I', ds[:4])[0] != 95:
        raise ValueError('Invalid DS material')
    certificate_bytes = protected_read(request['certificateFile'])
    certificate = x509.load_pem_x509_certificate(certificate_bytes)
    public = certificate.public_key()
    metadata = json.loads(protected_read(request['dsMetadataFile']))
    if not re.fullmatch(r'[a-f0-9]{64}', metadata.get('hmacFingerprint', '')) or metadata.get('sha256') != digest(ds) or metadata.get('publicKeyFingerprint') != digest(public.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)):
        raise ValueError('DS material and public credential do not match')
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    usage = certificate.extensions.get_extension_for_class(x509.KeyUsage)
    constraints = certificate.extensions.get_extension_for_class(x509.BasicConstraints)
    extended = certificate.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value
    uri = f"https://reader.attraccess.invalid/{request['installationId']}/{request['readerId']}"
    if not isinstance(public, rsa.RSAPublicKey) or public.key_size != 3072 or constraints.value.ca or \
       not constraints.critical or not usage.critical or not usage.value.digital_signature or usage.value.key_cert_sign or \
       list(extended) != [ExtendedKeyUsageOID.CLIENT_AUTH] or \
       certificate.subject != x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, f"reader-{request['readerId']}")]) or \
       certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.UniformResourceIdentifier) != [uri] or \
       not certificate.not_valid_before_utc <= now < certificate.not_valid_after_utc:
        raise ValueError('Invalid public identity')
    app = protected_read(request['applicationFile'], 0x640000)
    bootloader = protected_read(request['bootloaderFile'], 0x8000)
    partition = protected_read(request['partitionFile'], 0x1000)
    validate_partition_image(partition)
    # Signed Secure Boot v2 blocks must be present on both images. Independent
    # qualification, not these structural checks, establishes verified signing.
    for image in [app, bootloader]:
        if not any(image[index:index + 4] == b'\xe7\x02\x00\x00' for index in range(0, len(image), 4096)):
            raise ValueError('Signed production images required')
    output = Path(output_directory)
    output.mkdir(mode=0o700)  # No replacing previous prepared material.
    try:
        with tempfile.TemporaryDirectory(prefix='.reader-nvs-', dir=output) as scratch:
            scratch = Path(scratch)
            csvfile = scratch / 'identity.csv'
            rows = [['reader', 'namespace', '', ''], ['ds-data', 'data', 'hex2bin', ds.hex()],
                    ['installation', 'data', 'hex2bin', uuid.UUID(request['installationId']).bytes.hex()],
                    ['hmac-id', 'data', 'u8', request['hmacId']], ['certificate', 'data', 'string', certificate_bytes.decode('ascii')],
                    ['ca-count', 'data', 'u8', 1], ['time-count', 'data', 'u8', len(request['timeKeys'])]]
            for index, path in enumerate(request['serverCaFiles']):
                root = protected_read(path)
                if not x509.load_pem_x509_certificate(root).extensions.get_extension_for_class(x509.BasicConstraints).value.ca:
                    raise ValueError('Server trust is not a CA')
                rows.append([f'server-ca{index}', 'data', 'string', root.decode('ascii')])
            seen = set()
            for index, trust in enumerate(request['timeKeys']):
                if set(trust) != {'id', 'publicKeyFile'} or type(trust['id']) is not int or not 1 <= trust['id'] <= 0xffffffff or trust['id'] in seen:
                    raise ValueError('Invalid time trust')
                seen.add(trust['id'])
                pem = protected_read(trust['publicKeyFile'])
                key = serialization.load_pem_public_key(pem)
                if not isinstance(key, rsa.RSAPublicKey) or key.key_size != 3072:
                    raise ValueError('Time trust must be RSA-3072')
                rows += [[f'time-id{index}', 'data', 'u32', trust['id']], [f'time-key{index}', 'data', 'string', pem.decode('ascii')]]
            with open(csvfile, 'w', newline='') as target:
                writer = csv.writer(target)
                writer.writerow(['key', 'type', 'encoding', 'value'])
                writer.writerows(rows)
            csvfile.chmod(0o600)
            # Explicit CSPRNG key input avoids the vendor generator's random.choice.
            key = os.urandom(64)
            keyfile = scratch / 'nvs-key.bin'
            protected_write(keyfile, key)
            encrypted = scratch / 'identity.bin'
            args = argparse.Namespace(input=[str(csvfile)], output=str(encrypted), size=hex(0x1f000), version=2,
                                      keygen=False, inputkey=str(keyfile), keyfile=None, outdir=str(scratch))
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                nvs.encrypt(args)
            keys_partition = key + struct.pack('<I', zlib.crc32(key, 0xffffffff) & 0xffffffff) + b'\xff' * (0x1000 - 68)
            artifacts = {'application.bin': app, 'bootloader.bin': bootloader, 'partition-table.bin': partition,
                         'identity.bin': encrypted.read_bytes(), 'nvs-keys.bin': keys_partition,
                         'nvs.bin': b'\xff' * 0x5000, 'otadata.bin': b'\xff' * 0x2000}
            for name, data in artifacts.items():
                protected_write(output / name, data)
            manifest = {'version': 1, 'readerId': request['readerId'], 'installationId': request['installationId'],
                        'inventory': inventory, 'inventoryDigest': digest(canonical(inventory)),
                        'certificateFingerprint': digest(certificate.public_bytes(serialization.Encoding.DER)),
                        'publicKeyFingerprint': digest(public.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)),
                        'artifacts': {name: digest(data) for name, data in artifacts.items()},
                        'qualificationFile': request['qualificationFile'], 'hmacId': request['hmacId'],
                        'hmacFingerprint': metadata['hmacFingerprint'],
                        'tool': {'idf': '6.0.2', 'esptool': '5.6.0', 'ds': TOOL_VERSION},
                        'operations': ['burn-ds-root', 'write-protected-images', 'qualified-first-boot'],
                        'finalProtections': ['secure-boot-v2', 'release-flash-encryption', 'nvs-encryption',
                                             'debug-disabled', 'secure-download', 'anti-rollback-1']}
            protected_write(output / 'reader-manifest.json', canonical(manifest))
        return {'manifestDigest': digest(canonical(manifest)), 'productionEligible': False}
    except BaseException:
        shutil.rmtree(output)
        raise



def apply_bundle(manifest_file, hmac_file, trust_file, port=None, execute=False):
    from check_security_qualification import verify_qualification
    manifest_bytes = protected_read(manifest_file)
    manifest = json.loads(manifest_bytes)
    directory = Path(manifest_file).parent
    if manifest.get('version') != 1 or manifest.get('operations') != ['burn-ds-root', 'write-protected-images', 'qualified-first-boot'] or \
       manifest.get('tool') != {'idf': '6.0.2', 'esptool': '5.6.0', 'ds': TOOL_VERSION}:
        raise ValueError('Unknown provisioning plan')
    preflight_inventory(manifest['inventory'], manifest['hmacId'])
    if digest(canonical(manifest['inventory'])) != manifest['inventoryDigest']:
        raise ValueError('Inventory binding changed')
    addresses = {'bootloader.bin': 0, 'partition-table.bin': 0x8000, 'nvs.bin': 0x9000, 'otadata.bin': 0xe000,
                 'application.bin': 0x10000, 'nvs-keys.bin': 0xfe0000, 'identity.bin': 0xfe1000}
    if set(manifest['artifacts']) != set(addresses):
        raise ValueError('Unknown provisioning artifacts')
    snapshots = {}
    for name in addresses:
        data = protected_read(directory / name, 0x640000)
        if digest(data) != manifest['artifacts'][name]:
            raise ValueError('Provisioning artifact changed')
        snapshots[name] = data
    validate_partition_image(snapshots['partition-table.bin'])
    for name, limit in [('application.bin', 0x640000), ('bootloader.bin', 0x8000), ('identity.bin', 0x1f000),
                        ('nvs-keys.bin', 0x1000), ('nvs.bin', 0x5000), ('otadata.bin', 0x2000)]:
        if not snapshots[name] or len(snapshots[name]) > limit:
            raise ValueError('Provisioning image does not fit')
    artifacts = {**manifest['artifacts'], 'reader-manifest.json': digest(manifest_bytes)}
    # Dry runs also validate qualification, but never open a serial device.
    verify_qualification(manifest['qualificationFile'], trust_file, artifacts, manifest['inventoryDigest'])
    if not execute:
        return {'dryRun': True, 'operations': manifest['operations'], 'deviceAccess': False}
    if not port:
        raise ValueError('Explicit serial port is required')
    current = inventory_reader(port, manifest['inventory']['board'], manifest['inventory']['module'])
    journal = directory / 'apply-journal.json'
    # A pending/previous attempt is not authorization to repeat an eFuse write.
    # Always reread actual state; uncertain roots require independently reviewed
    # protected recovery rather than guessing that a burn succeeded.
    if journal.exists():
        prior = json.loads(protected_read(journal))
        if prior.get('manifestDigest') != digest(manifest_bytes):
            raise ValueError('Prior provisioning belongs to a different manifest')
        raise ValueError('Prior provisioning detected; reconcile fresh inventory with the journal under protected recovery')
    if current != manifest['inventory']:
        raise ValueError('Fresh inventory does not match reviewed inventory')
    hmac = protected_read(hmac_file, 32)
    if len(hmac) != 32 or digest(hmac) != manifest['hmacFingerprint']:
        raise ValueError('DS root does not match prepared identity')
    def record(state):
        value = canonical({'manifestDigest': digest(manifest_bytes), 'state': state,
                           'inventoryDigest': manifest['inventoryDigest']})
        temporary = directory / '.apply-journal.pending'
        protected_write(temporary, value)
        os.replace(temporary, journal)
        descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    with tempfile.TemporaryDirectory(prefix='.reader-apply-', dir=directory) as scratch:
        scratch = Path(scratch)
        root = scratch / 'hmac.bin'
        protected_write(root, hmac)
        for name, data in snapshots.items():
            protected_write(scratch / name, data)
        record('burn-ds-root-pending')
        run_tool('espefuse', ['--chip', 'esp32s3', '--port', port, '--before', 'no-reset', '--after', 'no-reset',
                             '--do-not-confirm', 'burn-key', f"BLOCK_KEY{manifest['hmacId']}", str(root),
                             'HMAC_DOWN_DIGITAL_SIGNATURE'])
        burned = inventory_reader(port, manifest['inventory']['board'], manifest['inventory']['module'])
        block = burned['efuses'][f"BLOCK_KEY{manifest['hmacId']}"]
        purpose = burned['efuses'][f"KEY_PURPOSE_{manifest['hmacId']}"]
        if block['readable'] or block['writeable'] or purpose['writeable'] or purpose['value'] != 'HMAC_DOWN_DIGITAL_SIGNATURE':
            raise ValueError('DS root protections are not confirmed; stop for protected recovery')
        record('write-protected-images-pending')
        arguments = ['--chip', 'esp32s3', '--port', port, '--before', 'no-reset', '--after', 'no-reset',
                     '--no-stub', 'write-flash', '--flash-size', '16MB']
        for name, address in addresses.items():
            arguments += [hex(address), str(scratch / name)]
        run_tool('esptool', arguments)
        record('qualified-first-boot-required')
    # No reset is triggered. The reviewed IDF production bootloader performs its
    # secure first-boot transition in the controlled qualification environment.
    return {'written': True, 'productionEligible': False, 'requiresQualifiedFirstBoot': True}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    prepare = sub.add_parser('prepare-ds', help='offline calculation only; no device access')
    prepare.add_argument('--private-key-file', required=True)
    prepare.add_argument('--hmac-key-file', required=True)
    prepare.add_argument('--password-file')
    prepare.add_argument('--output', required=True)
    prepare.add_argument('--metadata-output')
    inventory = sub.add_parser('inventory', help='explicit read-only serial inventory; no resets')
    inventory.add_argument('--port', required=True)
    inventory.add_argument('--board', choices=sorted(BOARDS), required=True)
    inventory.add_argument('--module', required=True)
    inventory.add_argument('--output', required=True)
    bundle = sub.add_parser('prepare-bundle', help='offline encrypted NVS and reviewed-layout manifest')
    bundle.add_argument('--request-file', required=True)
    bundle.add_argument('--output-directory', required=True)
    apply = sub.add_parser('apply', help='qualification-gated dry-run by default')
    apply.add_argument('--manifest-file', required=True)
    apply.add_argument('--hmac-key-file', required=True)
    apply.add_argument('--qualification-trust-file', required=True)
    apply.add_argument('--port')
    apply.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    try:
        if args.command == 'prepare-ds':
            result = prepare_ds(args.private_key_file, args.hmac_key_file, args.output, args.password_file)
            if args.metadata_output:
                protected_write(args.metadata_output, canonical(result))
        elif args.command == 'inventory':
            result = inventory_reader(args.port, args.board, args.module)
            protected_write(args.output, canonical(result))
            result = {'inventoryDigest': digest(canonical(result))}
        elif args.command == 'prepare-bundle':
            result = prepare_bundle(args.request_file, args.output_directory)
        else:
            result = apply_bundle(args.manifest_file, args.hmac_key_file, args.qualification_trust_file, args.port, args.execute)
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError, importlib.metadata.PackageNotFoundError):
        parser.exit(1, 'Reader preparation failed; check protected input files and pinned environment.\n')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
