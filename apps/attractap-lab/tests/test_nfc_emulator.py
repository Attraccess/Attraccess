"""NFC emulator driver over a TCP serial port, next to a reader in one place."""

import json
from pathlib import Path
import socket
import threading

from labgrid import Environment
from labgrid.resource.remote import RemotePlaceManager
import pytest
import yaml

from attractap_lab.drivers import (
    ESPToolDriver, NfcEmulatorDriver, NfcEmulatorError, NfcEmulatorFlashDriver,
)


def fake_emulator(listener, received):
    """Answer like the firmware: boot noise, an event, log lines and replies."""
    try:
        connection, _ = listener.accept()
    except OSError:
        return  # The test finished without connecting.
    with connection:
        connection.sendall(b"ESP-ROM:esp32s3\r\nI (24) boot: ESP-IDF\r\n"
                           b'@nfc {"event":"ready","protocol":1}\r\n')
        buffer = b""
        while True:
            data = connection.recv(1024)
            if not data:
                return
            buffer += data
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                if not line.strip():
                    continue
                command, _, arguments = line.decode().partition(" ")
                received.append((command, json.loads(arguments) if arguments else None))
                if command == "status":
                    # A reply to input the host never sent must be ignored.
                    connection.sendall(b'@nfc {"ok":false,"error":"invalid_command","message":"x"}\r\n')
                if command == "profiles.select":
                    reply = {"ok": True, "result": {"id": json.loads(arguments)["id"]}}
                elif command == "present":
                    reply = {"ok": False, "error": "no_profile", "message": "select a profile first"}
                elif command == "silent":
                    continue
                else:
                    reply = {"ok": True, "result": {"status": "ok"}}
                reply["command"] = command
                connection.sendall(b"I (900) pn532-target: log line\r\n@nfc "
                                   + json.dumps(reply).encode() + b"\r\n")


@pytest.fixture
def emulator_port():
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    received = []
    thread = threading.Thread(target=fake_emulator, args=(listener, received), daemon=True)
    thread.start()
    yield listener.getsockname()[1], received
    listener.close()


def environment(tmp_path, emulator_port):
    """The emulator example's drivers with local stand-ins for the exported resources."""
    example = yaml.safe_load(Path(__file__).parents[1].joinpath("example-emulator-env.yaml").read_text())
    flash = {"host": "localhost", "busnum": 1, "devnum": 2, "path": "1-1",
             "vendor_id": 0x303A, "model_id": 0x1001}
    example["targets"]["main"]["resources"] = [
        {"NetworkSerialPort": {"name": "USBSerialPort", "host": "127.0.0.1", "port": 9,
                               "protocol": "raw"}},
        {"NetworkSerialPort": {"name": "NfcEmulatorSerial", "host": "127.0.0.1",
                               "port": emulator_port, "protocol": "raw"}},
        {"NetworkUSBFlashableDevice": {"name": "USBFlashableDevice", **flash,
                                       "devnode": "/dev/ttyACM0"}},
        {"NetworkUSBFlashableDevice": {"name": "NfcEmulatorFlash", **flash,
                                       "devnode": "/dev/ttyACM1"}},
        {"HTTPVideoStream": {"url": "http://127.0.0.1:9/snapshot"}},
    ]
    (tmp_path / "env.yaml").write_text(yaml.safe_dump(example))
    return Environment(str(tmp_path / "env.yaml"))


def test_reader_lookups_ignore_the_emulator(tmp_path, emulator_port):
    env = environment(tmp_path, emulator_port[0])
    target = env.get_target("main")
    try:
        reader_console = target.get_driver("SerialDriver", activate=False)
        assert type(reader_console).__name__ == "SerialDriver"
        assert reader_console.port.name == "USBSerialPort"
        assert target.get_driver("ConsoleProtocol", activate=False) is reader_console
        reader_flash = target.get_driver(ESPToolDriver, activate=False)
        assert type(reader_flash) is ESPToolDriver
        assert reader_flash.device.devnode == "/dev/ttyACM0"
        assert target.get_driver("ResetProtocol", activate=False) is reader_flash
        emulator_flash = target.get_driver(NfcEmulatorFlashDriver, activate=False)
        assert emulator_flash.device.devnode == "/dev/ttyACM1"
    finally:
        env.cleanup()


def test_emulator_commands(tmp_path, monkeypatch, emulator_port):
    # Network resources normally come from a coordinator; these are local.
    monkeypatch.setattr(RemotePlaceManager, "poll", lambda self: None)
    port, received = emulator_port
    env = environment(tmp_path, port)
    target = env.get_target("main")
    try:
        emulator = target.get_driver(NfcEmulatorDriver)
        assert received[0] == ("health", None), "activation waits until the emulator answers"
        assert emulator.command("profiles.select", {"id": "card a"}) == {"id": "card a"}
        assert received[-1] == ("profiles.select", {"id": "card a"})
        with pytest.raises(NfcEmulatorError) as error:
            emulator.command("present")
        assert error.value.code == "no_profile"
        with pytest.raises(TimeoutError):
            emulator.command("silent", timeout=0.5)
        assert emulator.command("status") == {"status": "ok"}
        assert "I (900) pn532-target: log line" in emulator.read_log()
        assert emulator.read_log() == []
    finally:
        env.cleanup()
