"""Offline preparation only. No real hardware or eFuse writes."""
import importlib.util
import os
import sys
import json
import base64
import datetime
import hashlib
import zlib
from pathlib import Path
import socket
import stat
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from esp_secure_cert import configure_ds
import serial

spec = importlib.util.spec_from_file_location('provision_reader', Path(__file__).parents[2] / 'tools/provision_reader.py')
provision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provision)
sys.path.insert(0, str(Path(__file__).parents[2] / 'tools'))
from check_security_qualification import verify_qualification, DOMAIN


class OfflineDSPreparation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=3072).private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.keyfile = self.directory / 'key.pem'
        self.root = self.directory / 'hmac.bin'
        self.write(self.keyfile, self.key)
        self.write(self.root, os.urandom(32))
        self.output = self.directory / 'ds.bin'
        # Any attempted device/network/child-process access fails the test.
        for target in [(serial, 'Serial'), (socket, 'socket'), (subprocess, 'Popen'),
                       (configure_ds, 'configure_efuse_for_rsa')]:
            blocker = patch.object(*target, side_effect=AssertionError('Device access forbidden'))
            blocker.start()
            self.addCleanup(blocker.stop)

    @staticmethod
    def write(path, data):
        path.write_bytes(data)
        path.chmod(0o600)

    def prepare(self):
        return provision.prepare_ds(self.keyfile, self.root, self.output)

    def test_real_vendor_output_and_unique_reader_material(self):
        first = self.prepare()
        data = self.output.read_bytes()
        self.assertEqual(len(data), 1604)
        self.assertEqual(struct.unpack('<I', data[:4])[0], 95)
        self.assertEqual(first['rsaBits'], 3072)
        self.assertEqual(first['toolVersion'], '2.6.1')
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)
        self.output.unlink()
        self.write(self.root, os.urandom(32))
        second = self.prepare()
        self.assertNotEqual(first['sha256'], second['sha256'])
        self.assertEqual(first['publicKeyFingerprint'], second['publicKeyFingerprint'])
        self.assertEqual(list(self.directory.glob('.reader-ds-*')), [])

    def test_wrong_version_stops_before_calculation(self):
        with patch.object(provision.importlib.metadata, 'version', return_value='2.6.2'), \
             patch.object(configure_ds, 'calculate_rsa_ds_params') as calculate:
            with self.assertRaisesRegex(ValueError, 'version'):
                self.prepare()
            calculate.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_vendor_failure_cleans_temporary_key_and_output(self):
        with patch.object(configure_ds, 'calculate_rsa_ds_params', side_effect=SystemExit(1)):
            with self.assertRaisesRegex(ValueError, 'calculation failed'):
                self.prepare()
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.directory.glob('.reader-ds-*')), [])

    def test_rejects_bad_permissions_links_roots_and_key_sizes(self):
        self.keyfile.chmod(0o644)
        with self.assertRaises(ValueError):
            self.prepare()
        self.keyfile.chmod(0o600)
        link = self.directory / 'linked.pem'
        link.symlink_to(self.keyfile)
        with self.assertRaises(OSError):
            provision.prepare_ds(link, self.root, self.output)
        self.write(self.root, b'x' * 31)
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_existing_output_is_preserved(self):
        self.write(self.output, b'existing')
        with self.assertRaises(FileExistsError):
            self.prepare()
        self.assertEqual(self.output.read_bytes(), b'existing')
        self.assertEqual(list(self.directory.glob('.reader-ds-*')), [])


    def test_qualification_requires_real_evidence_fresh_binding_and_independent_signature(self):
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding
        # Ephemeral test signer and synthetic fixture only. No receipt is retained
        # or used with a device, deployment catalog, or production private key.
        signer = serialization.load_pem_private_key(self.key, password=None)
        trust = self.directory / 'reviewer.pem'
        self.write(trust, signer.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        receipt = self.directory / 'receipt.json'
        payload = {'version': 1, 'model': 'existing-board-v1', 'evidenceClass': 'hardware', 'result': 'passed',
                   'reviewer': 'Test fixture', 'qualifiedAt': 100, 'expiresAt': 200,
                   'inventoryDigest': 'a' * 64, 'evidenceDigest': 'b' * 64, 'artifacts': {'app.bin': 'c' * 64}}
        def write_receipt():
            canonical = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode('ascii')
            signature = signer.sign(DOMAIN + canonical, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32), hashes.SHA256())
            self.write(receipt, json.dumps({'payload': payload, 'signature': base64.b64encode(signature).decode('ascii')}).encode())
        write_receipt()
        self.assertEqual(verify_qualification(receipt, trust, {'app.bin': 'c' * 64}, 'a' * 64, now=150), payload)
        for artifacts, inventory, now in [({'app.bin': 'd' * 64}, 'a' * 64, 150),
                                           ({'app.bin': 'c' * 64}, 'e' * 64, 150),
                                           ({'app.bin': 'c' * 64}, 'a' * 64, 200)]:
            with self.assertRaises(ValueError): verify_qualification(receipt, trust, artifacts, inventory, now=now)
        payload['evidenceClass'] = 'simulation'
        write_receipt()
        with self.assertRaises(ValueError): verify_qualification(receipt, trust, {'app.bin': 'c' * 64}, now=150)
        payload['evidenceClass'] = 'hardware'
        write_receipt()
        forged = json.loads(receipt.read_text()); forged['payload']['evidenceDigest'] = 'f' * 64
        self.write(receipt, json.dumps(forged).encode())
        with self.assertRaises(ValueError): verify_qualification(receipt, trust, {'app.bin': 'c' * 64}, now=150)

    def test_encrypted_bundle_uses_real_nvs_tool_and_rejects_unqualified_apply(self):
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes
        from cryptography.x509.oid import NameOID
        signer = serialization.load_pem_private_key(self.key, password=None)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Host fixture')])
        now = datetime.datetime.now(datetime.timezone.utc)
        certificate = x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(signer.public_key()).serial_number(1).not_valid_before(now - datetime.timedelta(seconds=1)).not_valid_after(now + datetime.timedelta(days=1)).add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True).sign(signer, hashes.SHA256())
        rootfile = self.directory / 'root.pem'
        self.write(rootfile, certificate.public_bytes(serialization.Encoding.PEM))
        certificate = x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'reader-17')])).issuer_name(name).public_key(signer.public_key()).serial_number(2).not_valid_before(now - datetime.timedelta(seconds=1)).not_valid_after(now + datetime.timedelta(days=1)).add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True).add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=False, data_encipherment=False, key_agreement=False, key_cert_sign=False, crl_sign=False, encipher_only=False, decipher_only=False), critical=True).add_extension(x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False).add_extension(x509.SubjectAlternativeName([x509.UniformResourceIdentifier('https://reader.attraccess.invalid/00000000-0000-4000-8000-000000000001/17')]), critical=False).sign(signer, hashes.SHA256())
        certfile = self.directory / 'certificate.pem'
        self.write(certfile, certificate.public_bytes(serialization.Encoding.PEM))
        pubfile = self.directory / 'time.pem'
        self.write(pubfile, signer.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        metadata = self.prepare()
        metafile = self.directory / 'ds.json'
        self.write(metafile, provision.canonical(metadata))
        efuses = {name: {'value': 0, 'raw_value': '0x00', 'readable': True, 'writeable': True}
                  for name in ['SECURE_BOOT_EN', 'SPI_BOOT_CRYPT_CNT', 'ENABLE_SECURITY_DOWNLOAD', 'DIS_DOWNLOAD_MODE', 'SOFT_DIS_JTAG', 'DIS_PAD_JTAG', 'DIS_USB_JTAG']}
        for index in range(6):
            efuses[f'KEY_PURPOSE_{index}'] = {'value': 'USER', 'writeable': True}
            efuses[f'BLOCK_KEY{index}'] = {'value': 'empty', 'raw_value': 'empty', 'readable': True, 'writeable': True}
        inventory = {'target': 'esp32s3', 'board': 'attractap-touch', 'module': 'HostFixture',
                     'flashBytes': 0x1000000, 'toolVersion': '5.6.0', 'efuses': efuses}
        inventoryfile = self.directory / 'inventory.json'
        self.write(inventoryfile, provision.canonical(inventory))
        table = bytearray()
        for label, kind, subtype, address, size, flags in [
            ('nvs', 1, 2, 0x9000, 0x5000, 0), ('otadata', 1, 0, 0xe000, 0x2000, 0),
            ('app0', 0, 0x10, 0x10000, 0x640000, 0), ('app1', 0, 0x11, 0x650000, 0x640000, 0),
            ('spiffs', 1, 0x82, 0xc90000, 0x350000, 0), ('nvs_keys', 1, 4, 0xfe0000, 0x1000, 1),
            ('identity', 1, 2, 0xfe1000, 0x1f000, 0)]:
            table += struct.pack('<HBBII16sI', 0x50aa, kind, subtype, address, size, label.encode(), flags)
        table += b'\xff' * (4096 - len(table))
        partitionfile = self.directory / 'partition.bin'
        self.write(partitionfile, table)
        # Structural signed-image fixtures only; no qualified firmware is created.
        app = self.directory / 'app.bin'
        self.write(app, b'\xe7\x02\x00\x00' + b'\x00' * 8190)
        request = {'readerId': 17, 'installationId': '00000000-0000-4000-8000-000000000001',
                   'inventoryFile': str(inventoryfile), 'hmacId': 0, 'dsFile': str(self.output),
                   'dsMetadataFile': str(metafile), 'certificateFile': str(certfile), 'serverCaFiles': [str(rootfile)],
                   'timeKeys': [{'id': 1, 'publicKeyFile': str(pubfile)}], 'applicationFile': str(app),
                   'bootloaderFile': str(app), 'partitionFile': str(partitionfile),
                   'qualificationFile': str(self.directory / 'missing-qualification.json')}
        requestfile = self.directory / 'request.json'
        self.write(requestfile, provision.canonical(request))
        output = self.directory / 'bundle'
        result = provision.prepare_bundle(requestfile, output)
        self.assertFalse(result['productionEligible'])
        manifest = json.loads((output / 'reader-manifest.json').read_bytes())
        self.assertEqual(manifest['hmacFingerprint'], hashlib.sha256(self.root.read_bytes()).hexdigest())
        self.assertEqual(len((output / 'identity.bin').read_bytes()), 0x1f000)
        self.assertNotIn(b'Host fixture', (output / 'identity.bin').read_bytes())
        keys = (output / 'nvs-keys.bin').read_bytes()
        self.assertEqual(len(keys), 4096)
        self.assertEqual(struct.unpack('<I', keys[64:68])[0], zlib.crc32(keys[:64], 0xffffffff))
        self.assertEqual(stat.S_IMODE((output / 'nvs-keys.bin').stat().st_mode), 0o600)
        with patch.object(provision, 'inventory_reader') as inventory_read, patch.object(provision, 'run_tool') as tools:
            with self.assertRaises(OSError):
                provision.apply_bundle(output / 'reader-manifest.json', self.root, pubfile, '/never-open', True)
            inventory_read.assert_not_called()
            tools.assert_not_called()
        self.assertFalse((output / 'apply-journal.json').exists())
        with self.assertRaises(FileExistsError):
            provision.prepare_bundle(requestfile, output)
        # Test-only qualification is ephemeral. All device functions remain
        # replaced; these fixtures can never authorize physical provisioning.
        from cryptography.hazmat.primitives.asymmetric import padding
        import copy
        receipt = self.directory / 'missing-qualification.json'
        timestamp = int(now.timestamp())
        payload = {'version': 1, 'model': 'existing-board-v1', 'evidenceClass': 'hardware', 'result': 'passed',
                   'reviewer': 'Synthetic unit test only', 'qualifiedAt': timestamp - 1, 'expiresAt': timestamp + 3600,
                   'inventoryDigest': manifest['inventoryDigest'], 'evidenceDigest': 'b' * 64,
                   'artifacts': {**manifest['artifacts'], 'reader-manifest.json': provision.digest((output / 'reader-manifest.json').read_bytes())}}
        signature = signer.sign(DOMAIN + provision.canonical(payload),
                                padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32), hashes.SHA256())
        self.write(receipt, provision.canonical({'payload': payload, 'signature': base64.b64encode(signature).decode()}))
        with patch.object(provision, 'inventory_reader') as inventory_read, patch.object(provision, 'run_tool') as tools:
            dry = provision.apply_bundle(output / 'reader-manifest.json', self.root, pubfile)
            self.assertTrue(dry['dryRun'])
            self.assertFalse(dry['deviceAccess'])
            inventory_read.assert_not_called()
            tools.assert_not_called()
        # Simulate a failure after burning the root. The journal must prevent
        # an automatic repeat even when a later inventory appears blank.
        burned = copy.deepcopy(inventory)
        burned['efuses']['BLOCK_KEY0'].update(readable=False, writeable=False, value='occupied', raw_value='occupied')
        burned['efuses']['KEY_PURPOSE_0'].update(value='HMAC_DOWN_DIGITAL_SIGNATURE', writeable=False)
        with patch.object(provision, 'inventory_reader', side_effect=[inventory, burned]), \
             patch.object(provision, 'run_tool', side_effect=['', ValueError('simulated interruption')]) as tools:
            with self.assertRaisesRegex(ValueError, 'simulated interruption'):
                provision.apply_bundle(output / 'reader-manifest.json', self.root, pubfile, '/mock-only', True)
            self.assertEqual([call.args[0] for call in tools.call_args_list], ['espefuse', 'esptool'])
            burn = tools.call_args_list[0].args[1]
            self.assertEqual(burn[-3], 'BLOCK_KEY0')
            self.assertEqual(burn[-1], 'HMAC_DOWN_DIGITAL_SIGNATURE')
            flash = tools.call_args_list[1].args[1]
            self.assertEqual(flash[-14::2], ['0x0', '0x8000', '0x9000', '0xe000', '0x10000', '0xfe0000', '0xfe1000'])
        journal = json.loads((output / 'apply-journal.json').read_bytes())
        self.assertEqual(journal['state'], 'write-protected-images-pending')
        with patch.object(provision, 'inventory_reader', return_value=inventory) as inventory_read, \
             patch.object(provision, 'run_tool') as tools:
            with self.assertRaisesRegex(ValueError, 'reconcile fresh inventory'):
                provision.apply_bundle(output / 'reader-manifest.json', self.root, pubfile, '/mock-only', True)
            inventory_read.assert_called_once()
            tools.assert_not_called()
        (output / 'apply-journal.json').unlink()
        changed = copy.deepcopy(inventory)
        changed['module'] = 'DifferentModule'
        with patch.object(provision, 'inventory_reader', return_value=changed), patch.object(provision, 'run_tool') as tools:
            with self.assertRaisesRegex(ValueError, 'Fresh inventory'):
                provision.apply_bundle(output / 'reader-manifest.json', self.root, pubfile, '/mock-only', True)
            tools.assert_not_called()
        # Conflicting layout and DS binding never publish a partial bundle.
        table[12] = ord('X')
        self.write(partitionfile, table)
        with self.assertRaises(ValueError):
            provision.prepare_bundle(requestfile, self.directory / 'invalid-bundle')
        self.assertFalse((self.directory / 'invalid-bundle').exists())


if __name__ == '__main__':
    unittest.main()
