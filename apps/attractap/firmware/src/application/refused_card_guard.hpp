// Remembers a card the server refused so it can be ignored while it stays on the reader (ATT-882)
// FEATURE: application
#pragma once

#include <cstddef>
#include <cstdint>
#include <mutex>
#include <string>

// Pure logic, no ESP/LVGL dependencies; the caller injects the clock. Safe across the main loop,
// websocket task and LVGL task: every access takes the internal mutex.
class RefusedCardGuard {
public:
  static constexpr uint32_t SUPPRESSION_ABSENCE_MS = 2000;
  static constexpr size_t MAX_UID_LENGTH = 10;

  // True for the server's card verdicts that start suppression. Transient errors (card removed,
  // busy, timeout, no connection, update needed) are not verdicts.
  static bool isCardVerdict(const std::string &code);

  // Remember a refused card, replacing any other suppressed identity.
  void recordRefusal(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs);
  // A card detection. True when it is the suppressed card still within the window (the last-seen
  // time is refreshed; the caller must do nothing else). An expired or other identity is released/ignored.
  bool shouldSuppress(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs);
  // Remember which card was just sent to the server, so a verdict can be attributed to it.
  void noteChecked(const uint8_t *uid, uint8_t uidLength);
  // Record a verdict for the card last noted by noteChecked().
  void recordRefusalOfChecked(uint32_t nowMs);
  void clear();

private:
  struct Identity {
    uint8_t bytes[MAX_UID_LENGTH] = {};
    uint8_t length = 0;
  };
  static Identity makeIdentity(const uint8_t *uid, uint8_t uidLength);
  static bool sameIdentity(const Identity &a, const Identity &b);

  std::mutex mutex;
  Identity suppressed;
  uint32_t lastSeenMs = 0;
  bool active = false;
  Identity checked;
  bool hasChecked = false;
};
