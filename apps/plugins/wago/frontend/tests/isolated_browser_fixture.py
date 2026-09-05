"""No server: every browser request is fulfilled from this build or memory."""

import mimetypes
from urllib.parse import urlparse

from browser_fixture import ARTIFACTS, NOW, WagoFixture

ORIGIN = "https://wago-fixture.invalid"


class IsolatedWagoFixture(WagoFixture):
    def __init__(self):
        super().__init__({key: {"url": ORIGIN} for key in ("api", "frontend", "preview")})
        self.network = []
        self.diagnostics_unavailable = False

    def route(self, route):
        request = route.request
        url = urlparse(request.url)
        entry = {"method": request.method, "url": request.url, "action": "blocked"}
        self.network.append(entry)
        if f"{url.scheme}://{url.netloc}" == ORIGIN:
            if url.path.startswith("/api/wago/"):
                entry["action"] = "fixture"
                if request.method == "GET" and url.path == "/api/wago/controllers/91058/diagnostics":
                    self.calls.append({"method": "GET", "path": url.path, "body": None})
                    if self.diagnostics_unavailable:
                        route.fulfill(status=503, json={"message": "Fixture polling failure"})
                    else:
                        route.fulfill(json={
                            "controllerId": 91058, "name": "QA diagnostics fixture", "generatedAt": NOW,
                            "connectivity": "online", "heartbeatAt": NOW, "heartbeatFreshness": "fresh",
                            "runtimeVersion": "fixture", "protocolVersion": "1", "capabilities": [],
                            "incompatible": False, "sequenceGaps": None, "activeStream": None,
                            "trackingExhausted": False, "stateConnected": True, "stateHardwareAvailable": None,
                            "stateSourceAt": None, "sequenceExplanation": "Fixture only",
                            "configuration": {
                                "draftUpdatedAt": None, "draftChanged": False, "validationErrorCount": 0,
                                "validationCodes": [], "validationErrors": [], "rejectionErrors": [],
                                "publishedRevision": None, "publishedState": None, "appliedRevision": None,
                                "reportedRevision": None, "revisionMismatch": False, "rejected": False,
                            },
                            "hardwareReadiness": "unknown",
                            "hardwareReadinessReason": "Fixture responses do not prove physical I/O readiness.",
                            "channels": [], "faults": [], "references": [], "referencesTruncated": False,
                            "events": [], "limitations": ["Synthetic diagnostics; no controller connected."],
                        })
                    return
                super().route(route)
                return
            base = (ARTIFACTS / "harness").resolve()
            asset = (base / ("index.html" if url.path == "/" else url.path.lstrip("/"))).resolve()
            if request.method == "GET" and asset.is_relative_to(base) and asset.is_file():
                entry["action"] = "local-asset"
                route.fulfill(path=str(asset), content_type=mimetypes.guess_type(asset)[0] or "application/octet-stream")
                return
        self.unexpected.append(f"{request.method} {request.url}")
        route.abort()

    def websocket(self, socket):
        self.unexpected.append(f"WebSocket {socket.url}")
        socket.close()
