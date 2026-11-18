"""`secure_lab_reader.py create-ds`: the approved one-time DS burn of the lab reader DC:B4:D9:21:71:C8 (ATT-1207).

The firmware (secure-lab build) does the burn; this side checks the eFuses before and after, drives the
reader's console and keeps the exported DS record. Console protocol (src/api/security/ds_console.hpp), each
command a `CMND <topic> [argument]` line:

  CMND ds.status          DS_STATUS available=<0|1> record=<0|1> key3=<purpose> fe=<mode> spki=<hex|->
  CMND ds.create <mac>    DS_CREATE_BURNED <0|1>, then DS_CREATE_RESULT ok spki=<hex> | DS_CREATE_RESULT error <code>
  CMND ds.export          DS_RECORD_BEGIN / <base64 record> / DS_RECORD_END, or DS_RECORD_ERROR <code>

`spki` is the SHA-256 of the DS public key's SubjectPublicKeyInfo DER. Every espefuse run here ends with a
hard reset, and the console is polled with the read-only `ds.status` until the app answers, because the
reader would otherwise stay in ROM download mode. `ds.create` is sent exactly once, never again.
"""

import base64
import hashlib
import json
import os
import re
import tempfile
import time

import ds_record
import secure_lab_reader as lab
from secure_lab_reader import LabReaderError, describe, lab_digests_burned, mac, value

# The single reader that may ever run create-ds (decision of 2026-11-07: KEY3 + RD_DIS lock, once).
APPROVED_DS_MAC = "dc:b4:d9:21:71:c8"
DS_PURPOSE = lab.DS_PURPOSE
CREATE_TIMEOUT_S = 600
# The app boots after espefuse's hard reset (Secure Boot verification included) well within this.
CONSOLE_READY_S = 60
STATUS_PATTERN = r"DS_STATUS[^\n]*\n"
# DS_CREATE_BURNED comes first (not after a MAC mismatch); a line counts once its newline arrived.
CREATE_PATTERN = r"(?:DS_CREATE_BURNED[^\n]*\n.*?)?DS_CREATE_RESULT[^\n]*\n"
EXPORT_PATTERN = r"DS_RECORD_BEGIN.*?DS_RECORD_END|DS_RECORD_ERROR[^\n]*\n"


def split_dump(output):
    """The JSON summary of an `espefuse dump summary --format json` run."""
    start = output.find("{", output.find('=== Run "summary" command ==='))
    if start < 0:
        raise LabReaderError("espefuse output has no JSON summary")
    return json.JSONDecoder().raw_decode(output[start:])[0]


def dump_efuses(port, path):
    """Full eFuse dump (raw blocks + JSON summary) saved to `path`; returns the summary.

    espefuse leaves the chip in ROM download mode by default (`--after no-reset`); the hard reset boots
    the app again (an RTS pulse, which also works in Secure Download Mode, unlike watchdog-reset)."""
    output = lab.run(["espefuse", "-p", port, "--chip", lab.CHIP, "--after", "hard-reset",
                      "dump", "summary", "--format", "json"], capture=True)
    with open(path, "w") as f:
        f.write(output)
    return split_dump(output)


def unread(efuses, name):
    return efuses[name].get("readable") is False


def ds_precheck_problems(efuses, digests):
    """Everything that must hold right before the burn; any surprise stops the command."""
    problems = []
    if mac(efuses) != APPROVED_DS_MAC:
        problems.append(f"chip MAC {mac(efuses)} is not the approved {APPROVED_DS_MAC}")
    if not value(efuses, "SECURE_BOOT_EN"):
        problems.append("Secure Boot is not enabled (not a secure-lab reader)")
    if not lab_digests_burned(efuses, digests):
        problems.append("KEY0/KEY1 do not hold the lab key digests")
    cnt = lab.crypt_cnt(efuses)
    if not lab.flash_encryption_on(cnt) or value(efuses, "DIS_DOWNLOAD_MANUAL_ENCRYPT") \
            or not efuses["SPI_BOOT_CRYPT_CNT"].get("writeable", True):
        problems.append("flash encryption is not in development mode")
    for index, purpose in ((2, "XTS_AES_128_KEY"), (4, "HMAC_UP")):
        if value(efuses, f"KEY_PURPOSE_{index}") != purpose:
            problems.append(f"KEY{index} purpose is {value(efuses, f'KEY_PURPOSE_{index}')}, not {purpose}")
        if not unread(efuses, f"BLOCK_KEY{index}"):
            problems.append(f"KEY{index} is not read-protected")
    if value(efuses, "KEY_PURPOSE_3") != "USER" or (not unread(efuses, "BLOCK_KEY3")
                                                     and lab.block_hex(efuses, "BLOCK_KEY3").strip("0 ")):
        problems.append("KEY3 is not unused")
    if unread(efuses, "BLOCK_KEY3"):
        problems.append("KEY3 is already read-protected")
    if efuses["RD_DIS"].get("writeable", True) is False:
        problems.append("RD_DIS is already write-protected")
    return problems


def ds_burned_problems(efuses):
    """What must read back after a successful creation."""
    problems = []
    if value(efuses, "KEY_PURPOSE_3") != DS_PURPOSE:
        problems.append(f"KEY_PURPOSE_3 is {value(efuses, 'KEY_PURPOSE_3')}, not {DS_PURPOSE}")
    if not unread(efuses, "BLOCK_KEY3"):
        problems.append("KEY3 is not read-protected")
    if efuses["RD_DIS"].get("writeable", True) is not False:
        problems.append("RD_DIS is not write-protected")
    return problems


def key3_touched(efuses):
    """Whether the burn changed anything of KEY3 (the firmware's DS_CREATE_BURNED may be missing)."""
    return value(efuses, "KEY_PURPOSE_3") != "USER" or unread(efuses, "BLOCK_KEY3")


def console_exchange(port, command, pattern, timeout, baud=115200):
    """Send `CMND <command>` once and return the text matching `pattern` (a regex, DOTALL) from the reply.

    The firmware's serial handler drops lines without `CMND`; the leading newline ends any stray partial
    line on its input. DTR/RTS stay low so opening the port does not reset the reader."""
    import serial  # inside the ESP-IDF environment (esptool depends on pyserial)
    regex = re.compile(pattern, re.S)
    deadline = time.monotonic() + timeout
    seen = ""
    with serial.Serial() as console:
        console.port, console.baudrate, console.timeout = port, baud, 0.5
        console.dtr = console.rts = False
        console.open()
        console.reset_input_buffer()
        console.write(f"\nCMND {command}\n".encode())
        while time.monotonic() < deadline:
            seen += console.read(4096).decode("utf-8", "replace")
            match = regex.search(seen)
            if match:
                return match.group(0)
    raise LabReaderError(f"no answer to `{command.split()[0]}` within {timeout}s")


def wait_for_console(port, baud, timeout=CONSOLE_READY_S, attempt_seconds=3):
    """Poll with the read-only `ds.status` until the app answers; returns its DS_STATUS line.

    After espefuse's hard reset the reader reboots (its USB port disappears for a moment), so the port
    may be missing or silent for a few seconds."""
    deadline = time.monotonic() + timeout
    last = "no attempt"
    while time.monotonic() < deadline:
        try:
            return console_exchange(port, "ds.status", STATUS_PATTERN,
                                    max(0.5, min(attempt_seconds, deadline - time.monotonic())), baud).strip()
        except LabReaderError as error:
            last = str(error)
        except OSError as error:  # serial.SerialException: the port is re-enumerating
            last = str(error)
            time.sleep(0.5)
    raise LabReaderError(f"the reader's console did not answer `ds.status` within {timeout}s ({last})")


def parse_status(line):
    return dict(part.split("=", 1) for part in line.split()[1:] if "=" in part)


def parse_create(text):
    """(result line without the prefix, DS_CREATE_BURNED value or None, spki fingerprint or None)."""
    burned = re.search(r"DS_CREATE_BURNED (\d)", text)
    result = re.search(r"DS_CREATE_RESULT ([^\n]*)", text).group(1).strip()
    fields = parse_status("DS_CREATE_RESULT " + result)
    return result, burned.group(1) if burned else None, fields.get("spki")


def parse_export(text):
    """The record bytes of a `ds.export` reply (log lines between the markers are ignored)."""
    body = text.split("DS_RECORD_BEGIN", 1)[1].rsplit("DS_RECORD_END", 1)[0]
    encoded = "".join(line.strip() for line in body.splitlines() if re.fullmatch(r"[A-Za-z0-9+/=]+", line.strip()))
    try:
        return base64.b64decode(encoded, validate=True)
    except ValueError as error:
        raise LabReaderError(f"ds.export did not return base64: {error}") from error


def export_record(port, baud, dump_dir):
    """`ds.export`: the validated record (no padding). The raw reply is kept in `dump_dir` first."""
    text = console_exchange(port, "ds.export", EXPORT_PATTERN, 60, baud)
    with open(os.path.join(dump_dir, "ds-export.txt"), "w") as f:
        f.write(text)
    if text.startswith("DS_RECORD_ERROR"):
        raise LabReaderError(f"ds.export answered {text.strip()}")
    return ds_record.exact(parse_export(text))


def spki_mismatches(spki, created, status, require_created=True):
    """Why the exported record's key is not the key the firmware reported, or [] when it is.

    created: the spki of DS_CREATE_RESULT (the key generated in RAM; required unless `require_created` is
    false). status: the spki of the DS_STATUS after the reboot (hashed from the record the firmware loaded; compared
    when reported)."""
    fingerprint = hashlib.sha256(spki).hexdigest()
    problems = []
    if not created:
        if require_created:
            problems.append("DS_CREATE_RESULT reported no spki")
    elif created.lower() != fingerprint:
        problems.append(f"DS_CREATE_RESULT spki {created} is not the record's {fingerprint}")
    if status and status != "-" and status.lower() != fingerprint:
        problems.append(f"DS_STATUS spki {status} is not the record's {fingerprint}")
    return problems


def save_ds_files(record, spki, out_dir, backup_dir):
    """Write ds-record.bin and ds-public-key.pem to `backup_dir` and (unless None) `out_dir`.

    Never replaces a committed, different file."""
    files = {"ds-record.bin": record, "ds-public-key.pem": ds_record.spki_pem(spki).encode()}
    os.makedirs(backup_dir, exist_ok=True)
    for name, data in files.items():
        with open(os.path.join(backup_dir, name), "wb") as f:
            f.write(data)
    if out_dir is None:
        return
    os.makedirs(out_dir, exist_ok=True)
    for name, data in files.items():
        target = os.path.join(out_dir, name)
        if os.path.exists(target):
            with open(target, "rb") as f:
                if f.read() != data:
                    raise LabReaderError(f"{target} exists and differs; the new files are in {backup_dir}")
        else:
            with open(target, "wb") as f:
                f.write(data)


def salvage_after_failed_burn(args, result, out_dir, dump_dir):
    """Creation failed after KEY3 was burned: keep whatever record the reader holds, then raise."""
    try:
        status = parse_status(wait_for_console(args.port, args.baud))
        record = export_record(args.port, args.baud, dump_dir)
    except (LabReaderError, ds_record.DsRecordError) as error:
        raise LabReaderError(f"DS_CREATE_RESULT {result} after KEY3 was burned, and the record could not be "
                             f"exported ({error}). Do not retry and do not wipe the reader; inspect {dump_dir} "
                             "and the eFuses") from error
    spki = ds_record.parse(record)["spki"]
    mismatches = spki_mismatches(spki, None, status.get("spki"), require_created=False)
    save_ds_files(record, spki, None if mismatches else out_dir, dump_dir)
    where = dump_dir if mismatches else f"{out_dir} and {dump_dir}"
    raise LabReaderError(f"DS_CREATE_RESULT {result} after KEY3 was burned (status {status}). The record the "
                         f"reader holds is saved to {where}{': ' + '; '.join(mismatches) if mismatches else ''}. "
                         "Do not retry; commit the record before any wipe, then inspect the eFuses")


def cmd_create_ds(args):
    expected = lab.normalise_mac(args.expect_mac)
    if expected != APPROVED_DS_MAC:
        raise LabReaderError(f"create-ds is approved for {APPROVED_DS_MAC} only, not {expected}")
    dump_dir = args.dump_dir or tempfile.mkdtemp(prefix="create-ds-")
    os.makedirs(dump_dir, exist_ok=True)
    out_dir = args.out_dir or os.path.join(lab.ds_dir(), APPROVED_DS_MAC.replace(":", ""))
    if os.path.exists(os.path.join(out_dir, "ds-record.bin")):
        raise LabReaderError(f"{out_dir} already holds a DS record: this reader has its DS key")
    digests = (lab.key_digest(lab.SIGNING_KEY), lab.key_digest(lab.RECOVERY_KEY))
    before = dump_efuses(args.port, os.path.join(dump_dir, "efuse-before.txt"))
    describe(before)
    problems = ds_precheck_problems(before, digests)
    if problems:
        raise LabReaderError("pre-check failed, nothing was burned: " + "; ".join(problems))
    if not args.burn_efuses:
        print(f"Dry run: all pre-checks pass for {APPROVED_DS_MAC}. With --burn-efuses this would run `ds.create`, "
              f"which burns KEY3 as {DS_PURPOSE} (read-protected) and write-protects RD_DIS, then export the "
              f"record to {out_dir}. eFuse dumps are in {dump_dir}.")
        return
    status = parse_status(wait_for_console(args.port, args.baud))
    if status.get("available") != "0" or status.get("record") != "0" or status.get("key3") not in ("unused", "USER") \
            or status.get("fe") != "development":
        raise LabReaderError(f"the firmware reports {status}; expected a secure-lab build with no DS yet")
    print("Creating the DS key: this burns eFuses and cannot be undone or retried.", flush=True)
    try:
        reply = console_exchange(args.port, f"ds.create {APPROVED_DS_MAC}", CREATE_PATTERN, CREATE_TIMEOUT_S,
                                 args.baud)
    except LabReaderError as error:
        # No answer: KEY3 may or may not be burned. The after-dump decides; never send ds.create again.
        after = dump_efuses(args.port, os.path.join(dump_dir, "efuse-after.txt"))
        describe(after)
        if key3_touched(after):
            salvage_after_failed_burn(args, f"unknown ({error})", out_dir, dump_dir)
        raise LabReaderError(f"{error}; KEY3 reads unburned. State unknown: do not retry before the dumps in "
                             f"{dump_dir} and the console log are understood") from error
    result, burned, created_spki = parse_create(reply)
    after = dump_efuses(args.port, os.path.join(dump_dir, "efuse-after.txt"))
    describe(after)
    if result.split()[:1] != ["ok"]:
        if burned == "1" or key3_touched(after):
            salvage_after_failed_burn(args, result, out_dir, dump_dir)
        raise LabReaderError(f"DS_CREATE_RESULT {result}; KEY3 reads unburned, so this was refused before the "
                             f"burn. Fix the cause and re-run (dumps in {dump_dir})")
    status = parse_status(wait_for_console(args.port, args.baud))
    record = export_record(args.port, args.baud, dump_dir)
    spki = ds_record.parse(record)["spki"]
    mismatches = spki_mismatches(spki, created_spki, status.get("spki"))
    if mismatches:
        save_ds_files(record, spki, None, dump_dir)
        raise LabReaderError("the exported record is not verified: " + "; ".join(mismatches)
                             + f". It is saved to {dump_dir} only; do not commit it before this is understood")
    save_ds_files(record, spki, out_dir, dump_dir)
    problems = ds_burned_problems(after)
    if problems:
        raise LabReaderError("the burn did not read back: " + "; ".join(problems)
                             + f" (record saved to {out_dir}, dumps in {dump_dir})")
    if status.get("available") != "1" or status.get("record") != "1" or status.get("key3") != DS_PURPOSE:
        raise LabReaderError(f"the firmware reports {status} after the burn (record saved to {out_dir})")
    print(f"DS key created. Record and public key written to {out_dir} and verified against the key the "
          f"firmware generated; commit them now. Credential fingerprint the server will show: "
          f"{ds_record.fingerprint(spki)}. Dumps: {dump_dir}")
