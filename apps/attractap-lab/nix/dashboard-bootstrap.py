"""Seed upstream's first administrator before the API can create its default user."""

import asyncio
import os
from pathlib import Path
import secrets

from app.auth.store import AuthStore
from app.config import settings
from app.recorder import Recorder


async def main():
    os.umask(0o077)
    recorder = Recorder(settings.database_path)
    await recorder.start()
    try:
        store = AuthStore(settings.database_path)
        if await store.user_count() == 0:
            path = Path(settings.database_path).parent / "initial-admin-password"
            # Keep the same password if provisioning was interrupted before INSERT.
            if not path.exists():
                path.write_text(secrets.token_urlsafe(32) + "\n")
            await store.create_user(
                username="admin", password=path.read_text().strip(), role="admin"
            )
    finally:
        await recorder.stop()


asyncio.run(main())
