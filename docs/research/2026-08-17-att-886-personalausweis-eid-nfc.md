# German Personalausweis (eID) as an NFC credential — feasibility research (ATT-886)

> **Status:** Research / recommendation — no implementation yet.
> **Question:** Can we accept the German national ID as an NFC credential on the
> existing Attractap reader (ESP32 + PN532) and extract a *non-clonable unique
> identifier* so a presented ID can be verified against an account — without an
> Android/iOS app and without new hardware?

## 1. TL;DR

- **No new hardware and no phone app are needed.** The Personalausweis is an
  ISO 14443 contactless smartcard at 13.56 MHz; the PN532 already reads that
  band/protocol. The ESP32's mbedTLS has the ECC curves required.
- **But the existing "read UID" approach cannot be reused.** The eID card
  returns a *random* anti-collision UID on every session (a deliberate privacy
  feature). So "UID-only identification" (the current firmware's identifier,
  plus the fallback noted in the ticket) gives a different value every tap and
  is unusable as an account key.
- **The correct non-clonable identifier is the card's Chip Authentication public
  key (PK_ICC)** — a static, chip-individual ECC key bound to a private key that
  never leaves the secure element. Hashing it gives exactly the kind of
  "non-clonable unique ID" the existing NTAG424/DESFire AES scheme provides.
- **Extracting it requires PACE + Chip Authentication** (BSI TR-03110), which is
  a meaningful firmware effort — and, critically, **PACE needs the 6-digit CAN
  printed on the card**, so a reader cannot silently identify an arbitrary card
  on tap alone. This is the real constraint, not the hardware.

Net: it is *technically* feasible with the current hardware, but it is **not a
drop-in "tap to open" replacement** for an NFC card. It is best suited to
enrollment/verification flows where the user's identity (and thus their CAN) is
already known to the reader or is supplied at the moment of verification.

---

## 2. What the card actually is

The current German ID card (nPA, issued since 2010) is an ID-1 card with a
contactless chip:

- 13.56 MHz, ISO/IEC 14443 (proximity) + ISO/IEC 7816 (APDU command set)
  ([BSI German eID whitepaper][bsi-whitepaper], [Wikipedia][wiki-npa]).
- Data is protected by **BAC** and **EAC** as defined by BSI **TR-03110**
  ([Wikipedia: EAC][wiki-eac]).
- Two secrets gate the chip, both printed/known to the holder, neither readable
  over RF:
  - **CAN** — 6-digit Card Access Number, printed on the front of the card.
  - **PIN** — 6-digit holder PIN for the online eID function
    ([Wikipedia][wiki-npa]).
- **PACE** (Password Authenticated Connection Establishment) is the protocol
  that turns the CAN/PIN into an encrypted channel; it is *the* access protocol
  for German eID documents ([BSI][bsi-pace], TR-03110).
- **Chip Authentication (CA)** then (a) proves the chip is genuine and (b)
  exposes a **chip-individual static public key** — the anti-cloning anchor
  ([Wikipedia: EAC][wiki-eac]).

---

## 3. Why the current "UID + AES" model does not transfer

The Attractap firmware currently identifies a card by its **anti-collision UID**
(`readPassiveTargetID`, ISO 14443-3) and then authenticates with a stored AES key
(`apps/attractap/firmware/src/nfc/nfc.cpp` — `handleCardDetection`,
`authenticateInternal`). Two problems for the eID card:

1. **Random UID.** The German eID card emits a *randomized* UID per session as a
   privacy measure — precisely why BSI defines "Restricted Identification" (a
   sector-specific pseudonym derived from a chip private key) for cases that
   need a *stable* per-card value ([Personalausweisportal FAQ][ri-faq]). The
   random-UID behavior is also documented in the literature on e-passport
   traceability ([Wikipedia: BAC][wiki-bac]). **Consequence:** the UID captured
   by `readPassiveTargetID` today changes every tap and cannot be stored or
   matched.

2. **No AES/NXP command set.** The card does not speak NXP `GetVersion` or the
   NTAG424/DESFire `AuthenticateEV2First` used by `detectCardType()` /
   `authenticateInternal()`. It would be classified `CARD_TYPE_UNKNOWN` and every
   existing auth path would fail.

> **Verify on hardware (load-bearing):** confirm the random UID on a real card
> by polling it twice and observing two different UIDs. Everything else in this
> note assumes this holds.

---

## 4. The non-clonable unique identifier: Chip Authentication key (PK_ICC)

The property we want ("verify the presented ID belongs to this account, and a
copy can't fool us") is exactly what **Chip Authentication** provides:

- The card carries a **static, chip-individual ECC key pair** generated at
  production. The **private key (SK_ICC) never leaves the secure element**; the
  **public key (PK_ICC) is card-unique and stable** for the life of the card.
- During CA the reader reads PK_ICC and runs an ephemeral ECDH; the card proves
  possession of SK_ICC. The reader verifies with PK_ICC. A clone would have to
  hold SK_ICC, which is impossible to extract.

So the identifier is `hash(PK_ICC)` (e.g. SHA-256 of the compressed public key):
stable across sessions, unique per card, and unforgeable without the physical
secure element. This is the direct analogue of the NTAG424/DESFire AES-bound
identifier in the existing system.

---

## 5. What it takes to get PK_ICC

Standard EAC v2 sequence (TR-03110), all runnable on the PN532 + ESP32:

1. **ISO 14443-4 activation (T=CL)** — the PN532 already does this
   (`InDataExchange` in the bundled Adafruit driver). The eID card is an
   ISO 14443-4 Type A card; the PN532 supports Type A (and Type B / FeliCa), so
   no hardware change. The current firmware only polls `PN532_MIFARE_ISO14443A`,
   which is sufficient.
2. **Read `EF.CardAccess`** (unauthenticated) → `PACEInfo` +
   `ChipAuthenticationInfo` (tells us the PACE parameters/curve).
3. **PACE** using the **CAN** (or PIN) → establishes an encrypted channel.
   Requires ECDH over a standardized curve (brainpoolP256r1 / P384r1 / P512r1)
   plus the PACE password-mapping step.
4. **Chip Authentication** → read/verify **PK_ICC** (the identifier).

**Crypto on the ESP32:** PACE and CA need ECC (ECDH) on brainpool curves.
ESP-IDF's mbedTLS supports these curves (may need enabling in the mbedTLS
config). No dedicated crypto hardware is required for a one-shot enrollment
exchange, though PACE + CA at 106 kbit/s is on the order of a few seconds.

**Effort:** non-trivial but bounded. PACE + CA are standardized and have open
reference implementations (Open eCard / OpenPACE, AusweisApp2 core) that can be
ported. Expect several days–weeks of firmware work plus a
firmware-vs-backend protocol change, not a small patch. Firmware changes live in
`apps/attractap/firmware/src/nfc/` (new card-type branch + PACE/CA module); the
backend enrollment/verification flow lives in `apps/api`.

---

## 6. The actual constraint: CAN entry and the "can't identify on tap" problem

This is the part that determines whether the feature is viable, and it is a
**design** issue, not a hardware one:

- PACE requires the **CAN** (or PIN) *every session*. The CAN is only printed on
  the card, so an unattended reader cannot obtain it from the card itself.
- Because the card's UID is random, a reader that sees a *new* card has no way
  to look up "which enrolled account is this?" in order to fetch the stored CAN.

Consequently a Personalausweis **cannot** silently replace an NFC card for
"tap at any shared reader" access. It fits these flows instead:

| Flow | How the CAN is supplied | Fits Attraccess? |
|------|-------------------------|------------------|
| **Enrollment** (admin verifies a user's identity) | Admin/user types the 6-digit CAN into the web UI (or the reader touchscreen) while the card is held to a reader | Yes — one-time |
| **Re-verification of a *known/selected* identity** | The user is already identified by other means (login, or the resource is assigned to a small known set); the reader tries the stored CAN(s) of that small set | Yes, if the reader knows the candidate set |
| **Anonymous tap-to-open at a shared resource** | None available → reader can't run PACE | **Not feasible** |

For a resource assigned to one user (or a handful), the reader can fetch that
small set of stored CANs and run PACE+CA against each until PK_ICC matches — with
one user that is a single fast exchange; with dozens it becomes seconds and is
unacceptable. Entering the CAN at each verification (touchscreen keypad) is the
privacy-compatible fallback but is a worse UX than the existing cards.

---

## 7. Recommendation

1. **Don't treat this as a drop-in NFC card.** The German eID is designed to be
   unlinkable-on-tap; any stable identity requires the CAN (or PIN). This is by
   design and cannot be bypassed without a government sector key (Restricted
   Identification), which is out of reach.
2. **Target the enrollment/verification use case** — "prove this presented ID
   belongs to this account" — not silent tap-to-open:
   - Capture `hash(PK_ICC)` + the CAN once at enrollment (CAN typed once).
   - Later, verify by re-running PACE (stored CAN) + CA and comparing PK_ICC.
3. **Confirm the two load-bearing assumptions on hardware before committing**
   (random UID; that a real eID card completes PACE+CA against a PN532 at
   106 kbit/s with an acceptable latency).
4. **Prototype PACE+CA on the ESP32** using Open eCard/OpenPACE as a reference
   before wiring it into the product protocol.

If the goal is strictly "a non-clonable unique identifier on tap without any
user input," the German Personalausweis **cannot provide it** — the existing
NTAG424 DNA / DESFire cards remain the right tool for that. If the goal is
"verify a presented physical ID against an account in an enrollment/verification
flow," it is feasible on the current hardware with the PACE+CA firmware work
above.

---

## 8. References

- BSI — *German eID scheme (whitepaper v1.4)*: chip is ID-1, ISO 14443 + ISO 7816.
  <https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/EIDAS/German_eID_Whitepaper_v1-4.pdf>
- BSI — *PACE* (access protocol for German eID cards):
  <https://www.bsi.bund.de/EN/Themen/Oeffentliche-Verwaltung/Elektronische-Identitaeten/Elektronische-Ausweisdokumente/Sicherheitsmechanismen/PACE/pace.html>
- BSI — *TR-03110* (EAC: PACE, Chip Authentication, Restricted Identification):
  <https://www.bsi.bund.de/EN/Service-Navi/Publications/TechnicalGuidelines/TR03110/BSITR03110.html>
- Wikipedia — *German identity card* (CAN, PIN, BAC/EAC, chip):
  <https://en.wikipedia.org/wiki/German_identity_card>
- Wikipedia — *Extended Access Control* (Chip Authentication = chip-individual key):
  <https://en.wikipedia.org/wiki/Extended_Access_Control>
- Wikipedia — *Basic access control* (randomized UIDs / traceability attack):
  <https://en.wikipedia.org/wiki/Basic_access_control>
- Personalausweisportal — *Restricted Identification* (pseudonym from chip private key):
  <https://www.personalausweisportal.de/Webs/PA/EN/home/home-node.html>
- Open eCard / OpenPACE (open reference implementation of EAC/PACE):
  <https://github.com/ecsec/open-ecard>

[bsi-whitepaper]: https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/EIDAS/German_eID_Whitepaper_v1-4.pdf
[bsi-pace]: https://www.bsi.bund.de/EN/Themen/Oeffentliche-Verwaltung/Elektronische-Identitaeten/Elektronische-Ausweisdokumente/Sicherheitsmechanismen/PACE/pace.html
[wiki-npa]: https://en.wikipedia.org/wiki/German_identity_card
[wiki-eac]: https://en.wikipedia.org/wiki/Extended_Access_Control
[wiki-bac]: https://en.wikipedia.org/wiki/Basic_access_control
[ri-faq]: https://www.personalausweisportal.de/Webs/PA/EN/home/home-node.html
