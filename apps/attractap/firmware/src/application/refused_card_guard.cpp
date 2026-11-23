// Remembers a card the server refused so it can be ignored while it stays on the reader (ATT-882)
// FEATURE: application

#include "refused_card_guard.hpp"
#include <cstring>

bool RefusedCardGuard::isCardVerdict(const std::string &code) {
  return code == "CARD_NOT_FOUND" || code == "CARD_NOT_ACTIVE" || code == "CARD_AUTHENTICATION_FAILED" ||
         code == "CARD_NOT_SUPPORTED" || code == "UID_ONLY_CARDS_DISABLED" || code == "RANDOM_UID_NOT_SUPPORTED";
}

RefusedCardGuard::Identity RefusedCardGuard::makeIdentity(const uint8_t *uid, uint8_t uidLength) {
  Identity id;
  // ISO 14443-3 random UIDs (phones, privacy cards): 4 bytes starting 0x08, different every time.
  if (uidLength == 4 && uid[0] == 0x08) {
    id.bytes[0] = 0x08;
    id.length = 4;
    return id;
  }
  id.length = uidLength > MAX_UID_LENGTH ? MAX_UID_LENGTH : uidLength;
  memcpy(id.bytes, uid, id.length);
  return id;
}

bool RefusedCardGuard::sameIdentity(const Identity &a, const Identity &b) {
  return a.length == b.length && memcmp(a.bytes, b.bytes, a.length) == 0;
}

// Fewer than windowMs since sinceMs (unsigned: safe across the millis() wrap). A sinceMs slightly
// ahead of nowMs (up to MAX_CLOCK_SKEW_MS) also counts: another task stored it after the caller read the clock.
bool RefusedCardGuard::within(uint32_t sinceMs, uint32_t nowMs, uint32_t windowMs) {
  return static_cast<uint32_t>(nowMs - sinceMs) < windowMs || static_cast<uint32_t>(sinceMs - nowMs) <= MAX_CLOCK_SKEW_MS;
}

void RefusedCardGuard::noteChecked(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs) {
  std::lock_guard<std::mutex> lock(mutex);
  checked = makeIdentity(uid, uidLength);
  checkedAtMs = nowMs;
  hasChecked = true;
}

void RefusedCardGuard::forgetChecked() {
  std::lock_guard<std::mutex> lock(mutex);
  hasChecked = false;
}

void RefusedCardGuard::recordVerdict(const std::string &code, uint32_t nowMs) {
  std::lock_guard<std::mutex> lock(mutex);
  if (!hasChecked) return;
  hasChecked = false;
  if (!isCardVerdict(code)) return;
  suppressed = checked;
  lastSeenMs = nowMs;
  active = true;
}

bool RefusedCardGuard::shouldSuppress(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs) {
  std::lock_guard<std::mutex> lock(mutex);
  if (!active) return false;
  if (!within(lastSeenMs, nowMs, SUPPRESSION_ABSENCE_MS)) {
    active = false;
    return false;
  }
  if (!sameIdentity(suppressed, makeIdentity(uid, uidLength))) return false;
  lastSeenMs = nowMs;
  return true;
}

bool RefusedCardGuard::awaitingVerdict(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs) {
  std::lock_guard<std::mutex> lock(mutex);
  return hasChecked && within(checkedAtMs, nowMs, VERDICT_WAIT_MS) && sameIdentity(checked, makeIdentity(uid, uidLength));
}

void RefusedCardGuard::clear() {
  std::lock_guard<std::mutex> lock(mutex);
  active = false;
  hasChecked = false;
}
