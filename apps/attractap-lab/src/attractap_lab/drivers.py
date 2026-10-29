"""Only the missing labgrid operations: ESP flashing/eFuse reads, screen snapshots
and NFC card emulator commands.

Resources, USB discovery, SSH transport, locking and serial access use labgrid.
"""

import json
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import ProxyHandler, build_opener

import attr
import serial
from labgrid.driver import Driver, SerialDriver
from labgrid.factory import target_factory
from labgrid.protocol import ConsoleProtocol, ResetProtocol
from labgrid.resource.common import NetworkResource
from labgrid.util.managedfile import ManagedFile
from labgrid.util.proxy import proxymanager
from pexpect import TIMEOUT


@target_factory.reg_driver
@attr.s(eq=False)
class ESPToolDriver(Driver, ResetProtocol):
    bindings = {"device": {"USBFlashableDevice", "NetworkUSBFlashableDevice"}}
    esptool = attr.ib(default="esptool", validator=attr.validators.instance_of(str))
    espefuse = attr.ib(default="espefuse", validator=attr.validators.instance_of(str))
    baud = attr.ib(default=460800, validator=attr.validators.instance_of(int))
    timeout = attr.ib(default=180.0, converter=float)

    @Driver.check_active
    def flash(self, image):
        """Flash an ESP-IDF merged image at zero and hard-reset into firmware.

        SerialDriver must be inactive: esptool needs exclusive UART ownership.
        Staging a fixed filename also avoids shell metacharacters in labgrid's
        remote cache paths when agents supply downloaded artifact filenames.
        """
        self._write(image, ["write-flash", "0x0"])

    @Driver.check_active
    def erase_and_flash(self, image):
        """Erase the whole chip (NVS included), then flash a merged image at zero."""
        self._write(image, ["write-flash", "--erase-all", "0x0"])

    @Driver.check_active
    def reset(self):
        """Reboot existing firmware without flashing; SerialDriver must be inactive."""
        self._run([self.esptool, *self._connection(), "--after", "hard-reset", "--no-stub", "run"])

    @Driver.check_active
    def read_efuses(self):
        """Return espefuse's raw dump and JSON summary from one connection."""
        return self._run([self.espefuse, *self._connection(), "dump", "summary", "--format", "json"],
                         capture=True)

    def _write(self, image, arguments):
        if not self.device.devnode:
            raise RuntimeError("The flash resource has no serial device node")
        with tempfile.TemporaryDirectory(prefix="attractap-flash-") as directory:
            staged = Path(directory) / "firmware.bin"
            shutil.copyfile(image, staged)
            managed = ManagedFile(str(staged), self.device, detect_nfs=False)
            managed.sync_to_resource()
            self._run([self.esptool, *self._connection(), "--after", "hard-reset",
                       *arguments, managed.get_remote_path()])

    def _connection(self):
        if not self.device.devnode:
            raise RuntimeError("The flash resource has no serial device node")
        return ["--port", self.device.devnode, "--baud", str(self.baud)]

    def _run(self, tool_command, *, capture=False):
        command = self.device.wrap_command([
            "timeout", "--signal=TERM", "--kill-after=10s", str(self.timeout), *tool_command,
        ])
        if isinstance(self.device, NetworkResource):
            # A PTY makes SSH channel teardown deliver SIGHUP to the
            # foreground timeout/esptool group on cancellation as well.
            command.insert(1, "-tt")
        result = subprocess.run(command, check=True, stdin=subprocess.DEVNULL,
                                capture_output=capture, timeout=self.timeout + 20)
        # The PTY turns remote newlines into CRLF.
        return result.stdout.decode(errors="replace").replace("\r\n", "\n") if capture else None


@target_factory.reg_driver
@attr.s(eq=False)
class ScreenCaptureDriver(Driver):
    bindings = {"video": "HTTPVideoStream"}
    # FFmpeg's documented crop order: width:height:x:y (pixels).
    crop = attr.ib(default=None)
    ffmpeg = attr.ib(default="ffmpeg", validator=attr.validators.instance_of(str))
    timeout = attr.ib(default=15.0, converter=float)

    def __attrs_post_init__(self):
        super().__attrs_post_init__()
        if self.crop is not None and not re.fullmatch(r"[1-9]\d*:[1-9]\d*:\d+:\d+", self.crop):
            raise ValueError("crop must be width:height:x:y in nonnegative pixels")

    @Driver.check_active
    def capture(self, output):
        """Capture one frame from the shared camera, optionally cropped."""
        # HTTPVideoDriver's get_url() only honours global LG_PROXY. Honour
        # this exported resource's isolation metadata as serial resources do.
        parsed = urlsplit(self.video.url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("The camera must expose an HTTP(S) snapshot URL")
        endpoint = NetworkResource(None, None, host=parsed.hostname)
        endpoint.extra = getattr(self.video, "extra", {})
        host, port = proxymanager.get_host_and_port(
            endpoint, default_port=parsed.port or (443 if parsed.scheme == "https" else 80)
        )
        netloc = f"[{host}]:{port}" if ":" in host else f"{host}:{port}"
        url = urlunsplit(parsed._replace(netloc=netloc))
        # uStreamer serves a valid JPEG placeholder with HTTP 200 while the
        # capture device is offline. Check the metadata on the exact frame we
        # decode, so a missing webcam cannot masquerade as screen evidence.
        # The endpoint already goes through labgrid's SSH tunnel; environment
        # HTTP proxies must not redirect this private camera request.
        with build_opener(ProxyHandler({})).open(url, timeout=self.timeout) as response:
            if response.headers.get("X-UStreamer-Online", "").lower() == "false":
                raise RuntimeError("Camera is offline; no physical screen frame is available")
            snapshot = response.read(16 * 1024 * 1024 + 1)
        if len(snapshot) > 16 * 1024 * 1024:
            raise RuntimeError("Camera snapshot exceeds 16 MiB")
        command = [
            self.ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-i", "pipe:0", "-frames:v", "1",
        ]
        if self.crop:
            command += ["-vf", f"crop={self.crop}"]
        subprocess.run(command + [str(output)], input=snapshot, check=True, timeout=self.timeout + 5)


class NfcEmulatorError(RuntimeError):
    """The emulator rejected a command; ``code`` is its stable error code."""

    def __init__(self, code, message):
        super().__init__(f"{code}: {message}")
        self.code = code


@target_factory.reg_driver
@attr.s(eq=False)
class NfcEmulatorDriver(SerialDriver):
    """Commands for the NFC card emulator mounted in front of a reader.

    Bind ``port`` to the emulator's serial resource by name. The lower
    priorities keep plain SerialDriver/ConsoleProtocol lookups on the reader.
    The protocol is documented in apps/attractap/nfc-emulator/README.md.
    """
    priorities = {SerialDriver: -10, ConsoleProtocol: -10}
    command_timeout = attr.ib(default=10.0, converter=float)
    ready_timeout = attr.ib(default=15.0, converter=float)

    PREFIX = b"@nfc "

    def __attrs_post_init__(self):
        super().__attrs_post_init__()
        self._buffer = b""

    def on_activate(self):
        deadline = time.monotonic() + self.ready_timeout
        # The first RFC2217 negotiation through the exporter occasionally times out.
        while True:
            try:
                super().on_activate()
                break
            except serial.SerialException:
                self.close()
                if time.monotonic() >= deadline:
                    raise
                time.sleep(1)
        self._buffer = b""
        # Opening the port can reset the ESP32-S3, and input arriving before the
        # exporter configures the tty can leave a partial line. End it, then
        # wait until the emulator answers.
        self._write(b"\n")
        while True:
            try:
                self._exchange("health", None, 1.0)
                return
            except (TimeoutError, NfcEmulatorError):
                if time.monotonic() >= deadline:
                    raise TimeoutError("NFC emulator did not answer after connecting") from None

    @Driver.check_active
    def command(self, name, arguments=None, *, timeout=None):
        """Run one emulator command and return its result.

        Raises NfcEmulatorError when the emulator reports an error.
        """
        return self._exchange(name, arguments, self.command_timeout if timeout is None else timeout)

    def _exchange(self, name, arguments, timeout):
        line = name.encode()
        if arguments is not None:
            line += b" " + json.dumps(arguments, separators=(",", ":")).encode()
        # A reply that arrived after an earlier timeout must not answer this command.
        self._buffer = b""
        # The raw transport also works from on_activate, before the driver is active.
        self._write(line + b"\n")
        deadline = time.monotonic() + timeout
        while True:
            while b"\n" in self._buffer:
                raw, self._buffer = self._buffer.split(b"\n", 1)
                reply = self._parse(raw)
                if reply is None:
                    continue
                if reply["ok"]:
                    return reply["result"]
                raise NfcEmulatorError(reply["error"], reply["message"])
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"NFC emulator did not answer {name!r} within {timeout}s")
            try:
                self._buffer += self._read(timeout=min(0.25, remaining), max_size=4096)
            except TIMEOUT:
                pass

    def _parse(self, raw):
        """Return a reply object, or None for log output and event lines."""
        start = raw.find(self.PREFIX)
        if start < 0:
            return None
        try:
            reply = json.loads(raw[start + len(self.PREFIX):])
        except ValueError:
            return None
        return reply if isinstance(reply, dict) and "ok" in reply else None


@target_factory.reg_driver
@attr.s(eq=False)
class NfcEmulatorFlashDriver(ESPToolDriver):
    """ESPToolDriver for the emulator; plain ESPToolDriver lookups stay on the reader."""
    priorities = {ESPToolDriver: -10, ResetProtocol: -10}
