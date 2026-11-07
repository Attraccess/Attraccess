# Real-card session kit

One command runs a scripted session with real DESFire EV2, DESFire EV3 and NTAG 424 DNA cards on the
lab reader, records every card conversation, and checks the server's card crypto against the 1.7.x
firmware card code on those real answers.

```sh
cd apps/attractap-lab/real-cards
./run-real-card-session.sh              # real cards (move the NFC emulator out of the way first)
./run-real-card-session.sh --emulate    # dry run: the NFC emulator plays the three cards
```

Needs ESP-IDF (found in `.tools/esp-idf` or already sourced), the labgrid client with the lab place
(`LG_PLACE_NAME`, default `attractap-touch-v2-1`), Node 24 and a C++17 compiler. Options: `--cards
EV3,NTAG424` (subset), `--speak` (macOS `say` for each prompt). `READER_IMAGE` / `EMULATOR_IMAGE` skip
the builds. `KEEP_API=1` leaves the API and the wire proxy running afterwards (the script prints how to
stop them); `API_START_TIMEOUT` (default 120 s) bounds the wait for the API. Cards must be factory
fresh (the server records slot 1 for the reference format).

## What the person does

Wait for a banner, do what it says, repeat it if the banner comes again. Nothing is timed by hand: the
script notices the reader's and the API's reaction and, if the card was not seen, shows the banner
again ("AGAIN: LIFT THE CARD, WAIT 2 SECONDS, THEN ..."). Per card, about 14 placements:

1. enroll (card is armed from the API; place, hold, lift)
2. six login taps; the fourth is a "pulled early" tap (touch and pull away at once, nothing may happen)
3. reset to factory
4. interrupted enroll: the API cuts the link right after the card answered ChangeKey, so only the
   server's encrypted pending record knows the new key
5. tap again: the server recovers the enrollment (card record appears, login works)
6. reset again; the card ends in factory state

Each step also checks the server side (card record and key slot 1-5, pending record, record removed).

## What it records (`runs/<timestamp>/`)

| file                                  | content                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary.md`                          | steps per card, PN532 failure rate per card type, replay verdicts, time needed                                                                                                |
| `wiretap.jsonl`                       | plaintext of every reader/API message, with full APDUs and card answers (`wiretap.cjs`, preloaded into the API; the websocket itself is TLS, so a proxy only sees ciphertext) |
| `wire.jsonl`                          | raw TCP bytes between reader and API (`wireproxy.py`), proves the wire is opaque                                                                                              |
| `reader-serial.log`                   | reader UART; `PN532 InDataExchange status 0x..` lines are the failed exchanges                                                                                                |
| `keys.json`                           | card keys from the API database, decrypted with `AUTH_SESSION_SECRET` (`dump-keys.mjs`); lab secret, never commit                                                             |
| `recordings/*.json`                   | every conversation in the reference-recordings format, plus `comparison.json`                                                                                                 |
| `session-report.json`, `events.jsonl` | machine readable report and the prompt/step timeline                                                                                                                          |

The failure rate per card type is `PN532 failures / CARD_APDU the server sent` during that card's part.

## Checking a recording against the 1.7.x code

`replay/compare.mjs` runs automatically. For each conversation it recovers the key and the server's
random value RndA of every `AuthenticateEV2First` (decrypt the card's RndB with the key, then the
server's part 2 `RndA || RndB'`, accept the key that is consistent), then runs the 1.7.x firmware card
code (`replay/replay.sh` builds it from commit `1246699f3` as `reference-recordings/record.sh` does,
with a "replay chip" that answers with the captured card responses in order and the recovered randoms)
and compares the APDUs it sends with the server's, byte for byte. Output: `MATCH` or `MISMATCH` with the
first differing exchange. Run it by hand on any run folder:

```sh
replay/replay.sh && node replay/compare.mjs --wiretap runs/X/wiretap.jsonl --keys runs/X/keys.json --out /tmp/rec
node replay/selftest.mjs      # the repo's own reference recordings must compare as MATCH
```

Copy wanted `recordings/real-*.json` into `apps/attractap/firmware/tests/reference-recordings/recordings/`
(without secrets: they hold the card keys of the session) to let `reference-recordings.spec.ts` replay them.
