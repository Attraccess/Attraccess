"""The HIL_WSS lab CA and TLS front (attractap_lab.lab_tls), against a local echo server."""

import shutil
import socket
import socketserver
import ssl
import threading

import pytest

from attractap_lab import lab_tls

pytestmark = pytest.mark.skipif(shutil.which("openssl") is None, reason="needs the openssl command line tool")


@pytest.fixture(scope="module")
def ca_dir(tmp_path_factory):
    directory = tmp_path_factory.mktemp("lab-tls")
    lab_tls.ensure_ca(directory)
    return directory


class Echo(socketserver.BaseRequestHandler):
    def handle(self):
        while data := self.request.recv(4096):
            self.request.sendall(data)


@pytest.fixture
def echo():
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Echo)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1]
    server.shutdown()
    server.server_close()


def client(cafile, max_version=None):
    context = ssl.create_default_context(cafile=cafile)
    if max_version:
        context.maximum_version = max_version
    return context


def test_the_ca_is_made_once(ca_dir):
    before = (ca_dir / "ca.pem").read_bytes()
    assert lab_tls.ensure_ca(ca_dir) == ca_dir.resolve() / "ca.pem"
    assert (ca_dir / "ca.pem").read_bytes() == before
    assert (ca_dir / "ca.key").stat().st_mode & 0o077 == 0


def test_the_chain_is_three_certificates_of_production_size(ca_dir, tmp_path):
    chain, key = lab_tls.issue_server("192.0.2.7", tmp_path, ca_dir)
    sizes = lab_tls.chain_der_sizes(chain)
    assert len(sizes) == 3
    assert 3800 < sum(sizes) < 4800, sizes
    # The leaf and its key stay out of the CA directory.
    assert key.parent == tmp_path and not list(ca_dir.glob("server*"))


def test_subject_alt_names():
    assert lab_tls.subject_alt_names("192.0.2.7") == "IP:192.0.2.7, DNS:localhost, IP:127.0.0.1"
    assert lab_tls.subject_alt_names("mac.local") == "DNS:mac.local, DNS:localhost, IP:127.0.0.1"
    assert lab_tls.subject_alt_names("127.0.0.1") == "IP:127.0.0.1, DNS:localhost"


def test_image_check(ca_dir, tmp_path):
    image = tmp_path / "reader.bin"
    image.write_bytes(b"\xe9app" + (ca_dir / "ca.pem").read_bytes() + b"\x00")
    assert lab_tls.image_trusts_ca(image, ca_dir)
    image.write_bytes(b"\xe9app without the lab CA")
    assert not lab_tls.image_trusts_ca(image, ca_dir)


def intel_hex(data, record=16):
    """``data`` as Intel HEX data records at address 0, like esptool merge-bin --format hex."""
    lines = []
    for offset in range(0, len(data), record):
        chunk = data[offset:offset + record]
        body = bytes([len(chunk), offset >> 8 & 0xFF, offset & 0xFF, 0]) + chunk
        lines.append(":" + (body + bytes([-sum(body) & 0xFF])).hex().upper())
    return ("\n".join(lines + [":00000001FF"]) + "\n").encode()


def test_image_check_reads_the_secure_lab_hex(ca_dir, tmp_path):
    image = tmp_path / "reader.hex"
    image.write_bytes(intel_hex(b"\xe9app" + (ca_dir / "ca.pem").read_bytes() + b"\x00"))
    assert lab_tls.image_trusts_ca(image, ca_dir)
    image.write_bytes(intel_hex(b"\xe9app without the lab CA" * 10))
    assert not lab_tls.image_trusts_ca(image, ca_dir)


def test_front_validates_with_the_lab_ca_and_forwards(ca_dir, echo, tmp_path):
    front = lab_tls.TlsFront(echo, directory=ca_dir, log=tmp_path / "tls.jsonl")
    port = front.start("127.0.0.1")
    try:
        with socket.create_connection(("127.0.0.1", port)) as raw, \
                client(ca_dir / "ca.pem").wrap_socket(raw, server_hostname="127.0.0.1") as tls:
            tls.sendall(b"GET / HTTP/1.1\r\n\r\n")
            assert tls.recv(100) == b"GET / HTTP/1.1\r\n\r\n"
        with socket.create_connection(("127.0.0.1", port)) as raw, pytest.raises(ssl.SSLCertVerificationError):
            client(None).wrap_socket(raw, server_hostname="127.0.0.1")
        with socket.create_connection(("127.0.0.1", port)) as raw, pytest.raises(ssl.SSLCertVerificationError):
            client(ca_dir / "ca.pem").wrap_socket(raw, server_hostname="192.0.2.99")
    finally:
        front.stop()
    assert '"event": "handshake"' in (tmp_path / "tls.jsonl").read_text()


def test_front_can_pin_tls_1_2(ca_dir, echo):
    front = lab_tls.TlsFront(echo, directory=ca_dir, max_version="1.2")
    port = front.start("127.0.0.1")
    try:
        with socket.create_connection(("127.0.0.1", port)) as raw, \
                client(ca_dir / "ca.pem").wrap_socket(raw, server_hostname="127.0.0.1") as tls:
            assert tls.version() == "TLSv1.2"
    finally:
        front.stop()
