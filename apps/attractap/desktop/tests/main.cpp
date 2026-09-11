#include "api_endpoint.hpp"
#include "host_runtime.hpp"
#include "host_websocket.hpp"
#include "profile_store.hpp"
#include "settings/settings.hpp"
#include "virtual_nfc.hpp"
#include "utils.hpp"

#include <cassert>
#include <chrono>
#include <filesystem>
#include <sys/stat.h>
#include <thread>

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
    uint8_t availableKey = 0;
    int detected = 0;
    int removed = 0;
    uint8_t detectedCard = 0;
    nfcContract.setCardDetectionCallback([&](uint8_t *uid, uint8_t) { ++detected; detectedCard = uid[6]; });
    nfcContract.setCardRemovalCallback([&](uint32_t) { ++removed; });
    nfcContract.enableCardDetection();
    assert(!nfcContract.getAvailableKeyNo(nullptr, nullptr, &availableKey));
    nfc.setPresent(0, true);
    assert(detected == 1);
    assert(detectedCard == 1);
    auto inactiveReplacement = nfc.card(1);
    nfc.setCard(1, inactiveReplacement);
    assert(nfcContract.isCardPresent());
    assert(nfcContract.getAvailableKeyNo(nullptr, nullptr, &availableKey));
    nfc.setPresent(1, true);
    assert(removed == 1);
    assert(detected == 2);
    assert(detectedCard == 2);
    assert(nfcContract.getAvailableKeyNo(nullptr, nullptr, &availableKey));
    assert(availableKey == 1);
    assert(!nfcContract.authenticate(availableKey, const_cast<uint8_t *>(enrolledKey.data())));
    assert(nfcContract.changeKey(availableKey, nfcContract.getFactoryKey(), nfcContract.getFactoryKey(), const_cast<uint8_t *>(enrolledKey.data())));
    assert(nfcContract.authenticate(availableKey, const_cast<uint8_t *>(enrolledKey.data())));
    assert(nfc.card(1).keyVersions[availableKey] == 1);
    nfc.setFaults(true, false);
    assert(!nfc.authenticate(availableKey, const_cast<uint8_t *>(enrolledKey.data())));
    nfc.setFaults(false, true);
    assert(!nfc.changeKey(availableKey, nfc.getFactoryKey(), const_cast<uint8_t *>(enrolledKey.data()), nfc.getFactoryKey()));
    nfc.setFaults(false, false);
    nfc.setPresent(1, false);
    assert(!nfc.authenticate(availableKey, const_cast<uint8_t *>(enrolledKey.data())));

    nfcContract.disableCardDetection();
    nfc.setPresent(1, true);
    assert(detected == 2);
    nfcContract.enableCardDetection();
    nfcContract.loop();
    assert(detected == 3);
    nfcContract.resetCardPresence();
    nfcContract.loop();
    assert(detected == 4);

    VirtualNfc persisted(first);
    for (size_t index = 0; index < VirtualNfc::CardCount; ++index)
    {
        assert(!persisted.card(index).present);
        assert(persisted.card(index).uid[6] == index + 1);
    }
    assert(persisted.card(1).keys[availableKey] == enrolledKey);
    assert(persisted.card(0).keys[availableKey] == VirtualNfc::factoryKey());
    persisted.setPresent(1, true);
    persisted.resetKeySlot(availableKey);
    assert(persisted.authenticate(availableKey, persisted.getFactoryKey()));
    assert(persisted.card(1).keyVersions[availableKey] == 0);
    persisted.setKeyVersion(availableKey, 7);
    assert(persisted.card(1).keyVersions[availableKey] == 7);
    auto unknown = persisted.card(1);
    unknown.type = VirtualNfc::CardType::Unknown;
    persisted.setCard(1, unknown);
    assert(!persisted.authenticate(availableKey, persisted.getFactoryKey()));
    assert(!persisted.getAvailableKeyNo(nullptr, nullptr, &availableKey));
    persisted.clearCardData(1);
    assert(!persisted.isCardPresent());
    assert(persisted.card(1).type == VirtualNfc::CardType::Ntag424);
    assert(persisted.card(1).keyVersions[availableKey] == 0);
    assert(persisted.card(1).keys[availableKey] == VirtualNfc::factoryKey());

    VirtualNfc afterRestart(first);
    assert(!afterRestart.isCardPresent());
    assert(afterRestart.card(1).keys[availableKey] == VirtualNfc::factoryKey());

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
