"""hil/run.sh refuses a reader profile that does not fit the place, before it builds anything."""

import os
from pathlib import Path
import subprocess
import sys

import pytest

RUN_SH = Path(__file__).parents[1] / "hil" / "run.sh"
pytestmark = pytest.mark.skipif(not RUN_SH.is_file(), reason="hil/run.sh is not part of this package build")


def run(tmp_path, env, place_output=None):
    """Run run.sh with a stand-in labgrid-client that prints ``place_output`` for `show` (None: fails)."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    client = bin_dir / "labgrid-client"
    if place_output is None:
        client.write_text("#!/bin/sh\necho 'coordinator unavailable' >&2\nexit 1\n")
    else:
        (tmp_path / "place.txt").write_text(place_output)
        client.write_text(f"#!/bin/sh\ncat '{tmp_path / 'place.txt'}'\n")
    client.chmod(0o755)
    result = subprocess.run(
        ["bash", str(RUN_SH)], cwd=RUN_SH.parents[1], capture_output=True, text=True, timeout=30,
        env={"PATH": f"{bin_dir}:{os.environ['PATH']}", "LAB_PYTHON": sys.executable, "TMPDIR": str(tmp_path), **env})
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
