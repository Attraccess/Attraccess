"""NFC emulator driver over a TCP serial port, next to a reader in one place."""

import json
from pathlib import Path
import socket
import threading

from labgrid import Environment
from labgrid.binding import BindingState
from labgrid.resource.remote import RemotePlaceManager
import pytest
import yaml

from attractap_lab.drivers import (
    ESPToolDriver, NfcEmulatorDriver, NfcEmulatorError, NfcEmulatorFlashDriver, ReaderPowerDriver,
)
from attractap_lab.workflow import power_on, reader_power


def fake_emulator(listener, received, presses):
    """Answer like the firmware: boot noise, an event, log lines and replies.

    ``presses`` holds callbacks run on button.press before the reply.
    """
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
                elif command == "button.press":
                    for press in presses:
                        press(json.loads(arguments))
                    reply = {"ok": True, "result": {}}
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
    presses = []
    thread = threading.Thread(target=fake_emulator, args=(listener, received, presses), daemon=True)
    thread.start()
    yield listener.getsockname()[1], received, presses
    listener.close()


def environment(tmp_path, emulator_port, example="example-emulator-env.yaml", emulator=True):
    """An example's drivers with local stand-ins for the exported resources."""
    example = yaml.safe_load(Path(__file__).parents[1].joinpath(example).read_text())
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
    if not emulator:
        example["targets"]["main"]["resources"] = [
            resource for resource in example["targets"]["main"]["resources"]
            if not next(iter(resource.values())).get("name", "").startswith("NfcEmulator")
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
    port, received, _ = emulator_port
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


def reader_follows_presses(target, presses):
    """Make the reader's port appear on one press and disappear on two, like a Touch V1."""
    reader = target.get_resource("NetworkSerialPort", name="USBSerialPort", wait_avail=False)
    presses.append(lambda arguments: setattr(reader, "avail", arguments["count"] == 1))
    reader.avail = False
    return reader


def test_reader_power_presses_the_button_only_when_needed(tmp_path, monkeypatch, emulator_port):
    monkeypatch.setattr(RemotePlaceManager, "poll", lambda self: None)
    port, received, presses = emulator_port
    env = environment(tmp_path, port)
    target = env.get_target("main")
    try:
        reader_follows_presses(target, presses)
        power = target.get_driver("PowerProtocol")
        assert type(power) is ReaderPowerDriver
        assert not power.get()
        power.on()
        assert received[-1] == ("button.press", {"ms": 200, "count": 1, "gapMs": 300})
        assert power.get()
        power.on()
        power.off()
        assert received[-1] == ("button.press", {"ms": 200, "count": 2, "gapMs": 300})
        assert not power.get()
        power.off()
        power.delay = 0
        power.cycle()
        assert [command for command, _ in received].count("button.press") == 3
        assert power.get()
        presses.clear()  # A reader without a power button stays on.
        power.timeout = 0.5
        with pytest.raises(TimeoutError, match="did not turn off"):
            power.off()
    finally:
        env.cleanup()


def test_power_on_binds_the_place_emulator_for_reader_environments(tmp_path, monkeypatch, emulator_port):
    monkeypatch.setattr(RemotePlaceManager, "poll", lambda self: None)
    port, received, presses = emulator_port
    env = environment(tmp_path, port, example="example-env.yaml")
    target = env.get_target("main")
    try:
        reader = reader_follows_presses(target, presses)
        power_on(target)
        assert reader.avail
        assert received[-1] == ("button.press", {"ms": 200, "count": 1, "gapMs": 300})
        emulator = target.get_driver(NfcEmulatorDriver, activate=False)
        assert emulator.port.name == "NfcEmulatorSerial"
        # Its port is closed again, so the emulator can be flashed.
        assert emulator.state is not BindingState.active
        assert target.get_driver("SerialDriver", activate=False).port.name == "USBSerialPort"
        assert reader_power(target) is target.get_driver(ReaderPowerDriver, activate=False)
        power_on(target)
        assert [command for command, _ in received].count("button.press") == 1
    finally:
        env.cleanup()


def test_power_on_keeps_an_emulator_in_use(tmp_path, monkeypatch, emulator_port):
    monkeypatch.setattr(RemotePlaceManager, "poll", lambda self: None)
    port, received, presses = emulator_port
    env = environment(tmp_path, port)
    target = env.get_target("main")
    try:
        reader_follows_presses(target, presses)
        emulator = target.get_driver(NfcEmulatorDriver)
        power_on(target)
        assert emulator.state is BindingState.active
        assert emulator.command("status") == {"status": "ok"}
    finally:
        env.cleanup()


def test_places_without_an_emulator_have_no_reader_power(tmp_path, monkeypatch, emulator_port):
    monkeypatch.setattr(RemotePlaceManager, "poll", lambda self: None)
    env = environment(tmp_path, emulator_port[0], example="example-env.yaml", emulator=False)
    target = env.get_target("main")
    try:
        assert reader_power(target) is None
        power_on(target)
    finally:
        env.cleanup()
