"""The HIL console matches only complete lines, so a UART chunk that ends inside a line never yields a cut capture."""

from pathlib import Path
import sys
import threading
import time

import pytest

HIL = Path(__file__).parents[1] / "hil"
pytestmark = pytest.mark.skipif(not (HIL / "support.py").is_file(), reason="hil/ is not part of this package build")


@pytest.fixture
def console(monkeypatch, tmp_path):
    monkeypatch.syspath_prepend(str(HIL))
    import support

    yield support.ReaderConsole(driver=None, log_path=tmp_path / "reader.log")
    sys.modules.pop("support", None)


def arrive(console, chunk, delay):
    def append():
        time.sleep(delay)
        with console.lock:
            console.data += chunk

    threading.Thread(target=append, daemon=True).start()


def test_a_line_cut_by_a_chunk_is_matched_once_it_is_complete(console):
    console.data = b"[NFC] DEBUG: Card detected\n[Application] INFO: Card detected: 0"
    arrive(console, b"8a11ce1\r\n", 0.3)

    match = console.expect(r"Card detected: ([0-9a-f]+)", 0, 5)

    assert match.group(1) == b"08a11ce1"


def test_an_unfinished_line_does_not_match(console):
    console.data = b"OTA aborted: bad ma"

    with pytest.raises(AssertionError, match="did not show"):
        console.expect(r"OTA aborted: ([^\r\n]*)", 0, 0.3)


def test_matches_after_the_mark_only(console):
    console.data = b"Card removed\n"
    mark = console.mark()
    console.data += b"Card detected: 08a11ce1\n"

    assert console.expect(r"Card (\w+)", mark, 1).group(1) == b"detected"
