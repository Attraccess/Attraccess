// Regression: the relay sent InDataExchange with target 0, so the PN532 refused every APDU (status 0x27).
// Also: InDataExchange must reject frames it cannot hold instead of reading past the packet buffer.
#include "pn532/internal.hpp"
#include <cassert>
#include <cstdio>
#include <vector>
byte pn532ack[] = {0, 0, 0xFF, 0, 0xFF, 0};
byte pn532response_firmwarevers[] = {0, 0, 0xFF, 6, 0xFA, 0xD5, 3, 0x32, 1, 6, 7, 0xE8, 0};
byte pn532_packetbuffer[PN532_PACKBUFFSIZ];
namespace Pn532Driver { Pn532DebugPort serial; }
static std::vector<uint8_t> frame; static uint8_t lastTarget = 0xEE;
// The PN532's answer to the next InDataExchange.
static std::vector<uint8_t> exchangeReply = {0,0,0xFF,3,0xFD,0xD5,0x41,0x00,0xBD,0};
Adafruit_PN532::Adafruit_PN532(uint8_t) {}
void Adafruit_PN532::readdata(uint8_t *b, uint8_t n) { for (uint8_t i = 0; i < n; ++i) b[i] = i < frame.size() ? frame[i] : 0; }
bool Adafruit_PN532::waitready(uint16_t) { return true; }
bool Adafruit_PN532::isready() { return true; }
bool Adafruit_PN532::readack() { return true; }
static uint8_t lastCommand = 0; static uint8_t releasedTarget = 0xEE; static uint8_t releaseStatus = 0;
void Adafruit_PN532::writecommand(uint8_t *cmd, uint8_t) {
  lastCommand = cmd[0];
  if (cmd[0] == 0x40) { lastTarget = cmd[1]; frame = exchangeReply; }
  if (cmd[0] == 0x52) { releasedTarget = cmd[1]; frame = {0, 0, 0xFF, 3, 0xFD, 0xD5, 0x53, releaseStatus, 0, 0}; }
}
void Adafruit_PN532::PrintHex(const byte *, const uint32_t) {}
void Adafruit_PN532::PrintHexChar(const byte *, const uint32_t) {}

// An InDataExchange answer frame whose LEN byte is `len`, followed by `dataBytes` card bytes.
static std::vector<uint8_t> answerFrame(uint8_t len, size_t dataBytes) {
  std::vector<uint8_t> reply = {0, 0, 0xFF, len, static_cast<uint8_t>(~len + 1), 0xD5, 0x41, 0x00};
  for (size_t i = 0; i < dataBytes; ++i) reply.push_back(static_cast<uint8_t>(0xA0 + i));
  return reply;
}

int main() {
  Adafruit_PN532 pn(0x24);
  // InListPassiveTarget answer: one target, target number 1, ATQA/SAK, 7-byte UID.
  frame = {0,0,0xFF,0x0F,0xF1,0xD5,0x4B,1,1,0x00,0x44,0x20,7,0x04,1,2,3,4,5,6,0,0};
  uint8_t uid[7]; uint8_t len = 0;
  assert(pn.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 100));
  // The card's SELECT answer is kept: the server tells UID-only cards from secure ones by the SAK.
  if (pn.lastSak() != 0x20 || pn.lastAtqa() != 0x0044) { std::puts("SAK/ATQA of the inlisted card not kept"); return 1; }
  frame = {0,0,0xFF,0x0C,0xF4,0xD5,0x4B,1,1,0x00,0x04,0x08,4,0x1A,0x2B,0x3C,0x4D,0,0};
  assert(pn.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 100));
  if (len != 4 || pn.lastSak() != 0x08 || pn.lastAtqa() != 0x0004) { std::puts("MIFARE Classic SAK/ATQA wrong"); return 1; }
  // InRelease addresses the target and reports whether the PN532 confirmed it.
  if (!pn.inRelease() || lastCommand != 0x52 || releasedTarget != 0) { std::puts("InRelease not sent for all targets"); return 1; }
  releaseStatus = 0x01;
  if (pn.inRelease()) { std::puts("InRelease accepted an error status"); return 1; }
  releaseStatus = 0;
  // A 10-byte UID does not fit the caller's 7-byte buffer: the card is not reported, nothing is written past it.
  uint8_t guarded[10] = {0, 0, 0, 0, 0, 0, 0, 0xCC, 0, 0}; // room for the overflow, so a regression fails cleanly
  frame = {0,0,0xFF,0x12,0xEE,0xD5,0x4B,1,1,0x00,0x44,0x20,10,1,2,3,4,5,6,7,8,9,10,0,0};
  if (pn.readPassiveTargetID(PN532_MIFARE_ISO14443A, guarded, &len, 100) || guarded[7] != 0xCC) {
    std::puts("a 10-byte UID was copied into a 7-byte buffer"); return 1;
  }
  frame = {0,0,0xFF,0x0F,0xF1,0xD5,0x4B,1,1,0x00,0x44,0x20,7,0x04,1,2,3,4,5,6,0,0};
  assert(pn.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 100));
  uint8_t apdu[] = {0x90, 0x5A, 0, 0, 3, 0, 0, 0, 0}, answer[64]; uint8_t answerLen = 16;
  pn.inDataExchange(apdu, sizeof(apdu), answer, &answerLen);
  if (lastTarget != 1) { std::printf("InDataExchange addressed target %u, the PN532 inlisted target 1\n", lastTarget); return 1; }

  // LEN below 3 (TFI, response code, status) is corrupt: no wrap-around into a 250-byte copy.
  exchangeReply = answerFrame(2, 0);
  answerLen = sizeof(answer);
  if (pn.inDataExchange(apdu, sizeof(apdu), answer, &answerLen)) { std::puts("accepted a frame with LEN 2"); return 1; }

  // The largest answer the 64-byte packet buffer holds (data from byte 8) arrives complete.
  exchangeReply = answerFrame(3 + 56, 56);
  answerLen = sizeof(answer);
  if (!pn.inDataExchange(apdu, sizeof(apdu), answer, &answerLen) || answerLen != 56 || answer[55] != 0xA0 + 55) {
    std::puts("a 56-byte answer did not come back complete"); return 1;
  }

  // One byte more does not fit the packet buffer: rejected, nothing copied from beyond it.
  exchangeReply = answerFrame(3 + 57, 57);
  answerLen = sizeof(answer);
  if (pn.inDataExchange(apdu, sizeof(apdu), answer, &answerLen)) { std::puts("accepted a 57-byte answer"); return 1; }

  // An answer larger than the caller's buffer is rejected, not cut off.
  exchangeReply = answerFrame(3 + 10, 10);
  answerLen = 4;
  if (pn.inDataExchange(apdu, sizeof(apdu), answer, &answerLen)) { std::puts("truncated an answer"); return 1; }
  return 0;
}
