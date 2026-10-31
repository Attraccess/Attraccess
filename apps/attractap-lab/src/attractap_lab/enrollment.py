"""Approve a reader's pairing code through the Attraccess API (ATT-1165, ATT-1168).

A freshly erased reader (every lab session starts from one) pairs only after a
user with ``resources.update`` approved the rotating code it shows. It logs
``Enrollment: code=K7P-3XQ`` on the UART; this module resolves that code to the
pending request and approves it as a new reader. The caller supplies the API URL
and a bearer token it obtained itself, e.g. from the API the run started.
Importing this module needs no labgrid.
"""

import json
import re
import urllib.request

ENROLLMENT_CODE = re.compile(rb"Enrollment: code=([2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3})")


def latest_code(data):
    """Return the newest ``XXX-XXX`` code in UART output (bytes), or ``None``."""
    codes = ENROLLMENT_CODE.findall(data)
    return codes[-1].decode() if codes else None


def _post(url, token, path, body, timeout):
    request = urllib.request.Request(
        f"{url.rstrip('/')}/api/attractap/pairings{path}",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def approve(url, token, code, *, name=None, mode="new", target_reader_id=None, timeout=30):
    """Resolve ``code`` and approve it (by default as a new reader); return the pairing.

    ``mode="takeover"`` with ``target_reader_id`` gives a reader that lost its pairing
    (revoked, reset) back its existing record.

    Raises ``urllib.error.HTTPError`` for refusals (404: unknown or rotated code,
    409: two readers show the same code, 403: missing permission, 429: too many
    wrong codes).
    """
    pairing = _post(url, token, "/resolve", {"code": code}, timeout)
    body = {"code": code, "mode": mode}
    if target_reader_id is not None:
        body["targetReaderId"] = target_reader_id
    if name:
        body["name"] = name
    return _post(url, token, f"/{pairing['id']}/approve", body, timeout)
