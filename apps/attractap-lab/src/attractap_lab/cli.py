import argparse
import os
import signal

from .enrollment import approver
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
    parser.add_argument("--expect", help="Required literal marker in collected UART log")
    parser.add_argument("--approve-url",
                        help="Attraccess URL; approves the enrollment code a freshly erased reader shows (or ATTRACCESS_URL, used only together with a token)")
    parser.add_argument("--approve-token", default=os.environ.get("ATTRACCESS_TOKEN"),
                        help="API token of a user with resources.update (or ATTRACCESS_TOKEN)")
    parser.add_argument("--approve-name", help="Name for the newly approved reader")
    args = parser.parse_args()
    if not args.place:
        parser.error("provide --place or run inside a labgrid session")
    # ATTRACCESS_URL is also the server's own setting, so it alone must not switch approval on.
    if args.approve_token and not args.approve_url:
        args.approve_url = os.environ.get("ATTRACCESS_URL")
    if bool(args.approve_url) != bool(args.approve_token):
        parser.error("provide both --approve-url and --approve-token to approve the reader")
    approve = (
        approver(args.approve_url, args.approve_token, name=args.approve_name,
                 on_approved=lambda device: print(f"Approved reader {device['id']} ({device['name']})"))
        if args.approve_url else None
    )

    # GitHub Actions cancellation sends SIGTERM; unwind the claim context just
    # as Ctrl-C does. SIGKILL/power loss still require operator recovery.
    def terminate(signum, frame):
        raise SystemExit(128 + signum)

    previous = signal.signal(signal.SIGTERM, terminate)
    try:
        with claim(args.config, args.place, args.role) as target:
            smoke(target, args.image, args.output, log_seconds=args.log_seconds,
                  max_log_bytes=args.max_log_bytes, expect=args.expect, approve=approve)
    finally:
        signal.signal(signal.SIGTERM, previous)
