"""Reader test hooks: screenshot decoding, widget matching and serial exchange."""

import base64
import json
import struct
import zlib

import pytest
from pexpect import TIMEOUT

from attractap_lab import reader_screen
from attractap_lab.reader_screen import ReaderCommandError, ReaderTestHooks, ScreenshotError

RED, WHITE, BLACK = 0xF800, 0xFFFF, 0x0000


def rle(pixels):
    """Reference encoder matching the firmware's FrameEncoding::encodeRle565."""
    out, i = bytearray(), 0
    while i < len(pixels):
        run = 1
        while i + run < len(pixels) and run < 129 and pixels[i + run] == pixels[i]:
            run += 1
        if run >= 2:
            out += bytes([126 + run]) + struct.pack("<H", pixels[i])
            i += run
            continue
        start = i
        while i < len(pixels) and i - start < 128:
            if i > start and i + 1 < len(pixels) and pixels[i + 1] == pixels[i]:
                break
            i += 1
        out += bytes([i - start - 1]) + b"".join(struct.pack("<H", p) for p in pixels[start:i])
    return bytes(out)


def test_decode_rle565_expands_runs_and_literals():
    # Byte layout produced by the firmware (see tests/test-hooks/logic_test.cpp).
    assert reader_screen.decode_rle565(bytes([129, 0x00, 0xF8]), 3) == bytes((255, 0, 0)) * 3
    assert reader_screen.decode_rle565(bytes([1, 0xFF, 0xFF, 0, 0]), 2) == bytes((255,) * 3 + (0,) * 3)
    pixels = [RED] * 300 + [WHITE, BLACK, WHITE] + [BLACK, BLACK]
    rgb = reader_screen.decode_rle565(rle(pixels), len(pixels))
    assert rgb[:3] == b"\xff\x00\x00" and rgb[300 * 3:301 * 3] == b"\xff\xff\xff" and rgb[-3:] == b"\x00\x00\x00"
    with pytest.raises(ScreenshotError):
        reader_screen.decode_rle565(rle(pixels), len(pixels) + 1)
    with pytest.raises(ScreenshotError):
        reader_screen.decode_rle565(bytes([5, 0, 0]), 6)


def test_rgb565_channels_expand_to_full_range():
    assert reader_screen.decode_rle565(bytes([0, 0x1F, 0x00]), 1) == bytes((0, 0, 255))
    assert reader_screen.decode_rle565(bytes([0, 0xE0, 0x07]), 1) == bytes((0, 255, 0))


def screenshot_lines(pixels, width, height, chunk=6):
    data = rle(pixels)
    chunks = [data[i:i + chunk] for i in range(0, len(data), chunk)]
    crc = zlib.crc32(data)
    header = {"width": width, "height": height, "format": "rgb565-rle", "size": len(data),
              "crc32": crc, "chunks": len(chunks)}
    lines = [f"RESP ui.screenshot.get {json.dumps(header)}"]
    lines += [f'RESP ui.screenshot.data {{"seq":{i},"data":"{base64.b64encode(c).decode()}"}}'
              for i, c in enumerate(chunks)]
    lines.append(f'RESP ui.screenshot.end {{"chunks":{len(chunks)},"crc32":{crc}}}')
    return lines


def parsed(lines):
    replies = [json.loads(line.split(" ", 2)[2]) for line in lines]
    return replies[0], replies[1:-1], replies[-1]


def test_assemble_screenshot_checks_order_and_crc():
    pixels = [RED, RED, WHITE, BLACK] * 4
    shot = reader_screen.assemble_screenshot(*parsed(screenshot_lines(pixels, 4, 4)))
    assert (shot.width, shot.height) == (4, 4)
    assert shot.pixel(0, 0) == (255, 0, 0) and shot.pixel(2, 0) == (255, 255, 255) and shot.pixel(3, 3) == (0, 0, 0)
    header, chunks, end = parsed(screenshot_lines(pixels, 4, 4))
    with pytest.raises(ScreenshotError):
        reader_screen.assemble_screenshot(header, chunks[:-1], end)
    with pytest.raises(ScreenshotError):
        reader_screen.assemble_screenshot(header, list(reversed(chunks)), end)
    chunks[0] = {"seq": 0, "data": base64.b64encode(b"\x81\x00\x00").decode()}
    with pytest.raises(ScreenshotError):
        reader_screen.assemble_screenshot(header, chunks, end)


def test_png_is_valid():
    png = reader_screen.encode_png(2, 1, bytes((255, 0, 0, 0, 0, 255)))
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    length, kind = struct.unpack(">I4s", png[8:16])
    assert kind == b"IHDR" and struct.unpack(">II", png[16:24]) == (2, 1)
    idat = png.index(b"IDAT")
    size = struct.unpack(">I", png[idat - 4:idat])[0]
    assert zlib.decompress(png[idat + 4:idat + 4 + size]) == b"\x00\xff\x00\x00\x00\x00\xff"


WIDGETS = {"screen": "ResourceList", "width": 480, "height": 480, "widgets": [
    {"type": "lv_button", "text": "OK", "texts": ["OK"], "cx": 240, "cy": 240, "hittable": True},
    {"type": "lv_button", "text": "Lathe Available", "texts": ["Lathe", "Available"], "cx": 10, "cy": 20,
     "hittable": True},
    {"type": "lv_button", "text": "Lathe 2", "texts": ["Lathe 2"], "cx": 10, "cy": 90, "hittable": False},
]}


def test_matching_follows_the_firmware_rules():
    assert [w["cy"] for w in reader_screen.find(WIDGETS, "Lathe")] == [20]
    assert [w["cy"] for w in reader_screen.find(WIDGETS, " Lathe\n Available ")] == [20]
    assert [w["cy"] for w in reader_screen.find(WIDGETS, "athe", "contains")] == [20]
    assert reader_screen.find(WIDGETS, "Lathe 2") == []  # covered
    assert reader_screen.find(WIDGETS, "") == []
    with pytest.raises(ValueError):
        reader_screen.find(WIDGETS, "OK", "regex")


class FakeConsole:
    """Answers commands like the reader, with log noise and stray replies."""

    def __init__(self, replies):
        self.replies = replies
        self.written = []
        self.pending = b""

    def write(self, data):
        self.written.append(data)
        line = data.strip().decode()
        topic, payload = line.split(" ", 2)[1:]
        answer = self.replies[topic]
        lines = answer(json.loads(payload)) if callable(answer) else answer
        self.pending += b"".join(f"{line}\r\n".encode() for line in lines)

    def read(self, timeout=0.0, max_size=None):
        if not self.pending:
            raise TIMEOUT("idle")
        data, self.pending = self.pending[:7], self.pending[7:]  # split lines across reads
        return data


def test_command_adds_pin_and_keeps_log_lines():
    console = FakeConsole({"ui.widgets.get": [
        "[Display] INFO: Transitioning to screen: ResourceList",
        "RESP network.status.get {}",
        f"RESP ui.widgets.get {json.dumps(WIDGETS)}",
    ]})
    hooks = ReaderTestHooks(console, "4711", timeout=0.5)
    assert hooks.screen() == "ResourceList"
    assert console.written[0].startswith(b"\nCMND ui.widgets.get ") and console.written[0].endswith(b"\n")
    assert json.loads(console.written[0].split(b" ", 2)[2]) == {"authCode": "4711"}
    assert hooks.wait_for_log(r"Transitioning to screen: (\w+)", timeout=0) == (
        "[Display] INFO: Transitioning to screen: ResourceList")


def test_errors_and_retries():
    console = FakeConsole({"ui.touch.tap": ['RESP ui.touch.tap {"error":"TOUCH_BUSY"}'], "ui.touch.release": []})
    hooks = ReaderTestHooks(console, "4711", timeout=0.2, retries=2)
    with pytest.raises(ReaderCommandError) as error:
        hooks.tap(1, 2)
    assert error.value.code == "TOUCH_BUSY"
    with pytest.raises(TimeoutError):
        hooks.release()
    assert len(console.written) == 3
    with pytest.raises(ValueError):
        hooks.tap_text("x" * 300)


def test_tap_text_sends_only_given_options():
    sent = []

    def tapped(payload):
        sent.append(payload)
        return [f'RESP ui.widgets.tap {{"success":true,"widget":{json.dumps(WIDGETS["widgets"][1])}}}']

    hooks = ReaderTestHooks(FakeConsole({"ui.widgets.tap": tapped}), "4711", timeout=0.5)
    assert hooks.tap_text("Lathe")["cy"] == 20
    hooks.tap_text("athe", "contains", 1, hold_ms=500)
    assert sent == [{"text": "Lathe", "authCode": "4711"},
                    {"text": "athe", "match": "contains", "index": 1, "holdMs": 500, "authCode": "4711"}]


def test_auth_commands_skip_the_pin():
    console = FakeConsole({"auth.status.get": ['RESP auth.status.get {"pinIsSet":false}'],
                           "auth.code.set": ['RESP auth.code.set {"success":true,"pinIsSet":true}']})
    ReaderTestHooks(console, "4711", timeout=0.5).ensure_auth_code()
    assert [json.loads(line.split(b" ", 2)[2]) for line in console.written] == [{}, {"newCode": "4711"}]


def test_screenshot_retries_a_corrupt_stream():
    pixels = [WHITE] * 8 + [RED] * 8
    good = screenshot_lines(pixels, 4, 4)
    corrupt = [line for line in good if '"seq":1,' not in line]
    streams = iter([["[Main] noise"] + corrupt, good])
    hooks = ReaderTestHooks(FakeConsole({"ui.screenshot.get": lambda payload: next(streams)}), "4711",
                            timeout=0.5)
    shot = hooks.screenshot(timeout=0.5)
    assert shot.pixel(0, 0) == (255, 255, 255) and shot.pixel(3, 3) == (255, 0, 0)
    error = ReaderTestHooks(FakeConsole({"ui.screenshot.get": ['RESP ui.screenshot.get {"error":"OUT_OF_MEMORY"}']}),
                            "4711", timeout=0.5)
    with pytest.raises(ReaderCommandError):
        error.screenshot(timeout=0.5)
