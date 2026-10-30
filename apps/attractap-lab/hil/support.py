"""Reader console capture and a minimal Attraccess API client for lab tests."""

import json
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.request
import uuid

from pexpect import TIMEOUT


class ReaderConsole:
    """Background capture of the reader's UART with marker waits and commands.

    Uses the driver's unwrapped ``_read``/``_write``: labgrid tracks steps
    (``read``, ``write``, file transfers) on one global stack, so a step in
    this thread that overlaps one in the test thread breaks both.
    """

    def __init__(self, driver, log_path):
        self.driver = driver
        self.data = b""
        self.lock = threading.Lock()
        self.log = log_path.open("ab")
        self.thread = None
        self.running = False

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)

    def _run(self):
        while self.running:
            try:
                chunk = self.driver._read(timeout=0.2, max_size=4096)
            except TIMEOUT:
                continue
            except Exception:  # The console reconnects after a reader reset.
                time.sleep(0.2)
                continue
            self.log.write(chunk)
            self.log.flush()
            with self.lock:
                self.data += chunk

    def mark(self):
        with self.lock:
            return len(self.data)

    def since(self, mark):
        with self.lock:
            return self.data[mark:].decode(errors="replace")

    def expect(self, pattern, since, timeout):
        """Wait for a regex in the log after position ``since``."""
        regex = re.compile(pattern.encode())
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self.lock:
                match = regex.search(self.data, since)
            if match:
                return match
            time.sleep(0.1)
        raise AssertionError(f"reader log did not show /{pattern}/ within {timeout}s")

    def stream(self):
        return ConsoleStream(self)

    def command(self, topic, payload, attempts=3, timeout=5):
        """Send a serial CMND and return the RESP payload text.

        Stray input on the port can precede a command; the leading newline
        ends it, and a command without reply is resent.
        """
        line = f"\nCMND {topic} {json.dumps(payload, separators=(',', ':'))}\n".encode()
        for attempt in range(attempts):
            mark = self.mark()
            self.driver._write(line)
            try:
                return self.expect(rf"RESP {re.escape(topic)} ([^\r\n]*)", mark, timeout).group(1).decode()
            except AssertionError:
                if attempt == attempts - 1:
                    raise


class ConsoleStream:
    """New output of a ReaderConsole as a read/write console for ReaderTestHooks.

    The console's capture thread owns the serial port; this reads its buffer
    from the moment the stream was opened.
    """

    def __init__(self, console):
        self.console = console
        self.cursor = console.mark()

    def write(self, data):
        self.console.driver._write(data)

    def read(self, timeout=0.25, max_size=65536):
        deadline = time.monotonic() + timeout
        while True:
            with self.console.lock:
                chunk = self.console.data[self.cursor:self.cursor + max_size]
            if chunk:
                self.cursor += len(chunk)
                return chunk
            if time.monotonic() >= deadline:
                raise TIMEOUT("no reader output")
            time.sleep(0.02)


class Api:
    """The few Attraccess REST calls the lab tests need, plus dev-DB user setup."""

    def __init__(self, base_url, database):
        self.base = base_url.rstrip("/") + "/api"
        self.database = database

    def call(self, method, path, body=None, token=None, form=None, timeout=40):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        data = None
        if form is not None:
            boundary = uuid.uuid4().hex
            parts = "".join(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n"
                            for key, value in form.items())
            data = (parts + f"--{boundary}--\r\n").encode()
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                text = response.read().decode()
                return response.status, json.loads(text) if text else None
        except urllib.error.HTTPError as error:
            text = error.read().decode()
            try:
                return error.code, json.loads(text)
            except ValueError:
                return error.code, text

    def login(self, username, password="password"):
        status, body = self.call("POST", "/auth/session/local",
                                 {"username": username, "password": password, "tokenLocation": "body"})
        assert status in (200, 201), body
        return body["authToken"]

    def create_user(self, username):
        """Create a verified user without roles, sharing the admin's password.

        The run uses a throwaway database, so writing it directly avoids the
        e-mail verification round trip.
        """
        with sqlite3.connect(self.database) as db:
            row = db.execute("SELECT id FROM user WHERE username = ?", (username,)).fetchone()
            if row:
                return row[0]
            cursor = db.execute("INSERT INTO user (username, email, isEmailVerified) VALUES (?, ?, 1)",
                                (username, f"{username}@lab.test"))
            db.execute("INSERT INTO authentication_detail (userId, type, password) "
                       "SELECT ?, 'local_password', password FROM authentication_detail "
                       "WHERE userId = (SELECT id FROM user WHERE username = 'admin')", (cursor.lastrowid,))
            return cursor.lastrowid
