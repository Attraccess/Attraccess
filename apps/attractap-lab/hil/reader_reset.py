"""Bring the run's reader and API back to idle before a test.

The session-scoped ``reader`` serves the whole run, so a test that fails half-way (an open
resource session, an armed enrollment screen, a signed-in user) used to break the tests after it.
``settle`` checks the idle state cheaply and only cleans up what it finds: it ends usage sessions
the run left open through the API, cancels armed screens, dismisses notices and signs out on the
reader, reconnects or re-approves the reader, and reboots it as the last resort.
"""

import sqlite3
import time

from attractap_lab.reader_screen import ReaderCommandError, ReaderTestHooks

# Signed out: the resource list, or the notice a reader with no linked resource shows instead (a fresh
# run until the first test links one).
IDLE_SCREENS = ("ResourceListScreen", "NoResourcesScreen")
SIGN_OUT = ("Sign out", "Abmelden")
CANCEL = ("Abbrechen", "Cancel")
# Screens waiting for a card or a supervisor; they would time out on their own, but only after minutes.
ARMED_SCREENS = ("EnrollmentScreen", "ResetScreen", "MassIntroductionScreen", "SupervisionScreen")
IDLE_TIMEOUT = 20
RECONNECT_TIMEOUT = 30
REBOOT_TIMEOUT = 120


class ReaderNotIdle(AssertionError):
    pass


def call_retrying(api, method, path, body, token, tries=5):
    """An API call that waits out ``503 The database is busy``."""
    for attempt in range(tries):
        status, answer = api.call(method, path, body, token=token)
        if status != 503 or attempt == tries - 1:
            return status, answer
        time.sleep(1)


def end_open_usages(api, admin):
    """End every usage session the run left open (the database is this run's own)."""
    with sqlite3.connect(api.database) as db:
        rows = db.execute("SELECT id, resourceId, userId FROM resource_usage WHERE endTime IS NULL").fetchall()
    actions = []
    for usage_id, resource_id, user_id in rows:
        status, body = call_retrying(api, "PUT", f"/resources/{resource_id}/usage/end", {"usageId": usage_id}, admin)
        if status != 200:
            raise ReaderNotIdle(f"could not end usage {usage_id} on resource {resource_id}: {status} {body}")
        actions.append(f"ended usage {usage_id} of user {user_id} on resource {resource_id}")
    return actions


def tap(hooks, text):
    """Tap the first of ``text`` (labels in either language) that is on screen; True if one was."""
    for label in text:
        try:
            hooks.tap_text(label)
            return True
        except ReaderCommandError as error:
            if error.code != "WIDGET_NOT_FOUND":
                raise
    return False


def ensure_connected(api, admin, reader, hooks):
    """Wait for the reader's API session; approve it again if a test left it unpaired."""
    status = hooks.command("api.status.get")["status"]
    if status == "authenticated":
        return []
    if status == "pending_approval":
        from conftest import approve_pairing  # lazy: conftest imports this module

        console = reader["console"]
        mark = console.mark()
        # The newest code in the whole log: the current one was logged before this test began.
        approve_pairing(console, api.base[: -len("/api")], admin, since=0, timeout=60,
                        mode="takeover", target_reader_id=reader["id"])
        console.expect(r"Secure session established", mark, 60)
        return ["approved the unpaired reader again"]
    first = status
    deadline = time.monotonic() + RECONNECT_TIMEOUT
    while status != "authenticated":
        if time.monotonic() > deadline:
            raise ReaderNotIdle(f"reader API status stayed {status!r}")
        time.sleep(0.5)
        status = hooks.command("api.status.get")["status"]
    return [f"waited for the reader to reconnect (was {first})"]


def leave_to_idle(hooks, timeout=IDLE_TIMEOUT):
    """Dismiss notices, cancel an armed screen and sign out until a signed-out idle screen shows."""
    actions = []
    deadline = time.monotonic() + timeout
    while True:
        listing = hooks.widgets()
        screen = listing["screen"]
        texts = {widget["text"] for widget in listing["widgets"]}
        signed_in = bool(texts & set(SIGN_OUT))
        if screen in IDLE_SCREENS and not signed_in and "OK" not in texts:
            return actions
        if time.monotonic() > deadline:
            raise ReaderNotIdle(f"reader not idle after {timeout}s: on {screen}, showing {sorted(t for t in texts if t)}")
        if "OK" in texts and tap(hooks, ("OK",)):
            note(actions, f"dismissed a notice on {screen}")
        elif screen in ARMED_SCREENS and tap(hooks, CANCEL):
            note(actions, f"cancelled {screen}")
            time.sleep(1.5)
        elif signed_in and tap(hooks, SIGN_OUT):
            note(actions, f"signed out on {screen}")
        else:
            note(actions, f"waited on {screen}")
        time.sleep(0.3)


def note(actions, action):
    if action not in actions:
        actions.append(action)


def settle(target, reader, api, admin, emulator, pin, allow_reboot=True):
    """Leave the reader idle, connected and without open sessions; return what had to be cleaned up.

    Raises ReaderNotIdle when even a reboot did not help (or ``allow_reboot`` is off).
    """
    emulator.command("remove")
    emulator.command("behavior.clear")
    actions = end_open_usages(api, admin)
    hooks = ReaderTestHooks(reader["console"].stream(), pin)
    try:
        actions += ensure_connected(api, admin, reader, hooks)
        actions += leave_to_idle(hooks)
        return actions
    except (AssertionError, TimeoutError, ReaderCommandError) as error:
        if not allow_reboot:
            raise ReaderNotIdle(f"{'; '.join(actions + [str(error)])}") from error
        actions.append(f"rebooted the reader ({error})")
    from conftest import reboot_reader  # lazy: conftest imports this module

    console = reader["console"]
    mark = console.mark()
    reboot_reader(target, reader)
    console.expect(r"Secure session established", mark, REBOOT_TIMEOUT)
    hooks = ReaderTestHooks(console.stream(), pin)
    actions += ensure_connected(api, admin, reader, hooks)
    actions += leave_to_idle(hooks, timeout=30)
    return actions
