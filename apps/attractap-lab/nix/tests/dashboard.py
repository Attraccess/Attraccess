"""Exercise the packaged dashboard through nginx against the VM's coordinator."""

import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time

import httpx
from websockets.sync.client import connect


BASE = "http://127.0.0.1:8081"
PASSWORD_FILE = Path("/var/lib/attractap-lab-dashboard/initial-admin-password")
RECOVERY_USER = {
    "username": "dashboard-recovery-test",
    "password": "vm-only-recovery-password",
}


def cli(*arguments, user="dashboard-external-test", check=True):
    return subprocess.run(
        ["labgrid-client", "-p", "lock", *arguments],
        env={**os.environ, "LG_USERNAME": user},
        capture_output=True,
        text=True,
        check=check,
        timeout=15,
    )


def expect(response, status):
    assert response.status_code == status, (response.status_code, response.text)
    return response


def wait_for_holder(client, expected):
    # The gRPC subscription updates the dashboard cache asynchronously.
    for _ in range(100):
        holder = expect(client.get("/api/places/lock"), 200).json()["acquired"]
        if holder == expected:
            return
        time.sleep(0.1)
    raise AssertionError(f"Coordinator holder did not converge to {expected!r}: {holder!r}")


def check_health(client):
    assert expect(client.get("/api/health"), 200).json()["coordinator_connected"]
    assert "reader-a" in {
        place["name"] for place in expect(client.get("/api/places"), 200).json()
    }


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "full"
    with httpx.Client(base_url=BASE, timeout=15) as client:
        check_health(client)
        assert PASSWORD_FILE.stat().st_mode & 0o777 == 0o600
        password = PASSWORD_FILE.read_text().strip()
        assert len(password) >= 32

        if mode == "full":
            page = expect(client.get("/"), 200)
            assert '<div id="root"></div>' in page.text
            asset = re.search(r'<script[^>]+src="([^"]+)"', page.text)
            assert asset is not None
            javascript = expect(client.get(asset.group(1)), 200)
            assert "javascript" in javascript.headers["content-type"]
            expect(client.post("/api/places/lock/acquire"), 401)
            expect(
                client.post(
                    "/api/auth/login", json={"username": "analog", "password": "analog"}
                ),
                401,
            )

        login = expect(
            client.post(
                "/api/auth/login", json={"username": "admin", "password": password}
            ),
            200,
        )
        assert login.json() == {"username": "admin", "role": "admin"}
        assert "httponly" in login.headers["set-cookie"].lower()

        if mode == "health":
            print("Dashboard reconnected after coordinator restart; administrator persisted")
            return
        if mode == "claim":
            expect(client.post("/api/places/lock/acquire"), 200)
            assert expect(client.get("/api/places/lock"), 200).json()["acquired_username"] == "admin"
            print("Administrator's dashboard claim left held across coordinator stop/start")
            return
        if mode == "recovered":
            # The coordinator releases claims on restart, while the dashboard's
            # SQLite database persists. A different user must not be blocked by
            # the previous administrator's stale acquisition record.
            wait_for_holder(client, None)
            login = expect(client.post("/api/auth/login", json=RECOVERY_USER), 200)
            assert login.json() == {"username": RECOVERY_USER["username"], "role": "user"}
            expect(client.post("/api/places/lock/acquire"), 200)
            place = expect(client.get("/api/places/lock"), 200).json()
            assert place["acquired"] and place["acquired_username"] == RECOVERY_USER["username"]
            assert cli("acquire", check=False).returncode != 0
            expect(client.post("/api/places/lock/release"), 200)
            wait_for_holder(client, None)
            print("Persisted second dashboard user acquired and released the administrator's former claim")
            return
        assert mode == "full", mode
        expect(client.post("/api/users", json={**RECOVERY_USER, "role": "user"}), 201)

        # This connection must traverse nginx's real WebSocket upgrade path.
        with connect("ws://127.0.0.1:8081/api/ws", open_timeout=10) as websocket:
            snapshot = json.loads(websocket.recv(timeout=10))
            assert snapshot["type"] == "initial_state"
            assert "reader-a" in {place["name"] for place in snapshot["data"]["places"]}

        expect(client.post("/api/places/lock/acquire"), 200)
        place = expect(client.get("/api/places/lock"), 200).json()
        assert place["acquired"] and place["acquired_username"] == "admin"
        assert cli("acquire", check=False).returncode != 0
        expect(client.post("/api/places/lock/release"), 200)
        wait_for_holder(client, None)

        cli("acquire")
        try:
            # Native claims have no dashboard ownership record. Neither the
            # ordinary path nor an administrator override may release them.
            external_holder = f"{socket.gethostname()}/dashboard-external-test"
            wait_for_holder(client, external_holder)
            expect(client.post("/api/places/lock/release"), 403)
            expect(client.post("/api/places/lock/release", params={"force": "true"}), 409)
            expect(client.delete("/api/places/lock"), 409)
            assert expect(client.get("/api/places/lock"), 200).json()["acquired"] == external_holder
            assert cli("acquire", user="dashboard-competing-test", check=False).returncode != 0
        finally:
            cli("release")
        wait_for_holder(client, None)

        # A native operator can kick a dashboard claim while the API stays up.
        # Its stale SQLite ownership must not block a different dashboard user.
        expect(client.post("/api/places/lock/acquire"), 200)
        cli("release", "--kick")
        wait_for_holder(client, None)
        expect(client.post("/api/auth/login", json=RECOVERY_USER), 200)
        expect(client.post("/api/places/lock/acquire"), 200)
        assert expect(client.get("/api/places/lock"), 200).json()["acquired_username"] == RECOVERY_USER["username"]
        expect(client.post("/api/places/lock/release"), 200)
        wait_for_holder(client, None)
        print("Dashboard SPA, HTTP/WebSocket proxy, authentication, native claim safety and kick recovery passed")


if __name__ == "__main__":
    main()
