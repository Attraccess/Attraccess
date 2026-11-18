# DS records of the lab secure readers

The lab secure reader `attractap-touch-v2-secure-1` (chip MAC `DC:B4:D9:21:71:C8`) keeps an RSA-3072
identity in the ESP32-S3 Digital Signature (DS) peripheral (ATT-1207). One directory per reader, named
after the MAC without colons:

```
dcb4d92171c8/
  ds-record.bin       the DS record exactly as the firmware keeps it (no 0xFF padding)
  ds-public-key.pem   the public key of that DS key (derived from the record)
```

Everything in these files is **public by design**. The record holds the *encrypted* DS parameters and the
public key. The encryption key (the HMAC key) lives only in the chip's KEY3 eFuse block, read-protected, and
never leaves the chip, so the record is of no use on any other chip. Jan Jaap approved committing the files
because the reader is a lab test device (ATT-1207, decision of 2026-11-18). **Never commit anything else
from a reader here, and never a record of a customer reader.**

## Why they are in the repo

A wipe (`secure_lab_reader.py flash --erase-all`, a janitor park, the HIL suite's `write_secure_image`)
erases the flash, and with it the record at the start of the `spiffs` partition (0xC90000, one 4 KiB
sector; layout in `apps/attractap/firmware/README.md`). Without the record the DS key is lost for good,
because KEY3 cannot be burned twice. The tools therefore write the committed record back, encrypted
(development-mode flash encryption), in the same esptool call as the image. A chip whose MAC has no
directory here is treated as before, unless its KEY3 already holds the DS key: a wipe of such a reader
without its record is refused (`flash --erase-all`, the janitor, which then quarantines the reader, and
the HIL suite), because it would lose the DS key for good.

- `secure_lab_reader.py flash` adds the record automatically; `hex --mac <mac>` merges it into the HEX
  (any MAC spelling; it says whether it found a record).
- Janitor and HIL (`attractap_lab.ds_record`): `ATTRACTAP_LAB_DS_DIR` (set by the NixOS option
  `services.attractap-lab.janitor.dsRecordsDir`) or this directory of the source checkout. The check runs
  inside `ESPToolDriver.erase_and_flash_encrypted`, so no caller can skip it.
- A record that fails validation (the same checks as the firmware's own parser) stops the wipe: the tools
  refuse to erase a reader whose record they cannot restore.

## The one-time burn (done once; do not repeat)

`create-ds` burns **KEY3** as `HMAC_DOWN_DIGITAL_SIGNATURE` (read-protected) and write-protects **RD_DIS**.
It exists for this one reader only: the tool and the firmware both compare the MAC with
`dc:b4:d9:21:71:c8`, and the firmware command only exists in secure-lab builds, never runs on boot and
never retries a burn. Order of the runbook:

1. Deploy the janitor from the PR branch first (it accepts the states before and after the burn for this
   MAC). With the janitor of `main` from before ATT-1207 the reader would be quarantined.
2. Flash the secure-lab build (`secure_lab_reader.py flash --erase-all`), keep the reader on its USB port.
3. Dry run, read-only (eFuse dump and the pre-checks):

   ```sh
   . .tools/esp-idf/export.sh
   python3 apps/attractap/firmware/tools/secure_lab_reader.py create-ds \
     --port /dev/ttyACM0 --expect-mac dc:b4:d9:21:71:c8 --dump-dir ~/ds-burn
   ```

4. After explicit go-ahead from Jan Jaap, the same command with `--burn-efuses`. It saves the eFuse dump
   before and after (`efuse-before.txt`, `efuse-after.txt` in `--dump-dir`; each dump ends with a hard
   reset, and the tool waits until the app answers `ds.status` again), sends `ds.create` once, checks the
   burned state, exports the record (`ds.export`, raw reply kept as `ds-export.txt`), validates it,
   checks that its public key is the one the firmware generated (the `spki` of `DS_CREATE_RESULT` and of
   `DS_STATUS` after the reboot) and writes `ds-record.bin` and `ds-public-key.pem` here (default:
   `$ATTRACTAP_LAB_DS_DIR/dcb4d92171c8` or this directory; a backup goes into `--dump-dir`). A record
   whose key does not match is saved to `--dump-dir` only. If creation fails after KEY3 was burned, the
   tool still exports and saves the record before it reports the error. It stops at the first surprise
   and never retries.
5. **Commit the two files immediately.** If the record is lost, DS on that reader is gone for good.
6. The credential fingerprint the server shows for the reader is the sha256 of the SPKI in the record
   (printed by the tool; the HIL suite compares it).

The janitor's expectations for this MAC are in `apps/attractap-lab/src/attractap_lab/efuse.py`.
