#include "host_runtime.hpp"
#include "host_websocket.hpp"
#include "profile_store.hpp"
#include "virtual_nfc.hpp"

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
    const VirtualNfc::Key enrolledKey{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16};
    uint8_t availableKey = 0;
    int detected = 0;
    int removed = 0;
    nfc.setCardDetectedCallback([&](const uint8_t *, uint8_t) { ++detected; });
    nfc.setCardRemovedCallback([&] { ++removed; });
    assert(!nfc.getAvailableKeyNo(availableKey));
    nfc.setPresent(true);
    assert(detected == 1);
    auto replacement = nfc.card();
    replacement.uid[6] = 2;
    nfc.setCard(replacement);
    assert(removed == 1);
    assert(detected == 2);
    assert(nfc.getAvailableKeyNo(availableKey));
    assert(availableKey == 1);
    assert(!nfc.authenticate(availableKey, enrolledKey));
    assert(nfc.changeKey(availableKey, VirtualNfc::factoryKey(), VirtualNfc::factoryKey(), enrolledKey));
    assert(nfc.authenticate(availableKey, enrolledKey));
    assert(nfc.card().keyVersions[availableKey] == 1);
    nfc.setFaults(true, false);
    assert(!nfc.authenticate(availableKey, enrolledKey));
    nfc.setFaults(false, true);
    assert(!nfc.changeKey(availableKey, VirtualNfc::factoryKey(), enrolledKey, VirtualNfc::factoryKey()));
    nfc.setFaults(false, false);
    nfc.setPresent(false);
    assert(!nfc.authenticate(availableKey, enrolledKey));

    VirtualNfc persisted(first);
    assert(!persisted.card().present);
    assert(persisted.card().keys[availableKey] == enrolledKey);
    persisted.setPresent(true);
    persisted.resetKeySlot(availableKey);
    assert(persisted.authenticate(availableKey, VirtualNfc::factoryKey()));
    assert(persisted.card().keyVersions[availableKey] == 0);
    persisted.setKeyVersion(availableKey, 7);
    assert(persisted.card().keyVersions[availableKey] == 7);
    auto unknown = persisted.card();
    unknown.type = VirtualNfc::CardType::Unknown;
    persisted.setCard(unknown);
    assert(!persisted.authenticate(availableKey, VirtualNfc::factoryKey()));
    assert(!persisted.getAvailableKeyNo(availableKey));

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

    HostWebsocket websocket(runtime, "http://localhost:3001");
    assert(websocket.send("outbound"));
    assert(!websocket.send(nullptr, 0));

    std::filesystem::remove_all(root);
}
