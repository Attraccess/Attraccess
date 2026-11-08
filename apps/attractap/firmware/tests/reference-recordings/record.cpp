// Records the APDUs the firmware's own card code (ntag424_*/desfire_* of firmware 1.7.x, the code
// that shipped before the card checks moved to the server) sends for a tap, an enrollment and a
// reset. The card answers come from the simulator's chip model; every random value is scripted.
// The API's card-crypto test replays these recordings and has to produce the same bytes.
#include "pn532/internal.hpp"
#include "virtual_card_chip.hpp"

#include <cstdio>
#include <deque>
#include <functional>
#include <string>
#include <vector>

// ---- scripted randomness -----------------------------------------------------------------------
static std::deque<uint8_t> scriptedRandom;
static std::vector<uint8_t> consumedRandom;
uint32_t esp_random()
{
    if (scriptedRandom.empty()) { std::fprintf(stderr, "firmware asked for more random bytes than scripted\n"); std::exit(2); }
    const uint8_t value = scriptedRandom.front();
    scriptedRandom.pop_front();
    consumedRandom.push_back(value);
    return value;
}

// ---- the card, behind a fake PN532 -------------------------------------------------------------
struct Exchange { std::vector<uint8_t> tx, rx; };
static VirtualCardChip chip([](uint8_t *out, size_t n) {
    static uint8_t counter = 0xA0;
    for (size_t i = 0; i < n; ++i) out[i] = counter++;
});
static VirtualCardChip::Memory memory;
static std::vector<Exchange> exchanges;
static std::vector<uint8_t> pendingFrame;

byte pn532ack[] = {0, 0, 0xFF, 0, 0xFF, 0};
byte pn532response_firmwarevers[] = {0, 0, 0xFF, 6, 0xFA, 0xD5, 3, 0x32, 1, 6, 7, 0xE8, 0};
byte pn532_packetbuffer[PN532_PACKBUFFSIZ];
namespace Pn532Driver { Pn532DebugPort serial; }

Adafruit_PN532::Adafruit_PN532(uint8_t) {}
bool Adafruit_PN532::sendCommandCheckAck(uint8_t *cmd, uint8_t cmdlen, uint16_t)
{
    if (cmdlen < 3 || cmd[0] != 0x40) return false;
    const auto answer = chip.transceive(memory, cmd + 2, cmdlen - 2);
    Exchange exchange{std::vector<uint8_t>(cmd + 2, cmd + cmdlen), {}};
    if (!answer) { exchanges.push_back(exchange); return false; }
    exchange.rx = *answer;
    exchanges.push_back(exchange);
    // D5 41 <status> <card data and SW>, in a PN532 information frame.
    const uint8_t length = static_cast<uint8_t>(answer->size() + 3);
    pendingFrame = {0x00, 0x00, 0xFF, length, static_cast<uint8_t>(0x100 - length), 0xD5, 0x41, 0x00};
    pendingFrame.insert(pendingFrame.end(), answer->begin(), answer->end());
    uint8_t sum = 0xD5 + 0x41;
    for (uint8_t b : *answer) sum += b;
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

// ---- output -------------------------------------------------------------------------------------
static std::string hex(const std::vector<uint8_t> &bytes)
{
    static const char digits[] = "0123456789abcdef";
    std::string out;
    for (uint8_t b : bytes) { out += digits[b >> 4]; out += digits[b & 15]; }
    return out;
}

struct Scenario
{
    const char *name;
    Kind kind;
    // The card as it is before the scenario: slot 1 holds this key (all zero = factory).
    std::vector<uint8_t> storedKey;
    std::function<bool()> run;
};

static std::vector<uint8_t> key16(uint8_t base)
{
    std::vector<uint8_t> key(16);
    for (int i = 0; i < 16; ++i) key[i] = static_cast<uint8_t>(base + i);
    return key;
}

int main(int argc, char **argv)
{
    const std::string outputDirectory = argc > 1 ? argv[1] : ".";
    const std::vector<uint8_t> newKey = key16(0x40);
    const std::vector<uint8_t> storedKey = key16(0x60);
    const std::vector<uint8_t> wrongKey = key16(0x70);

    std::vector<Scenario> scenarios;
    for (Kind k : {Kind::Ntag424, Kind::Desfire})
    {
        const std::string prefix = k == Kind::Ntag424 ? "ntag424" : "desfire";
        scenarios.push_back({strdup((prefix + "-enroll").c_str()), k, {}, [&, k]() {
            detectCardType();
            uint8_t keyNo = 0;
            if (!getAvailableKeyNo(&keyNo)) return false;
            std::vector<uint8_t> n = newKey;
            return changeKey(keyNo, FACTORY, FACTORY, n.data(), 1);
        }});
        scenarios.push_back({strdup((prefix + "-tap").c_str()), k, storedKey, [&]() {
            detectCardType();
            std::vector<uint8_t> key = storedKey;
            return authenticateInternal(1, key.data());
        }});
        scenarios.push_back({strdup((prefix + "-tap-wrong-key").c_str()), k, storedKey, [&]() {
            detectCardType();
            std::vector<uint8_t> key = wrongKey;
            return authenticateInternal(1, key.data());
        }});
        scenarios.push_back({strdup((prefix + "-reset").c_str()), k, storedKey, [&]() {
            detectCardType();
            std::vector<uint8_t> old = storedKey;
            return changeKey(1, FACTORY, old.data(), FACTORY, 0);
        }});
    }

    for (auto &scenario : scenarios)
    {
        kind = scenario.kind;
        chip.reset();
        memory = {};
        memory.kind = kind == Kind::Ntag424 ? VirtualCardChip::Kind::Ntag424 : VirtualCardChip::Kind::Desfire;
        const bool enrolled = !scenario.storedKey.empty();
        if (enrolled)
        {
            memory.applicationExists = true;
            std::copy(scenario.storedKey.begin(), scenario.storedKey.end(), memory.keys[1].begin());
            memory.keyVersions[1] = 1;
        }
        exchanges.clear();
        consumedRandom.clear();
        scriptedRandom.clear();
        for (int i = 0; i < 160; ++i) scriptedRandom.push_back(static_cast<uint8_t>(0x10 + i)); // RndA values

        const bool ok = scenario.run();

        std::string json = "{\n  \"name\": \"" + std::string(scenario.name) + "\",\n";
        json += std::string("  \"cardKind\": \"") + (kind == Kind::Ntag424 ? "ntag424" : "desfire") + "\",\n";
        json += "  \"operation\": \"" + std::string(scenario.name).substr(std::string(scenario.name).find('-') + 1) + "\",\n";
        json += std::string("  \"success\": ") + (ok ? "true" : "false") + ",\n";
        json += "  \"storedKey\": \"" + (enrolled ? hex(scenario.storedKey) : std::string()) + "\",\n";
        json += "  \"newKey\": \"" + hex(newKey) + "\",\n";
        json += "  \"wrongKey\": \"" + hex(wrongKey) + "\",\n";
        json += "  \"randomBytesConsumed\": \"" + hex(consumedRandom) + "\",\n";
        json += "  \"exchanges\": [\n";
        for (size_t i = 0; i < exchanges.size(); ++i)
            json += "    { \"tx\": \"" + hex(exchanges[i].tx) + "\", \"rx\": \"" + hex(exchanges[i].rx) + "\" }" + (i + 1 < exchanges.size() ? ",\n" : "\n");
        json += "  ]\n}\n";
        const std::string path = outputDirectory + "/" + scenario.name + ".json";
        FILE *file = fopen(path.c_str(), "w");
        fputs(json.c_str(), file);
        fclose(file);
        std::printf("%s: %s, %zu exchanges, %zu random bytes\n", scenario.name, ok ? "ok" : "refused", exchanges.size(), consumedRandom.size());
    }
}
