"""Reader profile selection of the HIL suite."""

import json

import pytest

from attractap_lab import hil_profile


def test_default_profile_is_plain():
    assert hil_profile.reader_profile({}) == "plain"
    assert hil_profile.cmake_arguments("plain") == []


def test_unknown_profile_is_rejected():
    with pytest.raises(ValueError, match="READER_PROFILE"):
        hil_profile.reader_profile({"READER_PROFILE": "release"})


def test_secure_lab_builds_the_lab_profile_not_the_release_one():
    arguments = hil_profile.cmake_arguments(hil_profile.reader_profile({"READER_PROFILE": "secure-lab"}))
    assert arguments == ["-DATTRACTAP_SECURE_PROFILE=ON", "-DATTRACTAP_SECURE_LAB=ON"]
    assert hil_profile.build_directory_name("secure-lab") != hil_profile.build_directory_name("plain")


def test_secure_lab_needs_a_local_serial_port():
    with pytest.raises(ValueError, match="READER_SERIAL_PORT"):
        hil_profile.secure_lab_port({})
    assert hil_profile.secure_lab_port({"READER_SERIAL_PORT": "/dev/cu.x"}) == "/dev/cu.x"


def test_secure_flash_uses_the_lab_tool_and_erase_all_on_request():
    command = hil_profile.secure_flash_command("python3", "/dev/cu.x", "/b")
    assert command[1].endswith("tools/secure_lab_reader.py") and command[2] == "flash"
    assert "--erase-all" not in command
    assert hil_profile.secure_flash_command("python3", "/dev/cu.x", "/b", erase_all=True)[-1] == "--erase-all"
    assert hil_profile.SECURE_LAB_READER.exists()


def test_wifi_file(tmp_path):
    path = tmp_path / "wifi.json"
    path.write_text(json.dumps({"ssid": "Lab", "password": "pw"}))
    assert hil_profile.load_wifi(path) == ("Lab", "pw")
    path.write_text("{}")
    with pytest.raises(ValueError):
        hil_profile.load_wifi(path)
