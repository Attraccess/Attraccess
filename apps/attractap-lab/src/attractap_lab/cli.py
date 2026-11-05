import argparse
import os
import signal

from .workflow import claim, smoke


def main():
    parser = argparse.ArgumentParser(description="Claim an Attractap reader and run a hardware smoke check")
    parser.add_argument("--config", required=True, help="Labgrid environment YAML")
    parser.add_argument("--place", default=os.environ.get("LG_PLACE"), help="Existing labgrid place (or LG_PLACE)")
    parser.add_argument("--role", default="main")
    parser.add_argument("--image", required=True, help="ESP-IDF merged binary, flashed at 0x0")
    parser.add_argument("--output", default=os.environ.get("LG_ARTIFACTS", "lab-artifacts"))
    parser.add_argument("--log-seconds", type=float, default=15.0)
    parser.add_argument("--max-log-bytes", type=int, default=1_048_576)
    parser.add_argument("--expect", action="append", help="Required literal marker in collected UART log (repeatable)")
    parser.add_argument("--check-ui-selftest", action="store_true",
                        help="Check the UI_MEM/UI_STACK/UI_HEAP/UI_BUILD pass criteria of the UI self-test build")
    args = parser.parse_args()
    if not args.place:
        parser.error("provide --place or run inside a labgrid session")

    # GitHub Actions cancellation sends SIGTERM; unwind the claim context just
    # as Ctrl-C does. SIGKILL/power loss still require operator recovery.
    def terminate(signum, frame):
        raise SystemExit(128 + signum)

    previous = signal.signal(signal.SIGTERM, terminate)
    try:
        with claim(args.config, args.place, args.role) as target:
            smoke(target, args.image, args.output, log_seconds=args.log_seconds,
                  max_log_bytes=args.max_log_bytes, expect=args.expect,
                  check_ui_selftest=args.check_ui_selftest)
    finally:
        signal.signal(signal.SIGTERM, previous)
