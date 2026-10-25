import argparse
import signal

from .workflow import claim, smoke


def main():
    parser = argparse.ArgumentParser(description="Claim an Attractap reader and run a hardware smoke check")
    parser.add_argument("--config", required=True, help="Labgrid environment YAML")
    parser.add_argument("--place", required=True, help="Existing labgrid place")
    parser.add_argument("--role", default="main")
    parser.add_argument("--image", required=True, help="ESP-IDF merged binary, flashed at 0x0")
    parser.add_argument("--output", default="lab-artifacts")
    parser.add_argument("--log-seconds", type=float, default=15.0)
    parser.add_argument("--max-log-bytes", type=int, default=1_048_576)
    parser.add_argument("--expect", help="Required literal marker in collected UART log")
    args = parser.parse_args()

    # GitHub Actions cancellation sends SIGTERM; unwind the claim context just
    # as Ctrl-C does. SIGKILL/power loss still require operator recovery.
    def terminate(signum, frame):
        raise SystemExit(128 + signum)

    previous = signal.signal(signal.SIGTERM, terminate)
    try:
        with claim(args.config, args.place, args.role) as target:
            smoke(target, args.image, args.output, log_seconds=args.log_seconds,
                  max_log_bytes=args.max_log_bytes, expect=args.expect)
    finally:
        signal.signal(signal.SIGTERM, previous)
