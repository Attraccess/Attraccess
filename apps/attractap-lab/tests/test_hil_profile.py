"""Reader profile selection of the HIL suite."""

import json
import os
from pathlib import Path
import subprocess

import pytest

from attractap_lab import hil_profile


RUN_SH = Path(__file__).parents[1] / "hil" / "run.sh"
# Detected independently of hil_profile's own path, so a broken FIRMWARE_DIR fails instead of skipping.
REPO_ROOT = Path(__file__).resolve().parents[3]
IN_REPO = (REPO_ROOT / "pnpm-workspace.yaml").is_file()


def test_default_profile_is_plain():
    assert hil_profile.reader_profile({}) == "plain"


def test_unknown_profile_is_rejected():
    with pytest.raises(ValueError, match="READER_PROFILE"):
        hil_profile.reader_profile({"READER_PROFILE": "release"})


def test_run_sh_builds_the_lab_profile_not_the_release_one():
    script = RUN_SH.read_text()
    assert "-DATTRACTAP_SECURE_PROFILE=ON -DATTRACTAP_SECURE_LAB=ON" in script
    assert "-DATTRACTAP_TEST_HOOKS=ON" in script


@pytest.mark.parametrize("env, message", [
    ({"READER_PROFILE": "release"}, "READER_PROFILE must be"),
    ({"READER_PROFILE": "secure-lab"}, "needs HIL_LOCAL_ENV"),
    ({"READER_PROFILE": "secure-lab", "HIL_LOCAL_ENV": "hil/example-desk-env.yaml"}, "needs READER_SERIAL_PORT"),
    ({"HIL_LOCAL_ENV": "hil/example-desk-env.yaml"}, "only supported with READER_PROFILE=secure-lab"),
    ({"READER_PROFILE": "secure-lab", "HIL_LOCAL_ENV": "hil/missing.yaml", "READER_SERIAL_PORT": "/dev/x"},
     "does not exist"),
    ({"READER_PROFILE": "secure-lab", "HIL_LOCAL_ENV": "hil/example-desk-env.yaml", "READER_SERIAL_PORT": "/dev/x"},
     "needs EMULATOR_SERIAL_PORT"),
    ({"READER_PROFILE": "secure-lab", "HIL_LOCAL_ENV": "hil/example-desk-env.yaml", "READER_SERIAL_PORT": "/dev/x",
      "EMULATOR_SERIAL_PORT": "/dev/y", "READER_WIFI_FILE": "missing.json"}, "needs READER_WIFI_FILE"),
])
@pytest.mark.skipif(not RUN_SH.is_file(), reason="hil/run.sh is not part of this package build")
def test_run_sh_rejects_bad_inputs_before_building(env, message):
    result = subprocess.run(["bash", str(RUN_SH)], cwd=RUN_SH.parents[1], capture_output=True, text=True,
                            env={"PATH": os.environ["PATH"], **env}, timeout=30)
    assert result.returncode == 1
    assert message in result.stderr


def test_secure_lab_needs_a_local_serial_port():
    with pytest.raises(ValueError, match="READER_SERIAL_PORT"):
        hil_profile.secure_lab_port({})
    assert hil_profile.secure_lab_port({"READER_SERIAL_PORT": "/dev/cu.x"}) == "/dev/cu.x"


def test_secure_flash_uses_the_lab_tool_and_erase_all_on_request():
    command = hil_profile.secure_flash_command("python3", "/dev/cu.x", "/b")
    assert command[1].endswith("tools/secure_lab_reader.py") and command[2] == "flash"
    assert "--erase-all" not in command
    assert hil_profile.secure_flash_command("python3", "/dev/cu.x", "/b", erase_all=True)[-1] == "--erase-all"


@pytest.mark.skipif(not IN_REPO, reason="the Nix package build only sees apps/attractap-lab, not the firmware tree")
def test_secure_lab_tool_exists_in_a_repo_checkout():
    assert hil_profile.FIRMWARE_DIR == REPO_ROOT / "apps" / "attractap" / "firmware"
    assert hil_profile.SECURE_LAB_READER.is_file()


def test_wifi_file(tmp_path):
    path = tmp_path / "wifi.json"
    path.write_text(json.dumps({"ssid": "Lab", "password": "pw"}))
    assert hil_profile.load_wifi(path) == ("Lab", "pw")
    path.write_text("{}")
    with pytest.raises(ValueError):
        hil_profile.load_wifi(path)
