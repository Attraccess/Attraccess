"""Only the missing labgrid operations: ESP flashing and screen snapshots.

Resources, USB discovery, SSH transport, locking and serial access use labgrid.
"""

import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import ProxyHandler, build_opener

import attr
from labgrid.driver import Driver
from labgrid.factory import target_factory
from labgrid.protocol import ResetProtocol
from labgrid.resource.common import NetworkResource
from labgrid.util.managedfile import ManagedFile
from labgrid.util.proxy import proxymanager


@target_factory.reg_driver
@attr.s(eq=False)
class ESPToolDriver(Driver, ResetProtocol):
    bindings = {"device": {"USBFlashableDevice", "NetworkUSBFlashableDevice"}}
    esptool = attr.ib(default="esptool", validator=attr.validators.instance_of(str))
    baud = attr.ib(default=460800, validator=attr.validators.instance_of(int))
    timeout = attr.ib(default=180.0, converter=float)

    @Driver.check_active
    def flash(self, image):
        """Flash an ESP-IDF merged image at zero and hard-reset into firmware.

        SerialDriver must be inactive: esptool needs exclusive UART ownership.
        Staging a fixed filename also avoids shell metacharacters in labgrid's
        remote cache paths when agents supply downloaded artifact filenames.
        """
        if not self.device.devnode:
            raise RuntimeError("The flash resource has no serial device node")
        with tempfile.TemporaryDirectory(prefix="attractap-flash-") as directory:
            staged = Path(directory) / "firmware.bin"
            shutil.copyfile(image, staged)
            managed = ManagedFile(str(staged), self.device, detect_nfs=False)
            managed.sync_to_resource()
            self._run(["write-flash", "0x0", managed.get_remote_path()])

    @Driver.check_active
    def reset(self):
        """Reboot existing firmware without flashing; SerialDriver must be inactive."""
        self._run(["--no-stub", "run"])

    def _run(self, arguments):
        if not self.device.devnode:
            raise RuntimeError("The flash resource has no serial device node")
        command = self.device.wrap_command([
            "timeout", "--signal=TERM", "--kill-after=10s", str(self.timeout),
            self.esptool, "--port", self.device.devnode,
            "--baud", str(self.baud), "--after", "hard-reset",
            *arguments,
        ])
        if isinstance(self.device, NetworkResource):
            # A PTY makes SSH channel teardown deliver SIGHUP to the
            # foreground timeout/esptool group on cancellation as well.
            command.insert(1, "-tt")
        subprocess.run(command, check=True, stdin=subprocess.DEVNULL,
                       timeout=self.timeout + 20)


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
