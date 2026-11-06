# Device-lab Secure Boot keys (lab only)

These RSA-3072 keys are **public on purpose**. They exist only for device-lab
secure test readers (ATT-1166), so a lab reader can always be re-flashed and
recovered, whoever ran it last and whatever happened to a lab server's database.
They protect nothing.

- `lab-signing-key.pem`: digest burned into `BLOCK_KEY0` (`SECURE_BOOT_DIGEST0`).
  Signs every image for lab readers.
- `lab-recovery-key.pem`: digest burned into `BLOCK_KEY1` (`SECURE_BOOT_DIGEST1`),
  same slot as the recovery key on customer readers.

Never use either key for a customer installation, and never burn their digests
into a reader that leaves the lab: anyone can sign firmware for it.

## Lab secure readers

Build the lab profile (secure profile plus `sdkconfig.secure-lab`: development-mode
flash encryption and a USB console):

```sh
idf.py -B build/attractap-touch-v2-secure-lab \
  -DSDKCONFIG=$PWD/build/attractap-touch-v2-secure-lab/sdkconfig \
  -DATTRACTAP_VARIANT=attractap-touch-v2 -DATTRACTAP_TEST_HOOKS=ON -DATTRACTAP_BEEPER_DEFAULT=OFF \
  -DATTRACTAP_SECURE_PROFILE=ON -DATTRACTAP_SECURE_LAB=ON build
```

Then use `tools/secure_lab_reader.py` (inside an ESP-IDF environment):

- `status --port …`: security eFuses, read-only.
- `flash --port … --build-dir …`: signs with the lab key and writes encrypted
  images. Also recovers a lab reader whose flash was erased. Add `--erase-all`
  to drop its settings.
- `hex --build-dir … --output reader.hex`: signs with the lab key and merges
  everything into one Intel HEX image for `esptool write-flash --force
  --erase-all --encrypt 0x0`. That is the write a lab place makes
  (`ESPToolDriver.erase_and_flash_encrypted` in `apps/attractap-lab`), e.g. in
  the HIL suite's `READER_PROFILE=secure-lab` mode.
- `provision --port … --build-dir … --expect-mac … --burn-efuses`: first time only,
  on a fresh reader. Refuses any chip whose MAC (shown by `status`) differs from
  `--expect-mac`. Burns the lab key digests, erases the whole flash, then writes
  plaintext images; the first boot enables Secure Boot and flash encryption and
  resets a few times. Watch the console (`idf.py -p … monitor`) and keep the reader
  powered until it shows "Welcome to Attractap". Irreversible.

Do not run a release-mode (customer) secure image on a lab reader: its first
boot switches flash encryption to release mode for good, and the reader then
only accepts signed OTA updates.

Known lab secure readers:

| Reader | USB serial | Provisioned | Lab place |
| ------ | ---------- | ----------- | --------- |
| Touch V2 (cracked display glass) | `DC:B4:D9:21:71:C8` | 2026-10-30 | `attractap-touch-v2-secure-1` |
