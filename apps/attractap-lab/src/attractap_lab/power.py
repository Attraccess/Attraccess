"""Switch a held reader on or off.

The place's `power` tag selects how: `button` has its NFC emulator press the
power button of a reader like the Touch V1 (ReaderPowerDriver), `switch` has
the lab host switch the USB power switch in the cable of a reader like the
Touch V2 (SwitchPowerDriver). Run it inside a labgrid session, or while holding
the place: a released reader belongs to the janitor, which powers it on to
park it.
"""

import argparse
import json
import os
from pathlib import Path
import sys
import tempfile

from .workflow import attached, reader_power

# reader_power() binds the drivers from the place's resources, so no
# particular environment is needed.
ENVIRONMENT = {
    "imports": ["attractap_lab.drivers"],
    "targets": {"main": {"resources": {"RemotePlace": {"name": "set-from-place"}}}},
}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", choices=["on", "off", "cycle", "get"])
    parser.add_argument("--place", default=os.environ.get("LG_PLACE"), help="Held place (or LG_PLACE)")
    parser.add_argument("--config", help="Labgrid environment YAML to take power driver settings from")
    parser.add_argument("--delay", type=float, help="Seconds off for cycle (default 2 for a button, 10 for a switch)")
    args = parser.parse_args(argv)
    if not args.place:
        parser.error("provide --place or run inside a labgrid session")

    with tempfile.TemporaryDirectory(prefix="attractap-lab-power-") as directory:
        config = args.config
        if config is None:
            config = Path(directory) / "env.yaml"
            # JSON is valid YAML.
            config.write_text(json.dumps(ENVIRONMENT))
        try:
            with attached(config, args.place) as target:
                power = reader_power(target)
                if power is None:
                    raise SystemExit(f"{args.place}: no switchable reader power (tagged power=always-on, "
                                     "or untagged without an NFC emulator)")
                if args.delay is not None:
                    power.delay = args.delay
                if args.action != "get":
                    target.activate(power)
                    getattr(power, args.action)()
                print(f"{args.place}: reader is {'on' if power.get() else 'off'}")
        # Not holding the place, emulator and switch errors (NfcEmulatorError,
        # RuntimeError), timeouts and an unknown power tag.
        except (RuntimeError, TimeoutError, ValueError) as error:
            raise SystemExit(f"{args.place}: {error}") from None
    return 0


if __name__ == "__main__":
    sys.exit(main())
