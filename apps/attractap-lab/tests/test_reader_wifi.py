"""Host-side Wi-Fi provisioning: device lookup, claim check and serial line."""

import json

import pytest

from attractap_lab import reader_wifi


def test_reader_device_uses_the_readers_serial(tmp_path):
    config = tmp_path / "exporter.yaml"
    config.write_text(
        "reader-1:\n"
        "  USBSerialPort: {match: {ID_SERIAL_SHORT: 'AA:BB'}}\n"
        "  NfcEmulatorSerial: {cls: USBSerialPort, match: {ID_SERIAL_SHORT: 'CC:DD'}}\n"
    )
    by_id = tmp_path / "by-id"
    by_id.mkdir()
    (by_id / "usb-Espressif_USB_JTAG_serial_debug_unit_AA:BB-if00").touch()
    (by_id / "usb-Espressif_USB_JTAG_serial_debug_unit_CC:DD-if00").touch()
    assert reader_wifi.reader_device(config, "reader-1", by_id).endswith("_AA:BB-if00")
    with pytest.raises(SystemExit):
        reader_wifi.reader_device(config, "unknown", by_id)


def test_command_line_is_one_bounded_line():
    line = reader_wifi.command_line("Lab", 'pa"ss', "4711")
    assert line.startswith(b"\nCMND network.wifi.credentials.set ") and line.endswith(b"\n")
    payload = json.loads(line.split(b" ", 2)[2])
    assert payload == {"authCode": "4711", "ssid": "Lab", "password": 'pa"ss'}
    with pytest.raises(SystemExit):
        reader_wifi.command_line("Lab", "x" * 300, "4711")


@pytest.mark.parametrize("owner", [None, "attractap-lab-janitor/janitor"])
def test_refuses_unclaimed_or_parking_readers(tmp_path, monkeypatch, owner):
    monkeypatch.setattr(reader_wifi, "holder", lambda *args: owner)
    sent = []
    monkeypatch.setattr(reader_wifi, "send", lambda *args: sent.append(args))
    credentials = tmp_path / "wifi.json"
    credentials.write_text('{"ssid": "Lab", "password": "secret123"}')
    with pytest.raises(SystemExit):
        reader_wifi.main(["--place", "reader-1", "--auth-code", "4711", "--credentials", str(credentials),
                          "--exporter-config", str(tmp_path / "missing.yaml")])
    assert sent == []


def test_rejects_unsafe_arguments():
    with pytest.raises(SystemExit):
        reader_wifi.main(["--place", "../x", "--auth-code", "4711", "--credentials", "c", "--exporter-config", "e"])
    with pytest.raises(SystemExit):
        reader_wifi.main(["--place", "reader-1", "--auth-code", "1 2", "--credentials", "c", "--exporter-config", "e"])
