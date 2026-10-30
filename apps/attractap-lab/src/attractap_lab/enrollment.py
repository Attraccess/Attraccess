"""Approve a new reader's enrollment code through the Attraccess API (ATT-1168).

A freshly erased reader (every lab session starts from one) does not register
itself: it logs ``Enrollment: code=K7P-3XQ`` on the UART and waits until a user
with ``resources.update`` approves that code. Importing this module needs no labgrid.
"""

import json
import re
import urllib.error
import urllib.request

ENROLLMENT_CODE = re.compile(rb"Enrollment: code=([2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3})")
# Each call rescans only the output added since the last one, plus enough of the previous
# output to catch a code line that was split across two chunks.
_OVERLAP = 64


def approve(url, token, code, *, name=None, timeout=30):
    """POST the code to ``/api/device-enrollment/approve`` and return the new device.

    Raises ``urllib.error.HTTPError`` for refusals (404: unknown or rotated code, 403: missing
    permission, 429: too many wrong codes).
    """
    body = {"code": code}
    if name:
        body["name"] = name
    request = urllib.request.Request(
        f"{url.rstrip('/')}/api/device-enrollment/approve",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def approver(url, token, *, name=None, on_approved=None):
    """Return a UART-output callback that approves every new code it sees.

    Use it as ``until`` while recording: it never stops the recording itself. A code that
    rotated away before the request arrived is skipped; the next rotation logs a new one.
    """
    tried = set()
    scanned = 0

    def check(data):
        nonlocal scanned
        if len(data) < scanned:  # a new recording started over
            scanned = 0
        start = max(0, scanned - _OVERLAP)
        scanned = len(data)
        for match in ENROLLMENT_CODE.finditer(data, start):
            code = match.group(1).decode()
            if code in tried:
                continue
            tried.add(code)
            try:
                device = approve(url, token, code, name=name)
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    continue
                raise
            if on_approved:
                on_approved(device)
        return False

    return check
