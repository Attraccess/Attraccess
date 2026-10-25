"""Exercise the labgrid coordinator/exporter/client path without USB hardware.

Only the SSH hardware endpoint is simulated. Claims, exported resource binding,
ManagedFile transfer, TCP serial, HTTP snapshot and FFmpeg crop are real.
"""

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import threading
import time

from labgrid.remote.client import start_session
from labgrid.resource.remote import RemotePlaceManager
from labgrid.util.ssh import sshmanager
import pytest
import yaml

from attractap_lab.workflow import claim, smoke


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


@contextmanager
def running(command, directory):
    with (directory / f"{Path(command[0]).name}.log").open("w+") as log:
        process = subprocess.Popen(command, cwd=directory, stdout=log, stderr=log)
        try:
            yield process
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            if process.returncode not in (0, -15):
                log.seek(0)
                print(log.read())


def eventually(check, process, seconds=10):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        assert process.poll() is None, "Labgrid process exited; see captured log"
        try:
            if check():
                return
        except (OSError, RuntimeError):
            pass
        time.sleep(0.1)
    pytest.fail("Labgrid did not become ready")


@pytest.mark.parametrize("fail_flash", [False, True], ids=["success", "flash-failure"])
def test_exported_reader_lifecycle(tmp_path, monkeypatch, fail_flash):
    assert shutil.which("ffmpeg"), "Hardware workflow integration test requires FFmpeg"
    def executable(name):
        # Nix exposes dependencies on PATH, while a developer venv places them
        # beside its interpreter. Prefer the active environment's tools.
        candidate = Path(sys.executable).parent / name
        return str(candidate) if candidate.exists() else shutil.which(name)
    address = f"127.0.0.1:{free_port()}"
    monkeypatch.setenv("LG_COORDINATOR", address)
    # Separate state per test; labgrid's native RemotePlaceManager is global.
    manager = RemotePlaceManager.get()
    if manager.session:
        manager.loop.run_until_complete(manager.session.stop())
        manager.loop.run_until_complete(manager.session.close())
    manager.session = manager.loop = None
    manager.resources.clear()
    manager.unmanaged_resources.clear()

    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i",
                    "color=c=red:s=64x48", "-frames:v", "1", str(tmp_path / "camera.png")], check=True)
    snapshot = (tmp_path / "camera.png").read_bytes()

    class Camera(BaseHTTPRequestHandler):
        def do_GET(self):
            assert self.path == "/snapshot"
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(snapshot)))
            self.end_headers()
            self.wfile.write(snapshot)

        def log_message(self, *_):
            pass

    camera = ThreadingHTTPServer(("127.0.0.1", 0), Camera)
    camera_thread = threading.Thread(target=camera.serve_forever, daemon=True)
    camera_thread.start()
    serial = socket.socket()
    serial.bind(("127.0.0.1", 0))
    serial.listen()
    serial.settimeout(30)
    events = []

    def uart():
        try:
            connection, _ = serial.accept()
            with connection:
                events.append("serial-open")
                connection.sendall(b"Attractap ready\n" * 1000)
                while connection.recv(1024):
                    pass
                events.append("serial-close")
        except (TimeoutError, OSError):
            pass

    threading.Thread(target=uart, daemon=True).start()
    exporter_config = {
        "reader-1": {
            "NetworkUSBFlashableDevice": {
                "host": "exporter.test", "busnum": 1, "devnum": 2, "path": "1-1",
                "vendor_id": 0x303A, "model_id": 0x1001, "devnode": "/dev/ttyACM-test",
            },
            "NetworkSerialPort": {
                "host": "127.0.0.1", "port": serial.getsockname()[1], "protocol": "raw",
            },
            "HTTPVideoStream": {"url": f"http://127.0.0.1:{camera.server_port}/snapshot"},
        }
    }
    (tmp_path / "exporter.yaml").write_text(yaml.safe_dump(exporter_config))
    (tmp_path / "env.yaml").write_text(yaml.safe_dump({
        "imports": ["attractap_lab.drivers"],
        "targets": {"main": {
            "resources": {"RemotePlace": {"name": "wrong-place-overridden-by-claim"}},
            "drivers": {"ESPToolDriver": {}, "SerialDriver": {},
                        "ScreenCaptureDriver": {"crop": "32:24:4:6"}},
        }},
    }))

    class RemoteEndpoint:
        def get_prefix(self):
            return ["fake-ssh", "exporter.test"]

        def run_check(self, command):
            assert command.startswith("mkdir -p /var/cache/labgrid/")
            events.append("mkdir")
            return []

        def put_file(self, local, remote):
            assert Path(local).read_bytes() == b"firmware"
            assert remote.endswith("/firmware.bin")
            events.append("transfer")

    remote = RemoteEndpoint()
    monkeypatch.setattr(sshmanager, "open", lambda host: remote)
    monkeypatch.setattr(sshmanager, "get", lambda host: remote)
    forwards = []

    def forward(host, destination, port):
        forwards.append((host, destination, port))
        return port  # Fake SSH endpoint reaches the same test-loopback sockets.

    monkeypatch.setattr(sshmanager, "request_forward", forward)
    real_run = subprocess.run

    def hardware_command(command, **kwargs):
        if command[0] != "fake-ssh":
            return real_run(command, **kwargs)
        assert command[1] == "-tt"
        assert command[3:6] == ["--", "timeout", "--signal=TERM"]
        assert "hard-reset" in command
        if command[-1] == "run":
            assert command[-2:] == ["--no-stub", "run"]
            events.append("reset")
            return subprocess.CompletedProcess(command, 0)
        assert command[-3:-1] == ["write-flash", "0x0"]
        assert events[-1] == "transfer"
        events.append("flash")
        if fail_flash:
            raise subprocess.CalledProcessError(2, command)
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(subprocess, "run", hardware_command)
    firmware = tmp_path / "image with spaces.bin"
    firmware.write_bytes(b"firmware")
    try:
        with running([executable("labgrid-coordinator"), "-l", address], tmp_path) as coordinator:
            def listening():
                with socket.create_connection(tuple(["127.0.0.1", int(address.split(":")[1])]), timeout=0.1):
                    return True
            eventually(listening, coordinator)
            with running([executable("labgrid-exporter"), "-c", address, "-n", "test", "--isolated",
                          "--hostname", "exporter.test", str(tmp_path / "exporter.yaml")], tmp_path) as exporter:
                session = start_session(address)
                try:
                    def exported():
                        session.loop.run_until_complete(session.sync_with_coordinator())
                        return "test" in session.resources and "reader-1" in session.resources["test"]
                    eventually(exported, exporter)
                finally:
                    session.loop.run_until_complete(session.stop())
                    session.loop.run_until_complete(session.close())
                client = [executable("labgrid-client"), "-x", address, "-p", "reader-1"]
                real_run(client + ["create"], check=True)
                real_run(client + ["add-match", "test/reader-1/*"], check=True)
                try:
                    with claim(tmp_path / "env.yaml", "reader-1") as target:
                        # Confirm native locking rejects a second claimant.
                        busy = real_run(client + ["acquire"], capture_output=True)
                        assert busy.returncode != 0
                        if fail_flash:
                            with pytest.raises(subprocess.CalledProcessError):
                                smoke(target, firmware, tmp_path / "artifacts", log_seconds=0.5, max_log_bytes=1024)
                            raise RuntimeError("Caller failure must still release the place")
                        smoke(target, firmware, tmp_path / "artifacts", log_seconds=0.5,
                              max_log_bytes=1024, expect="Attractap ready")
                        # Native labgrid ResetProtocol resolves to this driver,
                        # rebooting the existing image without another transfer.
                        target.get_driver("ResetProtocol").reset()
                        assert events.count("transfer") == 1
                        assert events.count("reset") == 1
                        log = (tmp_path / "artifacts/serial.log").read_bytes()
                        assert len(log) == 1024 and b"Attractap ready" in log
                        png = (tmp_path / "artifacts/screen.png").read_bytes()
                        assert png.startswith(b"\x89PNG\r\n\x1a\n")
                        assert int.from_bytes(png[16:20], "big") == 32
                        assert int.from_bytes(png[20:24], "big") == 24
                        assert forwards, "Isolated camera/serial must use labgrid SSH forwarding"
                except RuntimeError as error:
                    assert fail_flash and str(error).startswith("Caller failure")
                # The previous context released even on a flash/caller exception.
                real_run(client + ["acquire"], check=True)
                real_run(client + ["release"], check=True)
                maintenance_command = (
                    "import subprocess, sys; "
                    f"result = subprocess.run({client + ['acquire']!r}, capture_output=True); "
                    "assert result.returncode != 0, 'Maintenance did not hold the reader'; "
                    f"sys.exit({23 if fail_flash else 0})"
                )
                maintenance = real_run([
                    sys.executable, "-m", "attractap_lab.maintenance", "--coordinator", address,
                    "--", sys.executable, "-c", maintenance_command,
                ])
                assert maintenance.returncode == (23 if fail_flash else 0)
                real_run(client + ["acquire"], check=True)
                real_run(client + ["release"], check=True)
                assert events[:3] == ["mkdir", "transfer", "flash"]
                if not fail_flash:
                    assert events[3] == "serial-open"
    finally:
        serial.close()
        camera.shutdown()
        camera.server_close()
        if manager.session:
            manager.loop.run_until_complete(manager.session.stop())
            manager.loop.run_until_complete(manager.session.close())
            manager.session = manager.loop = None
            manager.resources.clear()
            manager.unmanaged_resources.clear()
