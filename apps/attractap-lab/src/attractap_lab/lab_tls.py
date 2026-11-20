"""wss:// for the HIL suite (HIL_WSS=1): a device-lab CA, a server certificate and a TLS front.

Production readers reach their server over wss://, and that outer TLS 1.2 session costs reader RAM.
In this mode the reader connects to a TLS terminator on this machine that forwards to the plain
local API, with certificate validation against a device-lab CA that only lab images trust (built
with ``-DATTRACTAP_LAB_CA=<ca.pem>``; tools/check_release_build.py fails a release image that has it).

The chain is shaped like a Let's Encrypt one: an RSA-2048 leaf issued by an RSA-2048 intermediate
under an RSA-4096 root (the size of ISRG Root X1, the CA readers lock onto), and the front serves
all three, about as large as the 3-certificate chain production servers send. The root and
intermediate are generated on first use into ``LAB_TLS_DIR`` (default ``apps/attractap-lab/lab-tls``,
gitignored: the keys never belong in the repository); the leaf is issued per run for the address
the reader is given, in a temporary directory that is gone once the front has loaded it. Needs the
``openssl`` command line tool (``OPENSSL`` overrides it).

    python3 lab_tls.py ca                     # create the CA if needed, print its PEM path
    python3 lab_tls.py check-image IMAGE      # exit 1 unless IMAGE embeds this CA
    python3 lab_tls.py serve --upstream PORT --host ADDRESS [--port PORT]
"""

import argparse
import asyncio
import contextlib
import fcntl
import ipaddress
import json
import os
import secrets
import ssl
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

DEFAULT_DIR = Path(os.environ.get("LAB_TLS_DIR") or Path(__file__).resolve().parents[2] / "lab-tls")
# Dates are not checked by the reader (CONFIG_MBEDTLS_HAVE_TIME_DATE is off), so a freshly flashed
# reader without server time accepts them; they only matter to other clients.
CA_DAYS = 3650
LEAF_DAYS = 90
# Non-critical extensions like a public CA's, so the certificates have a realistic size.
INFO = "http://lab-ca.attractap.invalid"

ROOT_CONFIG = """[req]
distinguished_name = dn
prompt = no
x509_extensions = ext
[dn]
O = Attractap device lab (never trusted by shipped firmware)
CN = Attractap Device Lab Root
[ext]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
"""
INTERMEDIATE_EXTENSIONS = f"""[ext]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, digitalSignature, keyCertSign, cRLSign
extendedKeyUsage = serverAuth, clientAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
authorityInfoAccess = caIssuers;URI:{INFO}/root.der
crlDistributionPoints = URI:{INFO}/root.crl
certificatePolicies = 2.23.140.1.2.1
"""
LEAF_EXTENSIONS = f"""[ext]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
authorityInfoAccess = OCSP;URI:{INFO}/ocsp, caIssuers;URI:{INFO}/intermediate.der
certificatePolicies = 2.23.140.1.2.1
subjectAltName = {{san}}
1.3.6.1.4.1.11129.2.4.2 = ASN1:FORMAT:HEX,OCTETSTRING:{{scts}}
"""
# Stands in for the three Signed Certificate Timestamps (about 120 bytes each) a public CA embeds;
# the reader skips this non-critical extension, but its bytes count towards the chain it receives.
SCT_BYTES = 360


class LabTlsError(Exception):
    """The lab CA or a certificate could not be made (reported without a traceback)."""


def openssl(*args, cwd):
    command = [os.environ.get("OPENSSL", "openssl"), *args]
    try:
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise LabTlsError(f"{command[0]} not found: HIL_WSS needs the openssl command line tool") from error
    if result.returncode != 0:
        raise LabTlsError(f"openssl {args[0]} failed: {result.stderr.strip()}")


def serial():
    return "0x" + secrets.token_hex(16)


def subject_alt_names(hostname):
    names = ["DNS:localhost", "IP:127.0.0.1"]
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        entry = f"DNS:{hostname}"
    else:
        entry = f"IP:{address}"
    return ", ".join(dict.fromkeys([entry, *names]))


def issue(directory, name, subject, bits, issuer, extensions, days):
    """Write ``name``.key and ``name``.pem into ``directory``: an RSA key and a certificate that
    ``issuer`` (a path without the .pem/.key suffix) signed."""
    directory = Path(directory)
    openssl("genrsa", "-out", f"{name}.key", str(bits), cwd=directory)
    os.chmod(directory / f"{name}.key", 0o600)
    (directory / f"{name}.ext").write_text(extensions)
    openssl("req", "-new", "-key", f"{name}.key", "-subj", subject, "-out", f"{name}.csr", cwd=directory)
    openssl("x509", "-req", "-in", f"{name}.csr", "-CA", f"{issuer}.pem", "-CAkey", f"{issuer}.key",
            "-set_serial", serial(), "-days", str(days), "-sha256", "-extfile", f"{name}.ext",
            "-extensions", "ext", "-out", f"{name}.pem", cwd=directory)
    for suffix in ("ext", "csr"):
        (directory / f"{name}.{suffix}").unlink()


@contextlib.contextmanager
def locked(directory):
    """Serialize runs that share the directory (the first use generates the CA)."""
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(directory / ".lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def ensure_ca(directory=DEFAULT_DIR):
    """The device-lab root (``ca.pem``, created with its intermediate on first use)."""
    directory = Path(directory)
    with locked(directory):
        if not (directory / "intermediate.pem").exists():
            openssl("genrsa", "-out", "ca.key", "4096", cwd=directory)
            os.chmod(directory / "ca.key", 0o600)
            (directory / "ca.cnf").write_text(ROOT_CONFIG)
            openssl("req", "-x509", "-new", "-key", "ca.key", "-config", "ca.cnf", "-set_serial", serial(),
                    "-days", str(CA_DAYS), "-sha256", "-out", "ca.pem", cwd=directory)
            (directory / "ca.cnf").unlink()
            issue(directory, "intermediate", "/O=Attractap device lab/CN=Attractap Device Lab R1", 2048,
                  directory.resolve() / "ca", INTERMEDIATE_EXTENSIONS, CA_DAYS)
    # Absolute: run.sh hands it to CMake, which resolves a relative path against the firmware directory.
    return directory.resolve() / "ca.pem"


def issue_server(hostname, into, directory=DEFAULT_DIR):
    """A leaf for ``hostname`` (an IP address or a DNS name) in ``into``; returns (chain, key) paths.

    The chain file holds leaf, intermediate and root, the order a server sends them in. Each run
    issues its own leaf elsewhere than the CA, so parallel runs never swap each other's key.
    """
    directory = Path(directory).resolve()
    ensure_ca(directory)
    into = Path(into)
    issue(into, "server", f"/CN={hostname}", 2048, directory / "intermediate",
          LEAF_EXTENSIONS.format(san=subject_alt_names(hostname), scts=secrets.token_hex(SCT_BYTES)),
          LEAF_DAYS)
    chain = into / "server-chain.pem"
    chain.write_text((into / "server.pem").read_text()
                     + "".join((directory / f"{name}.pem").read_text() for name in ("intermediate", "ca")))
    return chain, into / "server.key"


def chain_der_sizes(chain):
    """DER size of each certificate in a PEM chain (what the server's Certificate message carries)."""
    text = Path(chain).read_text()
    blocks = text.split("-----END CERTIFICATE-----")[:-1]
    return [len(ssl.PEM_cert_to_DER_cert(block.strip() + "\n-----END CERTIFICATE-----\n")) for block in blocks]


def image_bytes(image):
    """The flash content of a reader image: a .bin as is, an Intel HEX (the secure-lab image) decoded."""
    data = Path(image).read_bytes()
    if not data.startswith(b":"):
        return data
    # Data records in file order; esptool writes each part contiguously, so the app stays in one piece.
    return b"".join(bytes.fromhex(line[9:-2].decode()) for line in data.split()
                    if line.startswith(b":") and line[7:9] == b"00")


def image_trusts_ca(image, directory=DEFAULT_DIR):
    """Whether a reader image (app or merged .bin, or Intel HEX) embeds this machine's lab CA verbatim."""
    ca = (Path(directory) / "ca.pem").read_bytes().strip()
    return ca in image_bytes(image)


class TlsFront:
    """TLS terminator on all interfaces that forwards each connection to the plain API on 127.0.0.1.

    It passes bytes through, so the WebSocket upgrade and any HTTP reach the API unchanged.
    ``max_version`` "1.2" pins TLS 1.2; by default 1.2 and 1.3 are offered, like a typical reverse proxy.
    Each completed handshake (TLS version, cipher) is appended to ``log`` as JSON; a failed one only
    shows in the reader's log, since asyncio never hands it to the relay.
    """

    def __init__(self, upstream_port, port=0, directory=DEFAULT_DIR, max_version=None, log=None):
        self.upstream_port = upstream_port
        self.port = port
        self.directory = Path(directory)
        self.max_version = max_version
        self.log = Path(log) if log else None
        self.chain_der_bytes = None
        self._loop = None
        self._thread = None
        self._server = None

    def context(self, hostname):
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        if self.max_version:
            context.maximum_version = {"1.2": ssl.TLSVersion.TLSv1_2, "1.3": ssl.TLSVersion.TLSv1_3}[self.max_version]
        with tempfile.TemporaryDirectory(prefix="lab-tls-") as leaf:
            chain, key = issue_server(hostname, leaf, self.directory)
            context.load_cert_chain(chain, key)
            self.chain_der_bytes = chain_der_sizes(chain)
        return context

    def start(self, hostname):
        """Issue a certificate for ``hostname`` and listen; returns the port."""
        context = self.context(hostname)
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, name="lab-tls-front", daemon=True)
        self._thread.start()
        self._server = asyncio.run_coroutine_threadsafe(asyncio.start_server(
            # IPv4 only (readers have no IPv6 here): with port 0, one socket per family would get its own port.
            self._relay, host="0.0.0.0", port=self.port, ssl=context, ssl_handshake_timeout=30), self._loop).result()
        self.port = self._server.sockets[0].getsockname()[1]
        self.record({"event": "listening", "port": self.port, "hostname": hostname,
                     "chain_der_bytes": self.chain_der_bytes})
        return self.port

    def stop(self):
        if self._loop is None:
            return
        async def shutdown():
            self._server.close()
            tasks = [task for task in asyncio.all_tasks() if task is not asyncio.current_task()]
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        asyncio.run_coroutine_threadsafe(shutdown(), self._loop).result(10)
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(10)
        self._loop.close()
        self._loop = None

    def record(self, entry):
        if self.log:
            with self.log.open("a") as out:
                out.write(json.dumps({"time": round(time.time(), 1), **entry}) + "\n")

    async def _relay(self, reader, writer):
        tls = writer.get_extra_info("ssl_object")
        self.record({"event": "handshake", "peer": (writer.get_extra_info("peername") or ["?"])[0],
                     "version": tls.version(), "cipher": tls.cipher()[0]})
        try:
            upstream_reader, upstream_writer = await asyncio.open_connection("127.0.0.1", self.upstream_port)
        except OSError as error:
            self.record({"event": "upstream failed", "error": str(error)})
            writer.close()
            return
        pipes = [asyncio.ensure_future(pipe(reader, upstream_writer)),
                 asyncio.ensure_future(pipe(upstream_reader, writer))]
        try:
            await asyncio.wait(pipes, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in pipes:
                task.cancel()
            for side in (writer, upstream_writer):
                side.close()


async def pipe(source, sink):
    with contextlib.suppress(ConnectionError, ssl.SSLError):
        while data := await source.read(65536):
            sink.write(data)
            await sink.drain()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR, help="where the CA lives (LAB_TLS_DIR)")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("ca", help="create the lab CA if needed and print its PEM path")
    check = commands.add_parser("check-image", help="exit 1 unless the reader image embeds this lab CA")
    check.add_argument("image", type=Path)
    serve = commands.add_parser("serve", help="run the TLS front until interrupted")
    serve.add_argument("--upstream", type=int, required=True, help="port of the plain API on 127.0.0.1")
    serve.add_argument("--host", required=True, help="address or name the reader connects to")
    serve.add_argument("--port", type=int, default=0)
    serve.add_argument("--max-version", choices=("1.2", "1.3"))
    args = parser.parse_args(argv)
    try:
        if args.command == "ca":
            print(ensure_ca(args.dir))
        elif args.command == "check-image":
            ensure_ca(args.dir)
            if not image_trusts_ca(args.image, args.dir):
                print(f"{args.image} does not trust the lab CA in {args.dir}: build it with "
                      f"-DATTRACTAP_LAB_CA={args.dir / 'ca.pem'}", file=sys.stderr)
                return 1
        else:
            front = TlsFront(args.upstream, args.port, args.dir, args.max_version, log=Path("/dev/stdout"))
            front.start(args.host)
            with contextlib.suppress(KeyboardInterrupt):
                threading.Event().wait()
            front.stop()
    except LabTlsError as error:
        print(f"lab TLS: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
