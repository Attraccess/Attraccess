"""The HIL console capture notices a lost serial connection and keeps saying why."""

from pathlib import Path
import sys
import time

import pytest
from pexpect import TIMEOUT
from serial import SerialException

HIL = Path(__file__).parents[1] / "hil"
pytestmark = pytest.mark.skipif(not (HIL / "support.py").is_file(), reason="hil/ is not part of this package build")


@pytest.fixture
def support(monkeypatch):
    monkeypatch.syspath_prepend(str(HIL))
    import support

    yield support
    sys.modules.pop("support", None)


class Driver:
    """Gives ``chunks`` in turn (an exception is raised), then stays silent."""

    def __init__(self, *chunks):
        self.chunks = list(chunks)

    def _read(self, **kwargs):
        if not self.chunks:
            time.sleep(0.01)
            raise TIMEOUT("quiet")
        chunk = self.chunks.pop(0)
        if isinstance(chunk, Exception):
            raise chunk
        return chunk


def wait_until(done):
    deadline = time.monotonic() + 5
    while not done():
        assert time.monotonic() < deadline
        time.sleep(0.01)


def test_a_lost_connection_is_recorded_once_and_cleared_by_a_restart(support, tmp_path):
    dead = SerialException("connection failed (reader thread died)")
    driver = Driver(b"boot\n", dead, dead)
    console = support.ReaderConsole(driver, tmp_path / "serial.log")

    console.start()
    wait_until(lambda: not driver.chunks)
    console.stop()

    assert console.lost == "SerialException: connection failed (reader thread died)"
    assert (tmp_path / "serial.log").read_text().count("serial connection lost") == 1
    console.start()
    assert console.lost is None
    console.stop()


def test_silence_is_not_a_lost_connection(support, tmp_path):
    driver = Driver(b"boot\n")
    console = support.ReaderConsole(driver, tmp_path / "serial.log")

    console.start()
    console.expect("boot", 0, 5)
    console.stop()

    assert console.lost is None
