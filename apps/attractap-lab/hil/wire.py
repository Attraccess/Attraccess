"""Plaintext view of the reader <-> API conversation, from the lab API's wiretap preload.

The reader's websocket carries TLS 1.3, so nothing outside the API process can read it.
``real-cards/wiretap.cjs`` is preloaded into the lab API (``node -r``) and records every framed
application message as a JSON line. Tests that need the plaintext (card session ids, the
personalised resource list, APDUs) use ``Wire``; without ``WIRETAP_FILE`` they skip.
"""

import json
import os
import time
from pathlib import Path


class Wire:
    def __init__(self, path):
        self.path = Path(path)

    def lines(self):
        if not self.path.exists():
            return []
        out = []
        for raw in self.path.read_text(errors="replace").splitlines():
            try:
                out.append(json.loads(raw))
            except ValueError:
                pass  # a line the API was still writing
        return out

    def mark(self):
        return len(self.lines())

    def since(self, mark):
        return self.lines()[mark:]

    def messages(self, mark, type=None, direction=None):
        return [m for m in self.since(mark)
                if "type" in m and (type is None or m["type"] == type) and (direction is None or m["dir"] == direction)]

    def wait_for(self, mark, type, direction=None, timeout=15, where=lambda m: True):
        deadline = time.monotonic() + timeout
        while True:
            for message in self.messages(mark, type, direction):
                if where(message):
                    return message
            if time.monotonic() > deadline:
                raise AssertionError(f"no {direction or ''} {type} on the wire within {timeout}s")
            time.sleep(0.25)

    def exchanges(self, mark=0):
        """Number of CARD_APDU the server sent after ``mark`` (one per card exchange)."""
        return len(self.messages(mark, "CARD_APDU", "s2r"))


def from_env():
    path = os.environ.get("WIRETAP_FILE")
    return Wire(path) if path else None
