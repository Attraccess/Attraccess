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
  // How long a card sent to the server counts as waiting for its verdict (see awaitingVerdict()).
  static constexpr uint32_t VERDICT_WAIT_MS = 2000;
  // A timestamp stored on another task just after the caller read the clock is at most this far ahead.
  static constexpr uint32_t MAX_CLOCK_SKEW_MS = 100;
  static constexpr size_t MAX_UID_LENGTH = 10;

  // True for the server's card verdicts that start suppression. Transient errors (card removed,
  // busy, timeout, no connection, update needed) are not verdicts. Not the same list as the
  // "Please tap a valid NFC card" answer, which leaves out CARD_NOT_SUPPORTED to name it.
  static bool isCardVerdict(const std::string &code);

  // A card was sent to the server: its answer is attributed to it.
  void noteChecked(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs);
  // The noted card never reached the server (the send failed): no answer will come.
  void forgetChecked();
  // The server answered the noted card with an error. A card verdict starts suppressing that card
  // (replacing any other); any answer uses the note up, so a late duplicate attributes nothing.
  void recordVerdict(const std::string &code, uint32_t nowMs);
  // A card detection. True when it is the suppressed card still within the window (the last-seen
  // time is refreshed; the caller must do nothing else). An expired or other identity is released/ignored.
  bool shouldSuppress(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs);
  // True when this is the noted card, its answer has not come yet and it was sent less than
  // VERDICT_WAIT_MS ago. For readers that keep no pending check of their own (Lite).
  bool awaitingVerdict(const uint8_t *uid, uint8_t uidLength, uint32_t nowMs);
  // A successful sign-in: nothing suppressed, nothing noted.
  void clear();

private:
  struct Identity {
    uint8_t bytes[MAX_UID_LENGTH] = {};
    uint8_t length = 0;
  };
  static Identity makeIdentity(const uint8_t *uid, uint8_t uidLength);
  static bool sameIdentity(const Identity &a, const Identity &b);
  static bool within(uint32_t sinceMs, uint32_t nowMs, uint32_t windowMs);

  std::mutex mutex;
  Identity suppressed;
  uint32_t lastSeenMs = 0;
  bool active = false;
  Identity checked;
  uint32_t checkedAtMs = 0;
  bool hasChecked = false;
};
