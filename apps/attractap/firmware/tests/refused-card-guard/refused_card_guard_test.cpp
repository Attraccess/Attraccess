#include "refused_card_guard.hpp"

#include <cassert>
#include <cstdint>

namespace {
const uint8_t UID_A[7] = {0x04, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x01};
const uint8_t UID_B[7] = {0x04, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66};
const uint8_t PHONE_1[4] = {0x08, 0x01, 0x02, 0x03};
const uint8_t PHONE_2[4] = {0x08, 0xF0, 0xE0, 0xD0};
const uint8_t PLAIN_4[4] = {0x04, 0x01, 0x02, 0x03};
const uint8_t LONG_08[7] = {0x08, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06};
}

int main() {
  // Nothing suppressed before a refusal.
  { RefusedCardGuard g; assert(!g.shouldSuppress(UID_A, 7, 100)); }

  // Suppress, refresh on re-detection, expire after 2000 ms of absence.
  {
    RefusedCardGuard g;
    g.recordRefusal(UID_A, 7, 1000);
    assert(g.shouldSuppress(UID_A, 7, 1500));
    assert(g.shouldSuppress(UID_A, 7, 3499)); // refreshed at 1500: 1999 ms since
    assert(g.shouldSuppress(UID_A, 7, 5000)); // refreshed at 3499... 1501 ms since
    assert(!g.shouldSuppress(UID_A, 7, 7000)); // exactly 2000 ms since 5000
    assert(!g.shouldSuppress(UID_A, 7, 7001)); // released for good
  }
  {
    RefusedCardGuard g;
    g.recordRefusal(UID_A, 7, 0);
    assert(g.shouldSuppress(UID_A, 7, 1999));
    assert(!g.shouldSuppress(UID_A, 7, 3999));
  }

  // millis() wrap-around.
  {
    RefusedCardGuard g;
    g.recordRefusal(UID_A, 7, 0xFFFFFF00u);
    assert(g.shouldSuppress(UID_A, 7, 0x00000100u)); // 512 ms later across the wrap
    assert(!g.shouldSuppress(UID_A, 7, 0x00000100u + 2000u));
  }

  // The 2000 ms window is measured across the wrap too (no refresh in between).
  {
    RefusedCardGuard g;
    g.recordRefusal(UID_A, 7, 0xFFFFFF00u);
    assert(g.shouldSuppress(UID_A, 7, 0xFFFFFF00u + 1999u)); // wraps to 0x6CF: 1999 ms since
  }
  {
    RefusedCardGuard g;
    g.recordRefusal(UID_A, 7, 0xFFFFFF00u);
    assert(!g.shouldSuppress(UID_A, 7, 0xFFFFFF00u + 2000u)); // exactly 2000 ms since, across the wrap
  }

  // Same leading bytes but another length is another identity, also when the extra byte is zero.
  {
    const uint8_t zeroTail[7] = {0x04, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x00};
    RefusedCardGuard g;
    g.recordRefusal(zeroTail, 7, 0);
    assert(!g.shouldSuppress(zeroTail, 6, 100));
    assert(g.shouldSuppress(zeroTail, 7, 200));
  }

  // Edge inputs: an empty UID and an over-long UID (clamped) do not crash; a verdict before any check does nothing.
  {
    const uint8_t longUid[16] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16};
    RefusedCardGuard g;
    assert(!g.shouldSuppress(longUid, 0, 0)); // inactive guard never suppresses
    g.recordRefusalOfChecked(0);
    assert(!g.shouldSuppress(longUid, 16, 1));
    g.recordRefusal(longUid, 0, 10);
    assert(g.shouldSuppress(longUid, 0, 20));
    assert(!g.shouldSuppress(longUid, 7, 30));
    g.recordRefusal(longUid, 16, 40);
    assert(g.shouldSuppress(longUid, 16, 50));
  }

  // A different identity is never suppressed and does not refresh the suppressed card.
  {
    RefusedCardGuard g;
    g.recordRefusal(UID_A, 7, 0);
    assert(!g.shouldSuppress(UID_B, 7, 1000));
    assert(!g.shouldSuppress(UID_A, 6, 1000)); // same bytes, other length
    assert(!g.shouldSuppress(UID_A, 7, 2000)); // only A's own detections count as "seen"
  }

  // Random UIDs starting 0x08 (4 bytes) share one identity; other shapes do not.
  {
    RefusedCardGuard g;
    g.recordRefusal(PHONE_1, 4, 0);
    assert(g.shouldSuppress(PHONE_2, 4, 100));
    assert(!g.shouldSuppress(LONG_08, 7, 200));
    assert(!g.shouldSuppress(PLAIN_4, 4, 300));
    g.recordRefusal(PLAIN_4, 4, 400);
    assert(!g.shouldSuppress(PHONE_1, 4, 500));
    assert(g.shouldSuppress(PLAIN_4, 4, 500));
  }

  // A new refusal replaces the old one; a success clears it.
  {
    RefusedCardGuard g;
    g.recordRefusal(UID_A, 7, 0);
    g.recordRefusal(UID_B, 7, 10);
    assert(!g.shouldSuppress(UID_A, 7, 20));
    assert(g.shouldSuppress(UID_B, 7, 30));
    g.clear();
    assert(!g.shouldSuppress(UID_B, 7, 40));
  }

  // The verdict is attributed to the card last sent to the server.
  {
    RefusedCardGuard g;
    g.recordRefusalOfChecked(0); // nothing sent yet: no effect
    assert(!g.shouldSuppress(UID_A, 7, 1));
    g.noteChecked(UID_A, 7);
    g.recordRefusalOfChecked(100);
    assert(g.shouldSuppress(UID_A, 7, 200));
    g.clear();
    g.recordRefusalOfChecked(300); // cleared on success: stale verdicts do nothing
    assert(!g.shouldSuppress(UID_A, 7, 400));
  }

  // Only the server's card verdicts count.
  assert(RefusedCardGuard::isCardVerdict("CARD_NOT_FOUND"));
  assert(RefusedCardGuard::isCardVerdict("CARD_NOT_ACTIVE"));
  assert(RefusedCardGuard::isCardVerdict("CARD_AUTHENTICATION_FAILED"));
  assert(RefusedCardGuard::isCardVerdict("CARD_NOT_SUPPORTED"));
  assert(!RefusedCardGuard::isCardVerdict("CARD_REMOVED"));
  assert(!RefusedCardGuard::isCardVerdict("BUSY"));
  assert(!RefusedCardGuard::isCardVerdict("TIMEOUT"));
  assert(!RefusedCardGuard::isCardVerdict(""));
  return 0;
}
