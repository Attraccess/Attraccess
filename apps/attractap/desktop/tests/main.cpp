#include "api_endpoint.hpp"
#include "host_runtime.hpp"
#include "host_websocket.hpp"
#include "profile_store.hpp"
#include "settings/settings.hpp"
#include "state/state.hpp"
#include "virtual_rfid.hpp"
#include "utils.hpp"

#include <cassert>
#include <chrono>
#include <filesystem>
#include <sys/stat.h>
#include <thread>
#include <vector>

int main()
{
    const auto root = std::filesystem::temp_directory_path() / "attractap-desktop-profile-tests";
    std::filesystem::remove_all(root);

    ProfileStore first(" HTTPS://Example.test/ ", 42, root);
    first.put("api.key", "secret");
    assert(first.get("api.key") == "secret");
    const auto firstPath = first.path();
    struct stat fileStatus {};
    assert(stat(firstPath.c_str(), &fileStatus) == 0);
    assert((fileStatus.st_mode & 077) == 0);

    ProfileStore sameProfile("https://example.test", 42, root);
    assert(sameProfile.path() == firstPath);
    assert(sameProfile.get("api.key") == "secret");
    ProfileStore otherReader("https://example.test", 43, root);
    assert(otherReader.get("api.key").empty());
    ProfileStore caseDistinctPath("https://example.test/TenantA", 42, root);
    ProfileStore differentCasePath("https://example.test/tenanta", 42, root);
    assert(caseDistinctPath.path() != differentCasePath.path());
    assert(sameProfile.remove("api.key"));
    assert(!sameProfile.remove("api.key"));

    VirtualNfc nfc(first);
    INfc &nfcContract = nfc;
    const VirtualNfc::Key enrolledKey{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16};
    // The reader relays whole APDUs; the card answers them like the chip does.
    const auto exchange = [](INfc &reader, std::vector<uint8_t> command) {
        uint8_t answer[64];
        uint8_t length = sizeof(answer);
        if (!reader.transceive(command.data(), static_cast<uint8_t>(command.size()), answer, &length))
            return std::vector<uint8_t>{};
        return std::vector<uint8_t>(answer, answer + length);
    };
    const std::vector<uint8_t> ntagSelect{0x00, 0xA4, 0x04, 0x00, 0x07, 0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00};
    const std::vector<uint8_t> desfireSelect{0x90, 0x5A, 0x00, 0x00, 0x03, 0x55, 0xCE, 0xAC, 0x00};
    const std::vector<uint8_t> desfireCreate{0x90, 0xCA, 0x00, 0x00, 0x05, 0x55, 0xCE, 0xAC, 0x0F, 0x86, 0x00};
    const std::vector<uint8_t> getVersion{0x90, 0x60, 0x00, 0x00, 0x00};
    const std::vector<uint8_t> nextFrame{0x90, 0xAF, 0x00, 0x00, 0x00};
    const std::vector<uint8_t> keyVersionOfSlot1{0x90, 0x64, 0x00, 0x00, 0x01, 0x01, 0x00};
    const std::vector<uint8_t> authenticateSlot1{0x90, 0x71, 0x00, 0x00, 0x05, 0x01, 0x03, 0x00, 0x00, 0x00, 0x00};
    int detected = 0;
    int removed = 0;
    uint8_t detectedCard = 0;
    nfcContract.setCardDetectionCallback([&](uint8_t *uid, uint8_t) { ++detected; detectedCard = uid[6]; });
    nfcContract.setCardRemovalCallback([&](uint32_t) { ++removed; });
    nfcContract.enableCardDetection();
    assert(exchange(nfcContract, getVersion).empty()); // no card, no answer
    nfc.setPresent(0, true);
    assert(detected == 1);
    assert(detectedCard == 1);
    nfc.setPresent(1, true);
    assert(removed == 1);
    assert(detected == 2);
    assert(detectedCard == 2);

    // NTAG 424: GetVersion over three frames, then the ISO select, then an authentication challenge.
    assert((exchange(nfcContract, getVersion) == std::vector<uint8_t>{0x04, 0x04, 0x02, 0x30, 0x00, 0x11, 0x05, 0x91, 0xAF}));
    assert(exchange(nfcContract, nextFrame).size() == 9 && exchange(nfcContract, nextFrame).back() == 0x00);
    assert((exchange(nfcContract, ntagSelect) == std::vector<uint8_t>{0x90, 0x00}));
    auto challenge = exchange(nfcContract, authenticateSlot1);
    assert(challenge.size() == 18 && challenge[16] == 0x91 && challenge[17] == 0xAF);
    // A second part with a made-up proof is refused and ends the attempt.
    std::vector<uint8_t> bogus{0x90, 0xAF, 0x00, 0x00, 0x20};
    bogus.insert(bogus.end(), 32, 0x11);
    bogus.push_back(0x00);
    assert((exchange(nfcContract, bogus) == std::vector<uint8_t>{0x91, 0xAE}));
    assert(!nfc.card(1).applicationExists || nfc.card(1).type == VirtualNfc::CardType::Ntag424);
    assert(exchange(nfcContract, std::vector<uint8_t>(63, 0x00)).empty()); // does not fit the PN532

    // The card refuses to authenticate when the fault is set.
    nfc.setFaults(true, false);
    assert((exchange(nfcContract, authenticateSlot1) == std::vector<uint8_t>{0x91, 0x40}));
    nfc.setFaults(false, false);

    // DESFire: the Attraccess application exists only after the server created it.
    auto desfire = nfc.card(1);
    desfire.type = VirtualNfc::CardType::Desfire;
    nfc.setCard(1, desfire);
    assert((exchange(nfcContract, desfireSelect) == std::vector<uint8_t>{0x91, 0xA0}));
    assert((exchange(nfcContract, desfireCreate) == std::vector<uint8_t>{0x91, 0x00}));
    assert((exchange(nfcContract, desfireSelect) == std::vector<uint8_t>{0x91, 0x00}));
    assert((exchange(nfcContract, keyVersionOfSlot1) == std::vector<uint8_t>{0x00, 0x91, 0x00}));
    assert((exchange(nfcContract, desfireCreate) == std::vector<uint8_t>{0x91, 0xDE}));
    assert(nfc.card(1).applicationExists);

    nfc.setPresent(1, false);
    assert(exchange(nfcContract, desfireSelect).empty()); // the card left the field

    nfcContract.disableCardDetection();
    const int detectedBefore = detected;
    nfc.setPresent(1, true);
    assert(detected == detectedBefore);
    nfcContract.enableCardDetection();
    nfcContract.loop();
    assert(detected == detectedBefore + 1);
    nfcContract.resetCardPresence();
    nfcContract.loop();
    assert(detected == detectedBefore + 2);

    // OTA suspension survives the normal reconnect path enabling detection.
    const int detectionsBeforeOta = detected;
    const int removalsBeforeOta = removed;
    assert(nfcContract.suspend());
    assert(nfcContract.suspend());
    nfc.setPresent(1, false);
    nfcContract.enableCardDetection();
    nfc.setPresent(0, true);
    nfcContract.loop();
    assert(detected == detectionsBeforeOta);
    assert(removed == removalsBeforeOta);
    assert(!nfcContract.isCardPresent());
    assert(exchange(nfcContract, ntagSelect).empty());
    assert(nfc.card(0).keys[1] == VirtualNfc::factoryKey());

    // Keys the server wrote survive a restart; the simulator itself never writes them.
    auto enrolledCard = nfc.card(1);
    enrolledCard.keys[1] = enrolledKey;
    enrolledCard.keyVersions[1] = 1;
    nfc.setCard(1, enrolledCard);
    VirtualNfc persisted(first);
    for (size_t index = 0; index < VirtualNfc::CardCount; ++index)
    {
        assert(!persisted.card(index).present);
        assert(persisted.card(index).uid[6] == index + 1);
    }
    assert(persisted.card(1).keys[1] == enrolledKey);
    assert(persisted.card(1).applicationExists); // follows from the key version
    assert(persisted.card(0).keys[1] == VirtualNfc::factoryKey());
    persisted.setPresent(1, true);
    persisted.setRemoveOnWrite(true);
    assert(!persisted.removedOnWrite());
    persisted.setRemoveOnWrite(false);
    persisted.resetKeySlot(1);
    assert(persisted.card(1).keys[1] == VirtualNfc::factoryKey());
    assert(persisted.card(1).keyVersions[1] == 0);
    persisted.setKeyVersion(1, 7);
    assert(persisted.card(1).keyVersions[1] == 7);
    auto unknown = persisted.card(1);
    unknown.type = VirtualNfc::CardType::Unknown;
    persisted.setCard(1, unknown);
    assert(exchange(persisted, getVersion).empty());
    persisted.clearCardData(1);
    assert(!persisted.isCardPresent());
    assert(persisted.card(1).type == VirtualNfc::CardType::Ntag424);
    assert(persisted.card(1).keyVersions[1] == 0);
    assert(persisted.card(1).keys[1] == VirtualNfc::factoryKey());

    VirtualNfc afterRestart(first);
    assert(!afterRestart.isCardPresent());
    assert(afterRestart.card(1).keys[1] == VirtualNfc::factoryKey());

    HostRuntime runtime;
    int value = 0;
    runtime.post([&] { value = 1; runtime.post([&] { value = 2; }); });
    runtime.dispatch();
    assert(value == 1);
    runtime.dispatch();
    assert(value == 2);
    const auto before = runtime.millis();
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
    assert(runtime.millis() >= before);

    assert(HostWebsocket::readerUrl("http://localhost:3001") == "ws://localhost:3001/api/attractap/websocket");
    assert(HostWebsocket::readerUrl("https://reader.example.test/") == "wss://reader.example.test/api/attractap/websocket");
    assert(HostWebsocket::readerUrl("wss://reader.example.test/ignored") == "wss://reader.example.test/api/attractap/websocket");
    const auto rejectsInvalidEndpoint = [](const std::string &endpoint)
    {
        try
        {
            static_cast<void>(HostWebsocket::readerUrl(endpoint));
            return false;
        }
        catch (const std::invalid_argument &)
        {
            return true;
        }
    };
    assert(rejectsInvalidEndpoint("reader.example.test"));
    assert(rejectsInvalidEndpoint("http://"));

    const auto websocketEndpoint = parseApiEndpoint("wss://localhost");
    assert(websocketEndpoint.hostname == "localhost");
    assert(websocketEndpoint.port == 443);
    assert(websocketEndpoint.useSSL);
    const auto ipv6Endpoint = parseApiEndpoint("https://[::1]:8443/path");
    assert(ipv6Endpoint.hostname == "[::1]");
    assert(ipv6Endpoint.port == 8443);
    assert(ipv6Endpoint.useSSL);
    const auto rejectsInvalidApiEndpoint = [](const std::string &endpoint)
    {
        try
        {
            static_cast<void>(parseApiEndpoint(endpoint));
            return false;
        }
        catch (const std::invalid_argument &)
        {
            return true;
        }
    };
    assert(rejectsInvalidApiEndpoint("https://[::1]:0"));
    assert(rejectsInvalidApiEndpoint("https://localhost:"));
    assert(rejectsInvalidApiEndpoint("https://::1"));

    KVStore::setHostProfile(&first);
    Settings::setup();
    assert(State::getActiveLanguage() == "en");
    // A cold start reloads the last API default, never a cardholder override.
    KVStore persistedSettings;
    persistedSettings.begin("settings", false);
    persistedSettings.putString("api.language", "de");
    persistedSettings.end();
    State::setUserLanguage(true, "en");
    State::setApiState(false, "");
    ProfileStore rebooted("https://example.test", 42, root);
    KVStore::setHostProfile(&rebooted);
    Settings::setup();
    assert(State::getActiveLanguage() == "de");
    assert(!State::getApiState().userAuthenticated);
    persistedSettings.begin("settings", false);
    persistedSettings.putString("api.language", "unsupported");
    persistedSettings.end();
    Settings::setup();
    assert(State::getActiveLanguage() == "en");
    KVStore::setHostProfile(&otherReader);
    Settings::setup();
    assert(State::getActiveLanguage() == "en");
    KVStore::setHostProfile(&first);
    Settings::setup();
    Settings::saveAttraccessApiConfig("localhost", 3001, false);
    HostWebsocket websocket(runtime);
    assert(websocket.send("outbound"));
    assert(!websocket.send(nullptr, 0));
    bool disconnected = false;
    websocket.setStateCallback([&disconnected](HostWebsocket::State state) {
        disconnected = state == HostWebsocket::State::Disconnected;
    });
    websocket.start();
    websocket.stop();
    runtime.dispatch();
    assert(disconnected);

    constexpr time_t timestamp = 1767323045;
    assert(timeToTimeString(timestamp, 120) == "02.01. 05:04");
    assert(parseIso8601ToTimeT("2026-01-02T03:04:05Z") == timestamp);
    assert(parseIso8601ToTimeT("2026-01-02T05:04:05+02:00") == timestamp);
    assert(parseIso8601ToTimeT("2026-01-01T22:04:05-05:00") == timestamp);
    assert(parseIso8601ToTimeT("not a timestamp") == static_cast<time_t>(-1));

    std::filesystem::remove_all(root);
}
