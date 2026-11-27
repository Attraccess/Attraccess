"""hil/run.sh refuses a reader profile that does not fit the place, before it builds anything, and publishes the flashed ELF."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

RUN_SH = Path(__file__).parents[1] / "hil" / "run.sh"
FIRMWARE = RUN_SH.parents[2] / "attractap" / "firmware"
pytestmark = pytest.mark.skipif(not RUN_SH.is_file(), reason="hil/run.sh is not part of this package build")
needs_firmware = pytest.mark.skipif(not (FIRMWARE / "build_firmwares.py").is_file(),
                                    reason="the firmware sources are not part of this package build")


def run(tmp_path, env, place_output=None, run_sh=RUN_SH, timeout=30):
    """Run run.sh with a stand-in labgrid-client that prints ``place_output`` for `show` (None: fails).

    The stand-ins go first on PATH, also ahead of a PATH in ``env``, so a real labgrid-client is never reached.
    """
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    client = bin_dir / "labgrid-client"
    if place_output is None:
        client.write_text("#!/bin/sh\necho 'coordinator unavailable' >&2\nexit 1\n")
    else:
        (tmp_path / "place.txt").write_text(place_output)
        client.write_text(f"#!/bin/sh\ncat '{tmp_path / 'place.txt'}'\n")
    client.chmod(0o755)
    # run.sh only checks that LAB_PYTHON imports labgrid and pytest; the test's own
    # interpreter may not (Nix check phase), so a stand-in answers yes.
    lab_python = bin_dir / "lab-python"
    lab_python.write_text("#!/bin/sh\nexit 0\n")
    lab_python.chmod(0o755)
    result = subprocess.run(
        ["bash", str(run_sh)], cwd=run_sh.parents[1], capture_output=True, text=True, timeout=timeout,
        env={"LAB_PYTHON": str(lab_python), "TMPDIR": str(tmp_path), **env,
             "PATH": f"{bin_dir}:{env.get('PATH', os.environ['PATH'])}"})
    return result.returncode, result.stderr


def place(tags):
    return f"Place 'x':\n  comment: test\n  tags: {tags}\n  matches:\n    lab/x/*\n"


SECURE_TAGS = "board=attractap-secure-lab, profile=secure-lab, variant=attractap-touch-v2-secure-lab"


def test_unknown_profile(tmp_path):
    assert run(tmp_path, {"READER_PROFILE": "release"}) == (1, "READER_PROFILE must be plain or secure-lab\n")


def test_secure_lab_builds_its_own_image(tmp_path):
    code, stderr = run(tmp_path, {"READER_PROFILE": "secure-lab", "READER_IMAGE": "/tmp/reader.bin"})
    assert code == 1 and "builds its own signed image" in stderr


def test_plain_image_is_refused_on_the_secure_place(tmp_path):
    code, stderr = run(tmp_path, {"LG_PLACE_NAME": "attractap-touch-v2-secure-1"}, place(SECURE_TAGS))
    assert code == 1
    assert "attractap-touch-v2-secure-1 is a secure-lab reader, but READER_PROFILE=plain" in stderr


@pytest.mark.parametrize("tags", ["board=attractap, profile=plain, variant=attractap-touch-v2", "board=attractap"])
def test_secure_lab_is_refused_on_a_plain_place(tmp_path, tags):
    code, stderr = run(tmp_path, {"READER_PROFILE": "secure-lab", "LG_PLACE_NAME": "attractap-touch-v2-1"},
                       place(tags))
    assert code == 1
    assert "attractap-touch-v2-1 is a plain reader, but READER_PROFILE=secure-lab" in stderr


def test_unreadable_place_stops_the_run(tmp_path):
    code, stderr = run(tmp_path, {"READER_PROFILE": "secure-lab"})
    assert code == 1 and "Cannot read place attractap-touch-v2-secure-1" in stderr


def test_matching_place_goes_on_to_the_build(tmp_path):
    # Past the place check, the build needs ESP-IDF, which this PATH lacks.
    code, stderr = run(tmp_path, {"READER_PROFILE": "secure-lab"}, place(SECURE_TAGS))
    assert code == 1 and "Source ESP-IDF export.sh first" in stderr


def run_to_api_start(tmp_path, variant="attractap-touch-v2", secure_profile_build="true", **env):
    """Run run.sh with stand-in build tools until the API start, which fails. Returns what the API would have indexed."""
    bin_dir = tmp_path / "stubs"
    bin_dir.mkdir()
    # idf.py stand-in: its "ELF" names the version it was built with, so each build differs.
    (bin_dir / "idf.py").write_text(
        f'#!/bin/sh\necho "$*" >>\'{tmp_path / "idf.log"}\'\n'
        'while [ $# -gt 0 ]; do case "$1" in -B) dir="$2";; -DATTRACTAP_VERSION_OVERRIDE=*) v="${1#*=}";; esac; shift; done\n'
        'mkdir -p "$dir"; printf "elf:%s" "$v" >"$dir/attractap.elf"; printf "bin" >"$dir/attractap.bin"; printf "" >"$dir/flash_args"\n')
    (bin_dir / "esptool").write_text("#!/bin/sh\nwhile [ $# -gt 0 ]; do [ \"$1\" = -o ] && : >\"$2\"; shift; done\n")
    # pnpm stand-in (the API start): keep what the API would index, then fail so run.sh stops.
    (bin_dir / "pnpm").write_text(f"#!/bin/sh\ncp -r \"$ATTRACTAP_FIRMWARE_ASSETS_DIR\" '{tmp_path / 'published'}'\nexit 1\n")
    for stub in ("idf.py", "esptool", "pnpm"):
        (bin_dir / stub).chmod(0o755)
    # A scratch checkout: run.sh builds under its ROOT, which must not be the real tree.
    root = tmp_path / "checkout"
    (root / "apps/attractap-lab/hil").mkdir(parents=True)
    (root / "apps/attractap-lab/real-cards").mkdir()
    (root / "apps/attractap-lab/real-cards/wiretap.cjs").write_text("")
    (root / "apps/attractap/firmware/tools").mkdir(parents=True)
    (root / "apps/attractap/firmware/tools/build_individual_ca_certs.py").write_text("")
    (root / "apps/attractap/firmware/version.txt").write_text("9.9.9\n")
    # The real variant parser, with a variant file holding the one switch run.sh reads.
    for name in ("build_firmwares.py", "secure_packaging.py"):
        shutil.copy(FIRMWARE / name, root / "apps/attractap/firmware" / name)
    (root / "apps/attractap/firmware/variants").mkdir()
    (root / f"apps/attractap/firmware/variants/{variant}.cmake").write_text(
        f'set(ATTRACTAP_SECURE_PROFILE_BUILD "{secure_profile_build}")\n')
    run_sh = root / "apps/attractap-lab/hil/run.sh"
    shutil.copy(RUN_SH, run_sh)
    env = {"PATH": f"{bin_dir}:{os.environ['PATH']}", "EMULATOR_IMAGE": "/dev/null",
           "HIL_DATABASE_URL": "postgres://hil:hil@127.0.0.1:5432/hil", "READER_VARIANT": variant, **env}
    code, stderr = run(tmp_path, env, place(f"board=attractap, profile=plain, variant={variant}"), run_sh)
    assert code == 1, stderr
    return tmp_path / "published"


def secure_profile_builds(tmp_path):
    return [line for line in (tmp_path / "idf.log").read_text().splitlines() if "-DATTRACTAP_SECURE_PROFILE=ON" in line]


@needs_firmware
def test_published_elf_is_the_flashed_build_not_the_ota_rebuild(tmp_path):
    """The OTA build rewrites the reader's build directory; the symbols published for coredumps must stay the flashed ELF's."""
    # NO_CONVERSION_BUILD: this test is about the published ELF, not the "Secure this reader" image build.
    published = run_to_api_start(tmp_path, NO_CONVERSION_BUILD="1")
    assert (published / "hil-reader.elf").read_bytes() == b"elf:"  # the base build has no version override
    manifest = json.loads((published / "firmwares.json").read_text())
    assert manifest["firmwares"][0]["buildId"] == hashlib.sha256(b"elf:").hexdigest()


@needs_firmware
def test_no_secure_image_for_a_variant_without_a_secure_profile_build(tmp_path):
    # Reaching the API start also shows that nothing tried to package a secure image.
    run_to_api_start(tmp_path, "attractap-touch", secure_profile_build="false")
    assert secure_profile_builds(tmp_path) == []


@needs_firmware
def test_secure_image_for_a_variant_with_a_secure_profile_build(tmp_path):
    # The stand-in build leaves nothing to package, so run.sh stops right after it, before the API start.
    published = run_to_api_start(tmp_path)
    assert len(secure_profile_builds(tmp_path)) == 1
    assert not published.exists()


@pytest.mark.skipif(shutil.which("openssl") is None, reason="needs the openssl command line tool")
def test_wss_refuses_an_image_without_the_lab_ca(tmp_path):
    image = tmp_path / "reader.bin"
    image.write_bytes(b"\xe9 an image built without -DATTRACTAP_LAB_CA")
    # Generating the RSA-4096 lab root alone can take tens of seconds on a busy machine.
    code, stderr = run(tmp_path, {"HIL_WSS": "1", "LAB_TLS_DIR": str(tmp_path / "lab-tls"), "READER_IMAGE": str(image)},
                       place("board=attractap, profile=plain, variant=attractap-touch-v2"), timeout=300)
    assert code == 1 and "needs reader images that trust the lab CA" in stderr
    assert (tmp_path / "lab-tls" / "ca.pem").exists()
    # A reader image with the CA does not help when the update image lacks it.
    image.write_bytes(b"\xe9" + (tmp_path / "lab-tls" / "ca.pem").read_bytes())
    ota = tmp_path / "ota-app.bin"
    ota.write_bytes(b"\xe9 an update image built without -DATTRACTAP_LAB_CA")
    (tmp_path / "again").mkdir()
    code, stderr = run(tmp_path / "again", {"HIL_WSS": "1", "LAB_TLS_DIR": str(tmp_path / "lab-tls"),
                                            "READER_IMAGE": str(image), "READER_OTA_IMAGE": str(ota)},
                       place("board=attractap, profile=plain, variant=attractap-touch-v2"), timeout=300)
    assert code == 1 and f"{ota} does not trust the lab CA" in stderr
