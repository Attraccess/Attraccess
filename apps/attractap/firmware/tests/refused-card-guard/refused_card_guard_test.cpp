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

// The production sequence: the card is sent to the server, which refuses it.
void refuse(RefusedCardGuard &g, const uint8_t *uid, uint8_t length, uint32_t nowMs,
            const char *code = "CARD_NOT_FOUND") {
  g.noteChecked(uid, length, nowMs);
  g.recordVerdict(code, nowMs);
}
}

int main() {
  // Nothing suppressed before a refusal.
  { RefusedCardGuard g; assert(!g.shouldSuppress(UID_A, 7, 100)); }

  // Suppress, refresh on re-detection, expire after 2000 ms of absence.
  {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 1000);
    assert(g.shouldSuppress(UID_A, 7, 1500));
    assert(g.shouldSuppress(UID_A, 7, 3499)); // refreshed at 1500: 1999 ms since
    assert(g.shouldSuppress(UID_A, 7, 5000)); // refreshed at 3499... 1501 ms since
    assert(!g.shouldSuppress(UID_A, 7, 7000)); // exactly 2000 ms since 5000
    assert(!g.shouldSuppress(UID_A, 7, 7001)); // released for good
  }
  {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 0);
    assert(g.shouldSuppress(UID_A, 7, 1999));
    assert(!g.shouldSuppress(UID_A, 7, 3999));
  }

  // The refusal stored on another task just after the detecting task read the clock: still suppressed.
  {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 1001);
    assert(g.shouldSuppress(UID_A, 7, 1000));
    assert(g.shouldSuppress(UID_A, 7, 2999)); // refreshed at 1000
  }
  {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 5000);
    assert(!g.shouldSuppress(UID_A, 7, 4000)); // far "ahead" is no skew but a stale stamp: released
  }

  // millis() wrap-around.
  {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 0xFFFFFF00u);
    assert(g.shouldSuppress(UID_A, 7, 0x00000100u)); // 512 ms later across the wrap
    assert(!g.shouldSuppress(UID_A, 7, 0x00000100u + 2000u));
  }

  // The 2000 ms window is measured across the wrap too (no refresh in between).
  {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 0xFFFFFF00u);
    assert(g.shouldSuppress(UID_A, 7, 0xFFFFFF00u + 1999u)); // wraps to 0x6CF: 1999 ms since
  }
  {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 0xFFFFFF00u);
    assert(!g.shouldSuppress(UID_A, 7, 0xFFFFFF00u + 2000u)); // exactly 2000 ms since, across the wrap
  }

  // Same leading bytes but another length is another identity, also when the extra byte is zero.
  {
    const uint8_t zeroTail[7] = {0x04, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x00};
    RefusedCardGuard g;
    refuse(g, zeroTail, 7, 0);
    assert(!g.shouldSuppress(zeroTail, 6, 100));
    assert(g.shouldSuppress(zeroTail, 7, 200));
  }

  // Edge inputs: an empty UID and an over-long UID (clamped) do not crash; a verdict before any check does nothing.
  {
    const uint8_t longUid[16] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16};
    RefusedCardGuard g;
    assert(!g.shouldSuppress(longUid, 0, 0)); // inactive guard never suppresses
    g.recordVerdict("CARD_NOT_FOUND", 0);
    assert(!g.shouldSuppress(longUid, 16, 1));
    refuse(g, longUid, 0, 10);
    assert(g.shouldSuppress(longUid, 0, 20));
    assert(!g.shouldSuppress(longUid, 7, 30));
    refuse(g, longUid, 16, 40);
    assert(g.shouldSuppress(longUid, 16, 50));
  }

  // A different identity is never suppressed and does not refresh the suppressed card.
  {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 0);
    assert(!g.shouldSuppress(UID_B, 7, 1000));
    assert(!g.shouldSuppress(UID_A, 6, 1000)); // same bytes, other length
    assert(!g.shouldSuppress(UID_A, 7, 2000)); // only A's own detections count as "seen"
  }

  // Random UIDs starting 0x08 (4 bytes) share one identity; other shapes do not.
  {
    RefusedCardGuard g;
    refuse(g, PHONE_1, 4, 0);
    assert(g.shouldSuppress(PHONE_2, 4, 100));
    assert(!g.shouldSuppress(LONG_08, 7, 200));
    assert(!g.shouldSuppress(PLAIN_4, 4, 300));
    refuse(g, PLAIN_4, 4, 400);
    assert(!g.shouldSuppress(PHONE_1, 4, 500));
    assert(g.shouldSuppress(PLAIN_4, 4, 500));
  }

  // A new refusal replaces the old one; a success clears it.
  {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 0);
    refuse(g, UID_B, 7, 10);
    assert(!g.shouldSuppress(UID_A, 7, 20));
    assert(g.shouldSuppress(UID_B, 7, 30));
    g.clear();
    assert(!g.shouldSuppress(UID_B, 7, 40));
  }

  // The verdict is attributed to the card last sent to the server, once.
  {
    RefusedCardGuard g;
    g.recordVerdict("CARD_NOT_FOUND", 0); // nothing sent yet: no effect
    assert(!g.shouldSuppress(UID_A, 7, 1));
    g.noteChecked(UID_A, 7, 50);
    g.recordVerdict("CARD_NOT_FOUND", 100);
    assert(g.shouldSuppress(UID_A, 7, 200));
    assert(!g.shouldSuppress(UID_A, 7, 2200)); // expired
    g.recordVerdict("CARD_NOT_FOUND", 2300); // a late duplicate of the same answer re-arms nothing
    assert(!g.shouldSuppress(UID_A, 7, 2400));
    g.noteChecked(UID_A, 7, 2500);
    g.clear();
    g.recordVerdict("CARD_NOT_FOUND", 2600); // cleared on success: stale verdicts do nothing
    assert(!g.shouldSuppress(UID_A, 7, 2700));
  }

  // A transient answer uses the note up without suppressing; a later stale verdict then blames nobody.
  {
    RefusedCardGuard g;
    g.noteChecked(UID_A, 7, 0);
    g.recordVerdict("CARD_REMOVED", 100);
    assert(!g.shouldSuppress(UID_A, 7, 200));
    g.recordVerdict("CARD_NOT_FOUND", 300);
    assert(!g.shouldSuppress(UID_A, 7, 400));
  }

  // A send that failed is forgotten: no answer can be attributed to it.
  {
    RefusedCardGuard g;
    g.noteChecked(UID_A, 7, 0);
    g.forgetChecked();
    g.recordVerdict("CARD_NOT_FOUND", 100);
    assert(!g.shouldSuppress(UID_A, 7, 200));
    assert(!g.awaitingVerdict(UID_A, 7, 200));
  }

  // Waiting for a verdict: only the card sent, only until its answer or for at most 2000 ms.
  {
    RefusedCardGuard g;
    assert(!g.awaitingVerdict(UID_A, 7, 0)); // nothing sent
    g.noteChecked(UID_A, 7, 1000);
    assert(g.awaitingVerdict(UID_A, 7, 1300));
    assert(g.awaitingVerdict(UID_A, 7, 2999));
    assert(!g.awaitingVerdict(UID_B, 7, 1300)); // another card is sent at once
    assert(!g.awaitingVerdict(UID_A, 7, 3000)); // no answer within 2000 ms: sent again
    g.noteChecked(PHONE_1, 4, 4000);
    assert(g.awaitingVerdict(PHONE_2, 4, 4100)); // random UIDs are one identity here too
    g.recordVerdict("BUSY", 4200);
    assert(!g.awaitingVerdict(PHONE_1, 4, 4300)); // answered: a transient error allows a retry at once
    g.noteChecked(UID_A, 7, 5000);
    g.clear();
    assert(!g.awaitingVerdict(UID_A, 7, 5100)); // signed in
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
  for (const char *code : {"CARD_NOT_ACTIVE", "CARD_AUTHENTICATION_FAILED", "CARD_NOT_SUPPORTED"}) {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 0, code);
    assert(g.shouldSuppress(UID_A, 7, 100));
  }
  for (const char *code : {"CARD_REMOVED", "BUSY", "TIMEOUT", "UPDATE_NEEDED", "INTERNAL_ERROR"}) {
    RefusedCardGuard g;
    refuse(g, UID_A, 7, 0, code);
    assert(!g.shouldSuppress(UID_A, 7, 100));
  }
  return 0;
}
