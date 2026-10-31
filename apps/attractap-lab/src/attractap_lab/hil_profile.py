"""Reader profiles of the hardware-in-the-loop suite (hil/).

``plain`` is the normal reader: an unsigned image written with labgrid's
ESPToolDriver, erased and parked by the lab janitor on release.

``secure-lab`` is a Secure Boot reader provisioned with the public lab keys and
development-mode flash encryption (ATT-1166, apps/attractap/firmware/lab/secure-boot).
It keeps the USB console and the serial command handler that the release secure
profile compiles out. Its images are signed with the lab key and written
encrypted by tools/secure_lab_reader.py. An unsigned park image would boot-loop
it, so the suite wipes it with ``flash --erase-all`` when it is done.
"""

from pathlib import Path
import json

PLAIN = "plain"
SECURE_LAB = "secure-lab"
PROFILES = (PLAIN, SECURE_LAB)

FIRMWARE_DIR = Path(__file__).resolve().parents[4] / "apps" / "attractap" / "firmware"
SECURE_LAB_READER = FIRMWARE_DIR / "tools" / "secure_lab_reader.py"


def reader_profile(environ):
    profile = environ.get("READER_PROFILE") or PLAIN
    if profile not in PROFILES:
        raise ValueError(f"READER_PROFILE must be one of {', '.join(PROFILES)}, not {profile!r}")
    return profile


def secure_lab_port(environ):
    """The reader's local serial device; secure-lab flashing runs on this machine."""
    port = environ.get("READER_SERIAL_PORT")
    if not port:
        raise ValueError("READER_PROFILE=secure-lab needs READER_SERIAL_PORT, the reader's serial device on this machine")
    return port


def secure_flash_command(python, port, build_dir, *, erase_all=False):
    """Command that signs and encrypted-flashes a lab secure build (and optionally erases first)."""
    command = [python, str(SECURE_LAB_READER), "flash", "--port", port, "--build-dir", str(build_dir)]
    if erase_all:
        command.append("--erase-all")
    return command


def load_wifi(path):
    """SSID and password from a local JSON file {"ssid": ..., "password": ...}."""
    data = json.loads(Path(path).read_text())
    if not isinstance(data.get("ssid"), str) or not data["ssid"] or not isinstance(data.get("password"), str):
        raise ValueError(f"{path} must hold {{\"ssid\": ..., \"password\": ...}}")
    return data["ssid"], data["password"]
