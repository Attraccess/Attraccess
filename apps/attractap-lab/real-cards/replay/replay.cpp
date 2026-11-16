// Replays the 1.7.x firmware card code (the code that shipped before the card checks moved to the
// server, see apps/attractap/firmware/tests/reference-recordings/record.sh) against the answers a
// REAL card gave to the server, with the server's random values scripted in. The APDUs this code
// sends are the reference sequence; compare.mjs checks them byte for byte against what the server
// sent. The card is a "replay chip": its n-th answer is the n-th captured answer.
//
//   replay <spec>        spec lines: kind desfire|ntag424 / op enroll|tap|reset / keyno N /
//                        key <hex> (tap: slot key; reset: old key) / newkey <hex> / rnd <hex> /
//                        rx <hex>|none (one per exchange, in order)
//   stdout: "tx <hex>" per exchange the firmware code made, then "result ok|refused",
//           "rnd_used N", "rx_used N", and "exhausted" if it wanted more answers than captured.
#include "pn532/internal.hpp"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

static std::deque<uint8_t> scriptedRandom;
static size_t randomUsed = 0;
uint32_t esp_random()
{
    if (scriptedRandom.empty()) { std::printf("exhausted random\n"); std::exit(0); }
    const uint8_t value = scriptedRandom.front();
    scriptedRandom.pop_front();
    ++randomUsed;
    return value;
}

static std::vector<std::vector<uint8_t>> answers; // empty vector = the card did not answer
static std::vector<bool> answered;
static size_t position = 0;
static bool exhausted = false;
static std::vector<uint8_t> pendingFrame;

static std::vector<uint8_t> fromHex(const std::string &text)
{
    std::vector<uint8_t> out;
    for (size_t i = 0; i + 1 < text.size(); i += 2) out.push_back(static_cast<uint8_t>(std::stoi(text.substr(i, 2), nullptr, 16)));
    return out;
}
static std::string hex(const uint8_t *data, size_t n)
{
    static const char digits[] = "0123456789abcdef";
    std::string out;
    for (size_t i = 0; i < n; ++i) { out += digits[data[i] >> 4]; out += digits[data[i] & 15]; }
    return out;
}

byte pn532ack[] = {0, 0, 0xFF, 0, 0xFF, 0};
byte pn532response_firmwarevers[] = {0, 0, 0xFF, 6, 0xFA, 0xD5, 3, 0x32, 1, 6, 7, 0xE8, 0};
byte pn532_packetbuffer[PN532_PACKBUFFSIZ];
namespace Pn532Driver { Pn532DebugPort serial; }

Adafruit_PN532::Adafruit_PN532(uint8_t) {}
bool Adafruit_PN532::sendCommandCheckAck(uint8_t *cmd, uint8_t cmdlen, uint16_t)
{
    if (cmdlen < 3 || cmd[0] != 0x40) return false;
    std::printf("tx %s\n", hex(cmd + 2, cmdlen - 2).c_str());
    if (position >= answers.size()) { exhausted = true; return false; }
    const bool ok = answered[position];
    const std::vector<uint8_t> answer = answers[position++];
    if (!ok) return false;
    const uint8_t length = static_cast<uint8_t>(answer.size() + 3);
    pendingFrame = {0x00, 0x00, 0xFF, length, static_cast<uint8_t>(0x100 - length), 0xD5, 0x41, 0x00};
    pendingFrame.insert(pendingFrame.end(), answer.begin(), answer.end());
    uint8_t sum = 0xD5 + 0x41;
    for (uint8_t b : answer) sum += b;
    pendingFrame.push_back(static_cast<uint8_t>(0x100 - sum));
    pendingFrame.push_back(0x00);
    return true;
}
void Adafruit_PN532::readdata(uint8_t *buffer, uint8_t n)
{
    for (uint8_t i = 0; i < n; ++i) buffer[i] = i < pendingFrame.size() ? pendingFrame[i] : 0;
}
bool Adafruit_PN532::waitready(uint16_t) { return true; }
bool Adafruit_PN532::isready() { return true; }
bool Adafruit_PN532::readack() { return true; }
void Adafruit_PN532::PrintHex(const byte *, const uint32_t) {}
void Adafruit_PN532::PrintHexChar(const byte *, const uint32_t) {}

// ---- the firmware's card flows (rfid.cpp NFC::authenticateInternal / changeKey / getAvailableKeyNo) ----
static const uint8_t AID_ATTRACCESS[3] = {0x55, 0xCE, 0xAC};
static uint8_t FACTORY[16] = {0};
static Adafruit_PN532 pn(0x24);
enum class Kind { Ntag424, Desfire };
static Kind kind;

static void detectCardType()
{
    memset(&pn.ntag424_VersionInfo, 0, sizeof(pn.ntag424_VersionInfo));
    pn.ntag424_GetVersion();
}
static bool selectAttraccessApp(bool createIfMissing)
{
    if (pn.desfire_SelectApplication(AID_ATTRACCESS)) return true;
    if (!createIfMissing) return false;
    if (!pn.desfire_CreateApplication(AID_ATTRACCESS, 0x0F, 0x86)) return false;
    return pn.desfire_SelectApplication(AID_ATTRACCESS);
}
static bool authenticateInternal(uint8_t keyNumber, uint8_t *key)
{
    if (kind == Kind::Desfire)
    {
        if (!selectAttraccessApp(false)) return false;
        return pn.ntag424_AuthenticateEV2First(key, keyNumber, 0x71);
    }
    return pn.ntag424_Authenticate(key, keyNumber, 0x71);
}
static bool getAvailableKeyNo(uint8_t *keyNo)
{
    if (kind == Kind::Desfire)
    {
        if (!selectAttraccessApp(true)) return false;
        for (uint8_t i = 1; i <= 5; i++)
        {
            uint8_t version = 0xFF;
            if (!pn.desfire_GetKeyVersion(i, &version)) return false;
            if (version == 0)
            {
                if (!pn.ntag424_AuthenticateEV2First(FACTORY, 0, 0x71)) return false;
                *keyNo = i;
                return true;
            }
        }
        return false;
    }
    for (uint8_t i = 1; i <= 5; i++)
        if (authenticateInternal(i, FACTORY)) { *keyNo = i; return true; }
    return false;
}
static bool changeKey(uint8_t keyNumber, uint8_t *master, uint8_t *oldKey, uint8_t *newKey, uint8_t version)
{
    if (!authenticateInternal(0, master)) return false;
    if (!pn.ntag424_ChangeKey(oldKey, newKey, keyNumber, version)) return false;
    return authenticateInternal(keyNumber, newKey);
}

int main(int argc, char **argv)
{
    if (argc < 2) { std::fprintf(stderr, "usage: replay <spec>\n"); return 2; }
    std::ifstream in(argv[1]);
    std::string line, op;
    std::vector<uint8_t> key, newKey;
    int keyNo = 1;
    while (std::getline(in, line))
    {
        std::istringstream words(line);
        std::string name, value;
        words >> name >> value;
        if (name == "kind") kind = value == "ntag424" ? Kind::Ntag424 : Kind::Desfire;
        else if (name == "op") op = value;
        else if (name == "keyno") keyNo = std::stoi(value);
        else if (name == "key") key = fromHex(value);
        else if (name == "newkey") newKey = fromHex(value);
        else if (name == "rnd") for (uint8_t b : fromHex(value)) scriptedRandom.push_back(b);
        else if (name == "rx") { answered.push_back(value != "none"); answers.push_back(value == "none" ? std::vector<uint8_t>() : fromHex(value)); }
    }
    bool ok = false;
    detectCardType();
    if (op == "enroll")
    {
        uint8_t slot = 0;
        if (getAvailableKeyNo(&slot))
        {
            std::vector<uint8_t> n = newKey;
            ok = changeKey(slot, FACTORY, FACTORY, n.data(), 1);
        }
    }
    else if (op == "tap")
    {
        std::vector<uint8_t> k = key;
        ok = authenticateInternal(static_cast<uint8_t>(keyNo), k.data());
    }
    else if (op == "reset")
    {
        std::vector<uint8_t> old = key;
        ok = changeKey(static_cast<uint8_t>(keyNo), FACTORY, old.data(), FACTORY, 0);
    }
    std::printf("result %s\nrnd_used %zu\nrx_used %zu\n%s", ok ? "ok" : "refused", randomUsed, position, exhausted ? "exhausted\n" : "");
}
