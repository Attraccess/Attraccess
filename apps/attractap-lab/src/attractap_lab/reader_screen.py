"""Drive and capture a reader's touchscreen over its serial console.

Needs reader firmware built with ``-DATTRACTAP_TEST_HOOKS=ON`` (see
apps/attractap/firmware/README.md, "Test hooks"). The pure functions decode
screenshots and match widgets; ``ReaderTestHooks`` sends the commands through
an active labgrid ``SerialDriver`` (anything with ``read``/``write``)::

    hooks = ReaderTestHooks(target.get_driver("SerialDriver"), "4711")
    hooks.ensure_auth_code()
    hooks.tap_text("Start", timeout=10)
    hooks.screenshot().save("screen.png")
"""

from collections import deque
from dataclasses import dataclass
import base64
import json
import re
import struct
import time
import zlib

from pexpect import TIMEOUT

# The reader drops longer serial input lines.
MAX_LINE = 255


class ReaderCommandError(RuntimeError):
    """The reader answered with ``{"error": code}``."""

    def __init__(self, topic, code):
        super().__init__(f"{topic}: {code}")
        self.topic = topic
        self.code = code


class ScreenshotError(RuntimeError):
    """A screenshot stream was incomplete or corrupt."""


def _rgb888(pixel):
    r, g, b = pixel >> 11, (pixel >> 5) & 0x3F, pixel & 0x1F
    return bytes(((r * 255 + 15) // 31, (g * 255 + 31) // 63, (b * 255 + 15) // 31))


def decode_rle565(data, pixel_count):
    """Decode the firmware's RLE565 stream into RGB888 bytes (3 per pixel).

    Packets start with a control byte c: c < 128 is followed by c + 1 literal
    little-endian RGB565 pixels, c >= 128 by one pixel repeated c - 126 times.
    """
    out = bytearray()
    cache = {}
    i, size = 0, len(data)
    while i < size:
        control = data[i]
        i += 1
        if control < 128:
            end = i + 2 * (control + 1)
            if end > size:
                raise ScreenshotError("RLE565 literal packet runs past the end")
            for (pixel,) in struct.iter_unpack("<H", data[i:end]):
                out += cache.get(pixel) or cache.setdefault(pixel, _rgb888(pixel))
            i = end
        else:
            if i + 2 > size:
                raise ScreenshotError("RLE565 run packet runs past the end")
            pixel = data[i] | (data[i + 1] << 8)
            i += 2
            out += (cache.get(pixel) or cache.setdefault(pixel, _rgb888(pixel))) * (control - 126)
    if len(out) != pixel_count * 3:
        raise ScreenshotError(f"RLE565 stream holds {len(out) // 3} pixels, expected {pixel_count}")
    return bytes(out)


def encode_png(width, height, rgb):
    """Return an 8-bit RGB PNG for ``rgb`` (row-major, 3 bytes per pixel)."""
    stride = width * 3
    raw = b"".join(b"\x00" + rgb[y * stride:(y + 1) * stride] for y in range(height))

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")


@dataclass(frozen=True)
class Screenshot:
    width: int
    height: int
    rgb: bytes

    def pixel(self, x, y):
        offset = (y * self.width + x) * 3
        return tuple(self.rgb[offset:offset + 3])

    def png(self):
        return encode_png(self.width, self.height, self.rgb)

    def save(self, path):
        with open(path, "wb") as output:
            output.write(self.png())


def assemble_screenshot(header, chunks, end):
    """Check and decode one ``ui.screenshot.get`` stream.

    ``header`` and ``end`` are the parsed header and end replies, ``chunks``
    the parsed ``ui.screenshot.data`` replies in arrival order.
    """
    if header.get("format") != "rgb565-rle":
        raise ScreenshotError(f"Unknown screenshot format {header.get('format')!r}")
    count = header["chunks"]
    if end.get("chunks") != count or end.get("crc32") != header["crc32"]:
        raise ScreenshotError("Screenshot end line does not match its header")
    if [chunk.get("seq") for chunk in chunks] != list(range(count)):
        raise ScreenshotError(f"Screenshot chunks missing or out of order ({len(chunks)} of {count})")
    try:
        data = b"".join(base64.b64decode(chunk["data"], validate=True) for chunk in chunks)
    except ValueError as error:
        raise ScreenshotError(f"Corrupt screenshot chunk: {error}") from None
    if len(data) != header["size"] or zlib.crc32(data) != header["crc32"]:
        raise ScreenshotError("Screenshot size or CRC-32 mismatch")
    width, height = header["width"], header["height"]
    return Screenshot(width, height, decode_rle565(data, width * height))


def normalize(text):
    """Collapse whitespace like the firmware does for widget texts."""
    return " ".join(str(text).split())


def matches(widget, text, match="exact"):
    """Firmware's ui.widgets.tap rule: ``exact`` equals one label text or the
    joined text, ``contains`` finds the text inside the joined text."""
    wanted = normalize(text)
    if not wanted:
        return False
    if match == "contains":
        return wanted in widget["text"]
    if match != "exact":
        raise ValueError("match must be 'exact' or 'contains'")
    return wanted == widget["text"] or wanted in widget["texts"]


def find(listing, text, match="exact"):
    """Hittable widgets of a ``ui.widgets.get`` reply matching ``text``, front to back."""
    return [widget for widget in listing["widgets"] if widget["hittable"] and matches(widget, text, match)]


def command_line(topic, payload):
    line = f"CMND {topic} {json.dumps(payload, separators=(',', ':'), ensure_ascii=False)}"
    if len(line.encode()) > MAX_LINE:
        raise ValueError(f"{topic}: serial command exceeds {MAX_LINE} bytes")
    # The leading newline ends any stray partial line on the reader's input.
    return f"\n{line}\n".encode()


def parse_reply(raw, topic):
    """Return the JSON payload if ``raw`` is a ``RESP <topic>`` line, else None."""
    marker = f"RESP {topic} ".encode()
    start = raw.find(marker)
    if start < 0:
        return None
    try:
        return json.loads(raw[start + len(marker):].decode(errors="replace"))
    except ValueError:
        return None


class ReaderTestHooks:
    """Serial test hooks of a reader, over a console with ``read``/``write``.

    Every command carries the reader's serial PIN. Lines that are not replies
    are kept for ``read_log``/``wait_for_log``.
    """

    def __init__(self, console, auth_code, *, timeout=10.0, retries=3):
        self.console = console
        self.auth_code = auth_code
        self.timeout = timeout
        self.retries = retries
        self._buffer = b""
        self._log = deque(maxlen=20000)
        self._pending = deque()

    # -- transport -------------------------------------------------------

    def _lines(self, deadline):
        """Yield complete lines until ``deadline``."""
        while True:
            while b"\n" in self._buffer:
                raw, self._buffer = self._buffer.split(b"\n", 1)
                yield raw.rstrip(b"\r")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            try:
                self._buffer += self.console.read(timeout=min(0.25, remaining), max_size=65536)
            except TIMEOUT:
                pass

    def _keep(self, raw):
        if b"RESP " not in raw:
            self._log.append(raw.decode(errors="replace"))

    def _send(self, topic, payload):
        body = dict(payload or {})
        if not topic.startswith("auth."):
            body["authCode"] = self.auth_code
        self.console.write(command_line(topic, body))

    def command(self, topic, payload=None, *, timeout=None):
        """Send one command and return its reply payload.

        Raises ReaderCommandError for ``{"error": ...}`` replies. A command
        without a reply is sent again (stray bytes on the lab's serial input
        can corrupt a request line), so prefer idempotent commands when the
        reader may be busy for longer than ``timeout``.
        """
        timeout = self.timeout if timeout is None else timeout
        for _ in range(self.retries):
            self._send(topic, payload)
            for raw in self._lines(time.monotonic() + timeout):
                reply = parse_reply(raw, topic)
                if reply is None:
                    self._keep(raw)
                    continue
                if isinstance(reply, dict) and "error" in reply:
                    raise ReaderCommandError(topic, reply["error"])
                return reply
        raise TimeoutError(f"Reader did not answer {topic} after {self.retries} attempts")

    def wait_ready(self, timeout=60.0):
        """Wait until the reader answers serial commands (e.g. after flashing)."""
        deadline = time.monotonic() + timeout
        while True:
            try:
                return self.command("auth.status.get", timeout=2.0)
            except TimeoutError:
                if time.monotonic() >= deadline:
                    raise

    def ensure_auth_code(self):
        """Set the serial PIN on a reader that has none (erased lab readers)."""
        if not self.wait_ready()["pinIsSet"]:
            self.command("auth.code.set", {"newCode": self.auth_code})

    def read_log(self, seconds=0.0):
        """Return and clear the reader's log lines, reading for ``seconds`` first."""
        for raw in self._lines(time.monotonic() + seconds):
            self._keep(raw)
        lines = list(self._log)
        self._log.clear()
        return lines

    def wait_for_log(self, pattern, timeout=10.0):
        """Return the first log line matching ``pattern`` (kept or new), consuming it."""
        regex = re.compile(pattern)
        while self._log:
            line = self._log.popleft()
            if regex.search(line):
                return line
        for raw in self._lines(time.monotonic() + timeout):
            line = raw.decode(errors="replace")
            if b"RESP " not in raw and regex.search(line):
                return line
        raise TimeoutError(f"No reader log line matched {pattern!r} within {timeout}s")

    # -- screen ----------------------------------------------------------

    def widgets(self):
        """``{"screen", "width", "height", "widgets": [...]}`` of the current screen."""
        return self.command("ui.widgets.get")

    def screen(self):
        return self.widgets()["screen"]

    def find(self, text, match="exact"):
        return find(self.widgets(), text, match)

    def wait_for(self, text=None, *, screen=None, match="exact", timeout=10.0, interval=0.3):
        """Wait for a screen and/or a hittable widget; returns the widget (or listing)."""
        deadline = time.monotonic() + timeout
        while True:
            listing = self.widgets()
            if screen is None or listing["screen"] == screen:
                if text is None:
                    return listing
                found = find(listing, text, match)
                if found:
                    return found[0]
            if time.monotonic() >= deadline:
                texts = [widget["text"] for widget in listing["widgets"] if widget["text"]]
                raise TimeoutError(f"Waited {timeout}s for text={text!r} screen={screen!r}; "
                                   f"on {listing['screen']!r} with {texts}")
            time.sleep(interval)

    # -- touch -----------------------------------------------------------

    @staticmethod
    def _with(payload, **optional):
        payload.update({key: value for key, value in optional.items() if value is not None})
        return payload

    def tap(self, x, y, hold_ms=None):
        self.command("ui.touch.tap", self._with({"x": x, "y": y}, holdMs=hold_ms))

    def press(self, x, y, hold_ms=None):
        """Long press for ``hold_ms``; without it the finger stays down until release()."""
        self.command("ui.touch.press", self._with({"x": x, "y": y}, holdMs=hold_ms),
                     timeout=self.timeout + (hold_ms or 0) / 1000)

    def release(self):
        self.command("ui.touch.release")

    def swipe(self, x1, y1, x2, y2, duration_ms=None):
        self.command("ui.touch.swipe", self._with({"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                                                  durationMs=duration_ms),
                     timeout=self.timeout + (duration_ms or 0) / 1000)

    def tap_text(self, text, match="exact", index=0, *, hold_ms=None, timeout=0.0):
        """Tap the center of the index-th hittable widget showing ``text``.

        With ``timeout`` it first waits for the widget to appear. Returns the
        tapped widget.
        """
        if timeout:
            self.wait_for(text, match=match, timeout=timeout)
        payload = self._with({"text": text}, match=None if match == "exact" else match,
                             index=index or None, holdMs=hold_ms)
        return self.command("ui.widgets.tap", payload)["widget"]

    def screenshot(self, *, timeout=120.0):
        """Capture the frame on the panel; retries corrupt transfers."""
        last_error = None
        for _ in range(self.retries):
            self._send("ui.screenshot.get", None)
            header, chunks, end = None, [], None
            for raw in self._lines(time.monotonic() + timeout):
                if header is None:
                    header = parse_reply(raw, "ui.screenshot.get")
                    if header is None:
                        self._keep(raw)
                    elif "error" in header:
                        raise ReaderCommandError("ui.screenshot.get", header["error"])
                    continue
                chunk = parse_reply(raw, "ui.screenshot.data")
                if chunk is not None:
                    chunks.append(chunk)
                    continue
                end = parse_reply(raw, "ui.screenshot.end")
                if end is not None:
                    break
                self._keep(raw)
            if header is None or end is None:
                last_error = TimeoutError(f"Screenshot incomplete after {timeout}s")
                continue
            try:
                return assemble_screenshot(header, chunks, end)
            except ScreenshotError as error:
                last_error = error
        raise last_error
