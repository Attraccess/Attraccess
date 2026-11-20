// Remembers a card the server refused so it can be ignored while it stays on the reader (ATT-882)
// FEATURE: application

#include "refused_card_guard.hpp"
#include <cstring>

bool RefusedCardGuard::isCardVerdict(const std::string &code) {
  return code == "CARD_NOT_FOUND" || code == "CARD_NOT_ACTIVE" || code == "CARD_AUTHENTICATION_FAILED" ||
         code == "CARD_NOT_SUPPORTED";
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

void RefusedCardGuard::recordRefusal(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs) {
  std::lock_guard<std::mutex> lock(mutex);
  suppressed = makeIdentity(uid, uidLength);
  lastSeenMs = nowMs;
  active = true;
}

bool RefusedCardGuard::shouldSuppress(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs) {
  std::lock_guard<std::mutex> lock(mutex);
  if (!active) return false;
  if (static_cast<uint32_t>(nowMs - lastSeenMs) >= SUPPRESSION_ABSENCE_MS) {
    active = false;
    return false;
  }
  if (!sameIdentity(suppressed, makeIdentity(uid, uidLength))) return false;
  lastSeenMs = nowMs;
  return true;
}

void RefusedCardGuard::noteChecked(const uint8_t *uid, uint8_t uidLength) {
  std::lock_guard<std::mutex> lock(mutex);
  checked = makeIdentity(uid, uidLength);
  hasChecked = true;
}

void RefusedCardGuard::recordRefusalOfChecked(uint32_t nowMs) {
  std::lock_guard<std::mutex> lock(mutex);
  if (!hasChecked) return;
  suppressed = checked;
  lastSeenMs = nowMs;
  active = true;
}

void RefusedCardGuard::clear() {
  std::lock_guard<std::mutex> lock(mutex);
  active = false;
  hasChecked = false;
}
